import { createHash, randomUUID } from 'node:crypto';
import * as k8s from '@kubernetes/client-node';
import { MOCK_RESOURCES } from '@/lib/k8s/mock/fixtures';
import { createKubeConfig, discoverLiveResources, kubernetesErrorStatus } from '@/lib/k8s/discovery';
import type { ConnectionSettings, K8sResource } from '@/lib/types';
import type { ImageInventoryItem, ImageScan, ImageScanResources, ImageScanStep, ScanStatus, Vulnerability } from './types';
import { ensureProjectNamespace, projectName } from '@/lib/k8s/project-resources';

const scans = new Map<string, ImageScan>();
const inventories = new Map<string, Set<string>>();
const inventoryConnections = new Map<string, Partial<ConnectionSettings>>();
const runs = new Map<string, { context?: string; settings: Partial<ConnectionSettings>; job: string; namespace: string; started: number }>();
const SCAN_RECORD_COMPONENT = 'image-scan-record';
const SCAN_RECORD_KEY = 'scan.json';
const MAX_SCAN_RECORD_BYTES = 900_000;
export const imageIdentityKey = (identity: string) => createHash('sha256').update(identity).digest('hex');
const terminal = new Set<ScanStatus>(['completed', 'completed-with-warnings', 'failed']);
type ScanProgressReporter = (step: ImageScanStep) => void;

function updateScanStep(scan: ImageScan, reporter: ScanProgressReporter | undefined, step: ImageScanStep) {
  scan.steps = [...(scan.steps ?? []).filter(item => item.id !== step.id), step];
  reporter?.(step);
}

function failRunningStep(scan: ImageScan, reporter: ScanProgressReporter | undefined, detail: string) {
  const running = scan.steps?.findLast(step => step.status === 'running');
  if (running) updateScanStep(scan, reporter, { ...running, status: 'failed', detail });
}

function imageParts(image: string) {
  const path = image.split('@')[0], last = path.split('/').at(-1) ?? path, digest = image.split('@')[1];
  return { shortName: last.includes(':') ? last.slice(0, last.lastIndexOf(':')) : last, registry: path.includes('/') && /[.:]/.test(path.split('/')[0]) ? path.split('/')[0] : 'docker.io', tag: digest ? `@${digest}` : last.includes(':') ? last.slice(last.lastIndexOf(':') + 1) : 'latest' };
}
function scanRecordName(imageId: string) { return `klystr-scan-${imageId.slice(0, 32)}`; }

function serializedScanRecord(scan: ImageScan) {
  let vulnerabilities = scan.vulnerabilities;
  let value = JSON.stringify(scan);
  while (Buffer.byteLength(value, 'utf8') > MAX_SCAN_RECORD_BYTES && vulnerabilities.length) {
    vulnerabilities = vulnerabilities.slice(0, Math.floor(vulnerabilities.length * 0.75));
    value = JSON.stringify({ ...scan, vulnerabilities });
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_SCAN_RECORD_BYTES) throw new Error('Scan status is too large to persist.');
  return `${value}\n`;
}

async function persistScanRecord(core: k8s.CoreV1Api, namespace: string, scan: ImageScan) {
  const name = scanRecordName(scan.imageId);
  const data = { [SCAN_RECORD_KEY]: serializedScanRecord(scan) };
  const labels = {
    'app.kubernetes.io/name': 'klystr-image-scan',
    'app.kubernetes.io/managed-by': 'klystr',
    'app.kubernetes.io/component': SCAN_RECORD_COMPONENT,
  };
  try {
    const existing = await core.readNamespacedConfigMap({ name, namespace });
    await core.replaceNamespacedConfigMap({ name, namespace, body: { ...existing, data } });
  } catch (error) {
    if (kubernetesErrorStatus(error) !== 404) throw error;
    await core.createNamespacedConfigMap({ namespace, body: { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name, namespace, labels }, data } });
  }
}

function validStoredScan(value: string | undefined): ImageScan | null {
  if (!value) return null;
  try {
    const scan = JSON.parse(value) as ImageScan;
    if (!/^[a-f0-9]{64}$/.test(scan.imageId) || !scan.id || !scan.image || !scan.requestedAt || !Array.isArray(scan.vulnerabilities)) return null;
    return { ...scan, cached: true };
  } catch { return null; }
}

async function recoverLiveScans(context: string | undefined, settings: Partial<ConnectionSettings>) {
  const kc = createKubeConfig(settings); if (context) kc.setCurrentContext(context);
  const core = kc.makeApiClient(k8s.CoreV1Api), batch = kc.makeApiClient(k8s.BatchV1Api), namespace = projectName();
  let records: k8s.V1ConfigMapList;
  let jobs: k8s.V1JobList;
  try {
    [records, jobs] = await Promise.all([
      core.listNamespacedConfigMap({ namespace, labelSelector: `app.kubernetes.io/component=${SCAN_RECORD_COMPONENT}` }),
      batch.listNamespacedJob({ namespace, labelSelector: 'app.kubernetes.io/name=klystr-trivy' }),
    ]);
  } catch (error) {
    if (kubernetesErrorStatus(error) === 404) return;
    throw error;
  }
  const recoveredImageIds = new Set<string>();
  for (const record of records.items) {
    const scan = validStoredScan(record.data?.[SCAN_RECORD_KEY]);
    if (scan) { scans.set(scan.imageId, scan); recoveredImageIds.add(scan.imageId); }
  }
  const activeImageIds = new Set<string>();
  for (const job of jobs.items) {
    const imageId = job.metadata?.annotations?.['klystr.io/image-id'];
    const image = job.metadata?.annotations?.['klystr.io/image'];
    const scanId = job.metadata?.labels?.['klystr.io/scan-id'];
    if (!imageId || !/^[a-f0-9]{64}$/.test(imageId) || !image || !scanId || !job.metadata?.name) continue;
    const requestedAt = job.metadata.annotations?.['klystr.io/requested-at'] || job.metadata.creationTimestamp?.toISOString() || new Date().toISOString();
    const scan = scans.get(imageId) ?? { id: scanId, imageId, image, status: 'queued', requestedAt, scanner: 'Trivy', scannerVersion: '', vulnerabilities: [] };
    scans.set(imageId, scan);
    recoveredImageIds.add(imageId);
    activeImageIds.add(imageId);
    const needsFailureDetails = scan.status === 'failed' && /Inspect the Job events|did not expose a failure message/i.test(scan.error ?? '');
    if (!terminal.has(scan.status) || (job.status?.succeeded && !scan.completedAt) || needsFailureDetails) {
      runs.set(imageId, { context, settings: { ...settings }, job: job.metadata.name, namespace, started: Date.parse(requestedAt) || Date.now() });
    }
  }
  for (const imageId of recoveredImageIds) {
    const scan = scans.get(imageId);
    if (!scan) continue;
    if (!terminal.has(scan.status) && !activeImageIds.has(scan.imageId)) {
      scan.status = 'failed';
      scan.error = 'The Kubernetes scan Job no longer exists. Start a new analysis to retry.';
    }
  }
}

function buildInventory(resources: K8sResource[]) {
  const found = new Map<string, ImageInventoryItem>();
  for (const pod of resources.filter(r => r.kind === 'Pod')) for (const container of pod.containers ?? []) {
    const identity = container.imageId ?? container.image;
    const id = imageIdentityKey(identity);
    const item = found.get(id) ?? { id, image: container.image, ...imageParts(container.image), namespaces: [], usages: [], status: 'not-analyzed' as ScanStatus };
    const namespace = pod.namespace ?? 'default'; if (!item.namespaces.includes(namespace)) item.namespaces.push(namespace);
    item.usages.push({ pod: pod.name, namespace, container: container.name, status: pod.status, node: pod.nodeName, imageIdentity: identity }); item.status = scans.get(item.id)?.status ?? item.status; found.set(id, item);
  }
  return [...found.values()].sort((a, b) => a.image.localeCompare(b.image));
}
export async function getImageInventory(context: string | undefined, settings: Partial<ConnectionSettings>) {
  const resources = settings.mode === 'mock' ? MOCK_RESOURCES : (await discoverLiveResources(context, settings)).resources;
  if (settings.mode !== 'mock') await recoverLiveScans(context, settings);
  const items = buildInventory(resources); inventories.set(context ?? 'current', new Set(items.map(i => i.image))); inventoryConnections.set(context ?? 'current', { ...settings }); return items;
}

function mockFindings(image: string): Vulnerability[] {
  const seed = parseInt(imageIdentityKey(image).slice(0, 4), 16), severities: Vulnerability['severity'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  return Array.from({ length: 3 + seed % 6 }, (_, i) => ({ id: `CVE-202${i % 5}-${1000 + seed % 8000 + i}`, severity: severities[(seed + i) % 4], packageName: ['openssl', 'libc6', 'zlib', 'curl'][i % 4], installedVersion: `1.${i}.${seed % 10}`, fixedVersion: i % 3 ? `1.${i}.${seed % 10 + 1}` : undefined, packageType: 'os', title: 'Known package vulnerability', cvss: 4 + (seed + i) % 6 }));
}
function updateMock(scan: ImageScan) {
  if (terminal.has(scan.status)) return scan; const age = Date.now() - Date.parse(scan.requestedAt);
  scan.status = age < 800 ? 'requested' : age < 1800 ? 'queued' : age < 3000 ? 'pulling' : age < 5000 ? 'scanning' : age < 6500 ? 'processing' : 'completed';
  if (scan.status === 'completed') { scan.completedAt ??= new Date().toISOString(); if (!scan.vulnerabilities.length) scan.vulnerabilities = mockFindings(scan.image); } return scan;
}
function scannerJobName(id: string) { return `klystr-trivy-${id.slice(0, 12)}`; }

async function requireScanControllerAccess(kc: k8s.KubeConfig, namespace: string) {
  const auth = kc.makeApiClient(k8s.AuthorizationV1Api);
  const checks = [
    { verb: 'create', group: 'batch', resource: 'jobs', command: `kubectl auth can-i create jobs -n ${namespace}` },
    { verb: 'get', group: 'batch', resource: 'jobs', command: `kubectl auth can-i get jobs -n ${namespace}` },
    { verb: 'list', group: 'batch', resource: 'jobs', command: `kubectl auth can-i list jobs -n ${namespace}` },
    { verb: 'get', group: '', resource: 'serviceaccounts', command: `kubectl auth can-i get serviceaccounts -n ${namespace}` },
    { verb: 'get', group: '', resource: 'pods', command: `kubectl auth can-i get pods -n ${namespace}` },
    { verb: 'list', group: '', resource: 'pods', command: `kubectl auth can-i list pods -n ${namespace}` },
    { verb: 'get', group: '', resource: 'pods', subresource: 'log', command: `kubectl auth can-i get pods/log -n ${namespace}` },
    { verb: 'get', group: '', resource: 'configmaps', command: `kubectl auth can-i get configmaps -n ${namespace}` },
    { verb: 'list', group: '', resource: 'configmaps', command: `kubectl auth can-i list configmaps -n ${namespace}` },
    { verb: 'create', group: '', resource: 'configmaps', command: `kubectl auth can-i create configmaps -n ${namespace}` },
    { verb: 'update', group: '', resource: 'configmaps', command: `kubectl auth can-i update configmaps -n ${namespace}` },
  ];
  const denied: string[] = [];
  for (const check of checks) {
    const review = await auth.createSelfSubjectAccessReview({ body: { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', spec: { resourceAttributes: { namespace, verb: check.verb, group: check.group, resource: check.resource, subresource: check.subresource } } } });
    if (!review.status?.allowed) denied.push(check.command);
  }
  if (denied.length) throw new Error(`Image scan preflight denied. Required permissions:\n${denied.join('\n')}`);
}

async function requireScanDependencies(core: k8s.CoreV1Api, namespace: string) {
  const serviceAccount = process.env.TRIVY_SERVICE_ACCOUNT || `${namespace}-scanner`;
  try { await core.readNamespacedServiceAccount({ name: serviceAccount, namespace }); }
  catch (error) {
    if (kubernetesErrorStatus(error) === 404) throw new Error(`Scanner ServiceAccount ${namespace}/${serviceAccount} does not exist. Apply deploy/image-scanner-rbac.yaml before starting an image analysis.`);
    throw error;
  }
  for (const secretName of [process.env.TRIVY_REGISTRY_SECRET, process.env.TRIVY_JOB_IMAGE_PULL_SECRET].filter((name): name is string => Boolean(name))) {
    try { await core.readNamespacedSecret({ name: secretName, namespace }); }
    catch (error) {
      if (kubernetesErrorStatus(error) === 404) throw new Error(`Required scanner Secret ${namespace}/${secretName} does not exist.`);
      throw error;
    }
  }
}

async function ensureScannerServiceAccount(kc: k8s.KubeConfig, core: k8s.CoreV1Api, namespace: string) {
  const name = process.env.TRIVY_SERVICE_ACCOUNT || `${namespace}-scanner`;
  try { await core.readNamespacedServiceAccount({ name, namespace }); return { name, created: false }; }
  catch (error) {
    if (kubernetesErrorStatus(error) !== 404) throw error;
  }
  const auth = kc.makeApiClient(k8s.AuthorizationV1Api);
  const review = await auth.createSelfSubjectAccessReview({ body: { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', spec: { resourceAttributes: { namespace, verb: 'create', group: '', resource: 'serviceaccounts' } } } });
  if (!review.status?.allowed) throw new Error(`Scanner ServiceAccount ${namespace}/${name} is missing. Required permission:\nkubectl auth can-i create serviceaccounts -n ${namespace}`);
  try {
    await core.createNamespacedServiceAccount({ namespace, body: { apiVersion: 'v1', kind: 'ServiceAccount', metadata: { name, namespace, labels: { 'app.kubernetes.io/name': 'klystr-scanner', 'app.kubernetes.io/managed-by': 'klystr' } }, automountServiceAccountToken: false } });
    return { name, created: true };
  } catch (error) {
    if (kubernetesErrorStatus(error) !== 409) throw error;
    await core.readNamespacedServiceAccount({ name, namespace });
    return { name, created: false };
  }
}

async function createJob(context: string | undefined, settings: Partial<ConnectionSettings>, scan: ImageScan, resourceConfiguration: ImageScanResources, report?: ScanProgressReporter) {
  const kc = createKubeConfig(settings); if (context) kc.setCurrentContext(context);
  const core = kc.makeApiClient(k8s.CoreV1Api);
  updateScanStep(scan, report, { id: 'namespace', label: 'Checking project namespace', status: 'running' });
  const namespace = await ensureProjectNamespace(core);
  updateScanStep(scan, report, { id: 'namespace', label: 'Project namespace ready', status: 'completed', detail: namespace, resource: { kind: 'Namespace', name: namespace, namespace } });
  updateScanStep(scan, report, { id: 'permissions', label: 'Checking Kubernetes permissions', status: 'running' });
  await requireScanControllerAccess(kc, namespace);
  updateScanStep(scan, report, { id: 'permissions', label: 'Kubernetes permissions verified', status: 'completed' });
  const scannerName = process.env.TRIVY_SERVICE_ACCOUNT || `${namespace}-scanner`;
  updateScanStep(scan, report, { id: 'serviceaccount', label: 'Applying scanner ServiceAccount', status: 'running', resource: { kind: 'ServiceAccount', name: scannerName, namespace } });
  const scannerAccount = await ensureScannerServiceAccount(kc, core, namespace);
  updateScanStep(scan, report, { id: 'serviceaccount', label: 'Scanner ServiceAccount applied', status: 'completed', detail: scannerAccount.created ? 'Created by klystr' : 'Already exists', resource: { kind: 'ServiceAccount', name: scannerAccount.name, namespace } });
  await requireScanDependencies(core, namespace);
  const batch = kc.makeApiClient(k8s.BatchV1Api), name = scannerJobName(scan.id);
  const registrySecret = process.env.TRIVY_REGISTRY_SECRET, pullSecret = process.env.TRIVY_JOB_IMAGE_PULL_SECRET;
  const labels = { 'app.kubernetes.io/name': 'klystr-trivy', 'klystr.io/scan-id': scan.id };
  const annotations = { 'klystr.io/image-id': scan.imageId, 'klystr.io/image': scan.image, 'klystr.io/requested-at': scan.requestedAt, 'klystr.io/resource-constraints': resourceConfiguration.constrained ? 'enabled' : 'disabled' };
  const volumeMounts: k8s.V1VolumeMount[] = [{ name: 'cache', mountPath: '/cache' }, { name: 'tmp', mountPath: '/tmp' }];
  const volumes: k8s.V1Volume[] = [{ name: 'cache', emptyDir: {} }, { name: 'tmp', emptyDir: {} }];
  if (registrySecret) {
    volumeMounts.push({ name: 'registry-auth', mountPath: '/registry-auth', readOnly: true });
    volumes.push({ name: 'registry-auth', secret: { secretName: registrySecret, items: [{ key: '.dockerconfigjson', path: 'config.json' }] } });
  }
  const body: k8s.V1Job = {
    apiVersion: 'batch/v1', kind: 'Job', metadata: { name, namespace, labels, annotations },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: Number(process.env.IMAGE_SCAN_TIMEOUT_SECONDS || 600),
      ttlSecondsAfterFinished: Number(process.env.IMAGE_SCAN_JOB_TTL_SECONDS || 86400),
      template: { metadata: { labels }, spec: {
        restartPolicy: 'Never', automountServiceAccountToken: false,
        serviceAccountName: process.env.TRIVY_SERVICE_ACCOUNT || `${namespace}-scanner`,
        imagePullSecrets: pullSecret ? [{ name: pullSecret }] : undefined,
        securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
        containers: [{
          name: 'trivy', image: process.env.TRIVY_IMAGE || 'ghcr.io/aquasecurity/trivy:0.74.0', imagePullPolicy: 'IfNotPresent',
          env: registrySecret ? [{ name: 'DOCKER_CONFIG', value: '/registry-auth' }] : undefined,
          args: ['image', '--format', 'json', '--scanners', 'vuln', '--timeout', `${process.env.IMAGE_SCAN_TIMEOUT_SECONDS || 600}s`, '--cache-dir', '/cache', '--no-progress', '--quiet', scan.image],
          resources: resourceConfiguration.constrained ? { requests: resourceConfiguration.requests, limits: resourceConfiguration.limits } : undefined,
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } }, volumeMounts,
        }], volumes,
      } },
    },
  };
  const recordName = scanRecordName(scan.imageId);
  updateScanStep(scan, report, { id: 'record', label: 'Applying scan record', status: 'running', resource: { kind: 'ConfigMap', name: recordName, namespace } });
  await persistScanRecord(core, namespace, scan);
  updateScanStep(scan, report, { id: 'record', label: 'Scan record applied', status: 'completed', resource: { kind: 'ConfigMap', name: recordName, namespace } });
  const resourceDetail = resourceConfiguration.constrained
    ? `Requests: ${resourceConfiguration.requests?.cpu} CPU, ${resourceConfiguration.requests?.memory} memory · Limits: ${resourceConfiguration.limits?.cpu} CPU, ${resourceConfiguration.limits?.memory} memory`
    : 'Unconstrained: no CPU or memory requests/limits';
  updateScanStep(scan, report, { id: 'job', label: 'Applying Trivy scan Job', status: 'running', detail: resourceDetail, resource: { kind: 'Job', name, namespace } });
  try {
    await batch.createNamespacedJob({ namespace, body });
    runs.set(scan.imageId, { context, settings: { ...settings }, job: name, namespace, started: Date.now() }); scan.status = 'queued';
    updateScanStep(scan, report, { id: 'job', label: 'Trivy scan Job applied', status: 'completed', resource: { kind: 'Job', name, namespace } });
    updateScanStep(scan, report, { id: 'pod', label: 'Waiting for scanner Pod', status: 'running', resource: { kind: 'Pod', name: `${name}-…`, namespace } });
    await persistScanRecord(core, namespace, scan);
  } catch (error) {
    scan.status = 'failed'; scan.error = error instanceof Error ? error.message : 'Unable to create Kubernetes scan Job.';
    updateScanStep(scan, report, { id: 'job', label: 'Trivy scan Job failed', status: 'failed', detail: scan.error, resource: { kind: 'Job', name, namespace } });
    await persistScanRecord(core, namespace, scan).catch(() => undefined);
    throw error;
  }
}

function normalize(raw: unknown): Vulnerability[] {
  const doc = raw as { Results?: Array<{ Type?: string; Vulnerabilities?: Array<Record<string, unknown>> }> }, findings: Vulnerability[] = [];
  for (const result of doc.Results ?? []) for (const v of result.Vulnerabilities ?? []) findings.push({ id: String(v.VulnerabilityID ?? 'Unknown'), severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(String(v.Severity)) ? String(v.Severity) : 'UNKNOWN') as Vulnerability['severity'], packageName: String(v.PkgName ?? ''), installedVersion: String(v.InstalledVersion ?? ''), fixedVersion: v.FixedVersion ? String(v.FixedVersion) : undefined, packageType: result.Type ?? 'unknown', title: String(v.Title ?? v.Description ?? 'No description'), reference: Array.isArray(v.References) ? String(v.References[0] ?? '') : undefined });
  return findings.slice(0, Number(process.env.IMAGE_SCAN_MAX_FINDINGS || 5000));
}

async function latestResourceWarning(core: k8s.CoreV1Api, namespace: string, kind: 'Job' | 'Pod', name: string) {
  if (!name) return '';
  try {
    const events = await core.listNamespacedEvent({ namespace, fieldSelector: `involvedObject.kind=${kind},involvedObject.name=${name},type=Warning` });
    const latest = [...events.items].sort((left, right) => {
      const timestamp = (event: k8s.CoreV1Event) => new Date(event.eventTime ?? event.lastTimestamp ?? event.metadata?.creationTimestamp ?? 0).getTime();
      return timestamp(right) - timestamp(left);
    })[0];
    if (!latest) return '';
    return [latest.reason, latest.message].filter(Boolean).join(': ').slice(0, 2_000);
  } catch { return ''; }
}

const latestJobWarning = (core: k8s.CoreV1Api, namespace: string, name: string) => latestResourceWarning(core, namespace, 'Job', name);
const latestPodWarning = (core: k8s.CoreV1Api, namespace: string, name: string) => latestResourceWarning(core, namespace, 'Pod', name);

async function pollLive(scan: ImageScan) {
  const run = runs.get(scan.imageId); if (!run) return scan;
  const previousStatus = scan.status;
  const previousSteps = JSON.stringify(scan.steps ?? []);
  let recordCore: k8s.CoreV1Api | undefined;
  try {
    const kc = createKubeConfig(run.settings); if (run.context) kc.setCurrentContext(run.context); const batch = kc.makeApiClient(k8s.BatchV1Api), core = kc.makeApiClient(k8s.CoreV1Api); recordCore = core;
    const job = await batch.readNamespacedJob({ name: run.job, namespace: run.namespace });
    const failedCondition = job.status?.conditions?.find(condition => condition.type === 'Failed' && condition.status === 'True');
    if (job.status?.failed || failedCondition) {
      let dependencyError = '';
      try { await requireScanDependencies(core, run.namespace); }
      catch (error) { dependencyError = error instanceof Error ? error.message : 'A scanner dependency is unavailable.'; }
      const eventError = await latestJobWarning(core, run.namespace, run.job);
      scan.status = 'failed';
      scan.error = dependencyError || eventError || [failedCondition?.reason, failedCondition?.message].filter(Boolean).join(': ') || 'Trivy Job failed, but Kubernetes did not expose a failure message.';
      updateScanStep(scan, undefined, { id: 'execution', label: 'Scan Job failed', status: 'failed', detail: scan.error, resource: { kind: 'Job', name: run.job, namespace: run.namespace } });
      runs.delete(scan.imageId);
      return scan;
    }
    if (Date.now() - run.started > Number(process.env.IMAGE_SCAN_TIMEOUT_SECONDS || 600) * 1000) {
      scan.status = 'failed';
      scan.error = `Image scan exceeded the ${process.env.IMAGE_SCAN_TIMEOUT_SECONDS || 600}s deadline before producing a report. Inspect Job ${run.namespace}/${run.job} events.`;
      updateScanStep(scan, undefined, { id: 'execution', label: 'Scan deadline exceeded', status: 'failed', detail: scan.error, resource: { kind: 'Job', name: run.job, namespace: run.namespace } });
      runs.delete(scan.imageId);
      return scan;
    }
    const pods = await core.listNamespacedPod({ namespace: run.namespace, labelSelector: `klystr.io/scan-id=${scan.id}` }), pod = pods.items[0];
    if (!pod) { scan.status = 'queued'; updateScanStep(scan, undefined, { id: 'pod', label: 'Waiting for scanner Pod', status: 'running', resource: { kind: 'Pod', name: `${run.job}-…`, namespace: run.namespace } }); return scan; }
    const scheduled = pod.status?.conditions?.find(condition => condition.type === 'PodScheduled');
    if (scheduled?.status === 'False') {
      const schedulingEvent = await latestPodWarning(core, run.namespace, pod.metadata?.name ?? '');
      const reason = schedulingEvent || [scheduled.reason, scheduled.message].filter(Boolean).join(': ') || 'The Kubernetes scheduler has not assigned this Pod to a node.';
      scan.status = 'queued';
      scan.message = `${reason} Free cluster capacity, or retry with lower scan requests or unconstrained execution.`;
      updateScanStep(scan, undefined, { id: 'pod', label: 'Waiting for Pod scheduling', status: 'running', detail: scan.message, resource: { kind: 'Pod', name: pod.metadata?.name ?? run.job, namespace: run.namespace } });
      updateScanStep(scan, undefined, { id: 'execution', label: 'Waiting for cluster capacity', status: 'running', detail: reason, resource: { kind: 'Pod', name: pod.metadata?.name ?? run.job, namespace: run.namespace } });
      return scan;
    }
    const waiting = [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])]
      .map(status => status.state?.waiting)
      .find(state => state?.reason && ['ErrImagePull', 'ImagePullBackOff', 'CreateContainerConfigError', 'CreateContainerError', 'InvalidImageName', 'RunContainerError'].includes(state.reason));
    if (pod.status?.phase === 'Failed' || waiting) {
      scan.status = 'failed';
      scan.error = [waiting?.reason ?? pod.status?.reason ?? 'Scanner Pod failed', waiting?.message ?? pod.status?.message].filter(Boolean).join(': ');
      updateScanStep(scan, undefined, { id: 'execution', label: 'Scanner Pod failed', status: 'failed', detail: scan.error, resource: { kind: 'Pod', name: pod.metadata?.name ?? run.job, namespace: run.namespace } });
      runs.delete(scan.imageId);
      return scan;
    }
    scan.message = undefined;
    updateScanStep(scan, undefined, { id: 'pod', label: 'Scanner Pod scheduled', status: 'completed', detail: pod.status?.phase, resource: { kind: 'Pod', name: pod.metadata?.name ?? run.job, namespace: run.namespace } });
    scan.status = pod.status?.phase === 'Pending' ? 'pulling' : pod.status?.phase === 'Running' ? 'scanning' : 'processing';
    updateScanStep(scan, undefined, { id: 'execution', label: scan.status === 'pulling' ? 'Pulling scanner and target images' : scan.status === 'scanning' ? 'Scanning image with Trivy' : 'Processing scan report', status: 'running', resource: { kind: 'Pod', name: pod.metadata?.name ?? run.job, namespace: run.namespace } });
    if (job.status?.succeeded && pod.metadata?.name) { const report = await core.readNamespacedPodLog({ name: pod.metadata.name, namespace: run.namespace, container: 'trivy' }); if (report.length > Number(process.env.IMAGE_SCAN_MAX_REPORT_BYTES || 8_000_000)) throw new Error('Report size limit exceeded'); scan.vulnerabilities = normalize(JSON.parse(report)); scan.status = 'completed'; scan.completedAt = new Date().toISOString(); scan.scannerVersion = (process.env.TRIVY_IMAGE || 'trivy:0.74.0').split(':').at(-1) ?? ''; updateScanStep(scan, undefined, { id: 'execution', label: 'Image analysis completed', status: 'completed', detail: `${scan.vulnerabilities.length} vulnerabilities found`, resource: { kind: 'Job', name: run.job, namespace: run.namespace } }); runs.delete(scan.imageId); }
  } catch (error) { const status = kubernetesErrorStatus(error); if (status === 401 || status === 403) { scan.status = 'failed'; scan.error = status === 401 ? 'Kubernetes authentication failed.' : 'Kubernetes denied access needed to monitor the scan Job.'; runs.delete(scan.imageId); } else if (error instanceof SyntaxError) { scan.status = 'failed'; scan.error = 'Trivy returned invalid JSON.'; runs.delete(scan.imageId); } }
  finally { if (recordCore && (scan.status !== previousStatus || JSON.stringify(scan.steps ?? []) !== previousSteps || terminal.has(scan.status))) await persistScanRecord(recordCore, run.namespace, scan).catch(() => undefined); }
  return scan;
}

export async function startImageScan(context: string | undefined, imageId: string, image: string, settings: Partial<ConnectionSettings>, resourceConfiguration: ImageScanResources, report?: ScanProgressReporter) {
  settings = settings.mode ? settings : inventoryConnections.get(context ?? 'current') ?? settings;
  if (!inventories.get(context ?? 'current')?.has(image)) throw new Error('Image is not in the server-discovered inventory. Refresh and retry.');
  const existing = scans.get(imageId); if (existing && !terminal.has(existing.status)) return existing;
  if (settings.mode !== 'mock' && runs.size >= Math.max(1, Number(process.env.IMAGE_SCAN_MAX_CONCURRENT || 2))) throw new Error('Scan concurrency limit reached. Try again shortly.');
  const scan: ImageScan = { id: randomUUID(), imageId, image, status: 'requested', requestedAt: new Date().toISOString(), scanner: 'Trivy', scannerVersion: '', resourceConfiguration, vulnerabilities: [], steps: [] }; scans.set(imageId, scan);
  if (settings.mode === 'mock') { updateScanStep(scan, report, { id: 'mock', label: 'Mock scan initialized', status: 'completed', detail: 'No Kubernetes resources were created.' }); return scan; }
  try { await createJob(context, settings, scan, resourceConfiguration, report); return scan; } catch (error) { const status = kubernetesErrorStatus(error); const message = status === 403 ? 'Kubernetes denied creation of the Trivy Job or scan record. Grant Job, ServiceAccount, and ConfigMap create/get/list/update plus Pod list/get/log permissions in the scanner namespace.' : status === 401 ? 'Kubernetes authentication failed while creating the scan Job.' : error instanceof Error ? error.message : 'Unable to create scan Job'; scan.status = 'failed'; scan.error = message; failRunningStep(scan, report, message); throw new Error(message); }
}
export async function getImageScan(imageId: string) { const scan = scans.get(imageId); return scan ? runs.has(imageId) ? pollLive(scan) : updateMock(scan) : null; }
