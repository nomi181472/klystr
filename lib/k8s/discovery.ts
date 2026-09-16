/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import * as k8s from '@kubernetes/client-node';
import type { K8sKind } from '@/config/resource-types';
import type { ConnectionSettings, DiscoveryWarning, K8sResource, ResourcePort, ContainerInfo, EnvVar, VolumeMount, PodMetricsResponse } from '@/lib/types';
import type { LabelPermissionResponse, PermissionCheck, PermissionsResponse } from '@/lib/types';
import { MATRIX_VERBS, PERMISSION_TARGETS, SENSITIVE_CHECKS, type PermissionVerb } from '@/lib/k8s/permission-catalog';
import { createLogger } from '@/lib/logger';
import { resolveConnection } from '@/lib/k8s/connection-registry';

const logger = createLogger('kubernetes');

type KubernetesObject = Record<string, any>;

const resourceKinds: K8sKind[] = [
  'Namespace', 'Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet',
  'Job', 'CronJob', 'Service', 'Endpoints', 'EndpointSlice', 'Ingress', 'ConfigMap', 'Secret', 'ServiceAccount',
  'PersistentVolumeClaim', 'PersistentVolume', 'StorageClass', 'NetworkPolicy',
  'HorizontalPodAutoscaler',
];

function apiResource(kind: K8sKind, clients: Record<string, any>, namespace?: string, limit?: number): Promise<any> {
  const calls: Record<string, () => Promise<any>> = {
    Namespace: () => clients.core.listNamespace(),
    Pod: () => namespace ? clients.core.listNamespacedPod({ namespace, limit }) : clients.core.listPodForAllNamespaces(),
    Service: () => namespace ? clients.core.listNamespacedService({ namespace, limit }) : clients.core.listServiceForAllNamespaces(),
    Endpoints: () => namespace ? clients.core.listNamespacedEndpoints({ namespace, limit }) : clients.core.listEndpointsForAllNamespaces(),
    EndpointSlice: () => namespace ? clients.discovery.listNamespacedEndpointSlice({ namespace, limit }) : clients.discovery.listEndpointSliceForAllNamespaces(),
    ConfigMap: () => namespace ? clients.core.listNamespacedConfigMap({ namespace, limit }) : clients.core.listConfigMapForAllNamespaces(),
    Secret: () => namespace ? clients.core.listNamespacedSecret({ namespace, limit }) : clients.core.listSecretForAllNamespaces(),
    ServiceAccount: () => namespace ? clients.core.listNamespacedServiceAccount({ namespace, limit }) : clients.core.listServiceAccountForAllNamespaces(),
    PersistentVolume: () => clients.core.listPersistentVolume(),
    PersistentVolumeClaim: () => namespace ? clients.core.listNamespacedPersistentVolumeClaim({ namespace, limit }) : clients.core.listPersistentVolumeClaimForAllNamespaces(),
    Deployment: () => namespace ? clients.apps.listNamespacedDeployment({ namespace, limit }) : clients.apps.listDeploymentForAllNamespaces(),
    StatefulSet: () => namespace ? clients.apps.listNamespacedStatefulSet({ namespace, limit }) : clients.apps.listStatefulSetForAllNamespaces(),
    DaemonSet: () => namespace ? clients.apps.listNamespacedDaemonSet({ namespace, limit }) : clients.apps.listDaemonSetForAllNamespaces(),
    ReplicaSet: () => namespace ? clients.apps.listNamespacedReplicaSet({ namespace, limit }) : clients.apps.listReplicaSetForAllNamespaces(),
    Job: () => namespace ? clients.batch.listNamespacedJob({ namespace, limit }) : clients.batch.listJobForAllNamespaces(),
    CronJob: () => namespace ? clients.batch.listNamespacedCronJob({ namespace, limit }) : clients.batch.listCronJobForAllNamespaces(),
    Ingress: () => namespace ? clients.networking.listNamespacedIngress({ namespace, limit }) : clients.networking.listIngressForAllNamespaces(),
    NetworkPolicy: () => namespace ? clients.networking.listNamespacedNetworkPolicy({ namespace, limit }) : clients.networking.listNetworkPolicyForAllNamespaces(),
    StorageClass: () => clients.storage.listStorageClass(),
    HorizontalPodAutoscaler: () => namespace ? clients.autoscaling.listNamespacedHorizontalPodAutoscaler({ namespace, limit }) : clients.autoscaling.listHorizontalPodAutoscalerForAllNamespaces(),
  };
  return calls[kind]();
}

function responseStatus(error: any, message: string): number | string | undefined {
  return error?.response?.statusCode
    ?? error?.response?.body?.code
    ?? error?.body?.code
    ?? error?.statusCode
    ?? message.match(/HTTP-Code:\s*(\d+)/i)?.[1];
}

function ports(spec: any): ResourcePort[] | undefined {
  const values = spec?.ports ?? spec?.containers?.flatMap((container: any) => container.ports ?? []) ?? [];
  return values.length ? values.map((port: any) => ({ name: port.name, port: port.port ?? port.containerPort, protocol: port.protocol ?? 'TCP', targetPort: port.targetPort })) : undefined;
}

function envVars(containers: any[]): EnvVar[] {
  return containers.flatMap((container: any) => (container.env ?? []).map((env: any) => ({
    name: env.name,
    value: env.value,
    valueFrom: env.valueFrom,
    fromSecret: !!env.valueFrom?.secretKeyRef,
  })));
}

function volumeMounts(containers: any[], volumes: any[]): VolumeMount[] {
  const byName = new Map(volumes.map((volume: any) => [volume.name, volume]));
  return containers.flatMap((container: any) => (container.volumeMounts ?? []).map((mount: any) => {
    const volume = byName.get(mount.name);
    return {
      name: mount.name,
      mountPath: mount.mountPath,
      configMapName: volume?.configMap?.name,
      secretName: volume?.secret?.secretName,
      pvcName: volume?.persistentVolumeClaim?.claimName,
    };
  }));
}

function toResource(kind: K8sKind, object: KubernetesObject): K8sResource {
  const metadata = object.metadata ?? {};
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  const podSpec = spec.template?.spec ?? spec.jobTemplate?.spec?.template?.spec ?? spec;
  const regularContainers = podSpec.containers ?? [];
  const initContainers = podSpec.initContainers ?? [];
  const ephemeralContainers = podSpec.ephemeralContainers ?? [];
  const containers = [...regularContainers, ...initContainers, ...ephemeralContainers];
  const resource: K8sResource = {
    uid: metadata.uid ?? `${kind}/${metadata.namespace ?? 'cluster'}/${metadata.name}`,
    kind, apiVersion: object.apiVersion ?? 'v1', name: metadata.name,
    namespace: metadata.namespace ?? null, labels: metadata.labels ?? {}, annotations: metadata.annotations ?? {},
    status: typeof status === 'string' ? status : status.phase ?? status.conditions?.find((condition: any) => condition.status === 'True')?.type,
    clusterIP: spec.clusterIP, podIP: status.podIP, ports: ports(spec), selector: spec.selector?.matchLabels ?? spec.selector,
    serviceType: kind === 'Service' ? (spec.clusterIP === 'None' ? 'Headless' : spec.type ?? 'ClusterIP') : undefined,
    ownerReferences: metadata.ownerReferences?.map((owner: any) => ({ kind: owner.kind, name: owner.name, uid: owner.uid })),
    discoveredAt: new Date().toISOString(),
    nodeName: spec.nodeName,
  };
  if (containers.length) {
    resource.envVars = envVars(containers);
    resource.volumeMounts = volumeMounts(containers, podSpec.volumes ?? []);
    resource.containers = containers.map((container: any, index: number): ContainerInfo => {
      const isInit = index >= regularContainers.length;
      const isEphemeral = index >= regularContainers.length + initContainers.length;
      const sidecarName = /(?:sidecar|proxy|envoy|istio|linkerd|fluent|vector|otel|telemetry)/i.test(container.name ?? '');
      const type = isEphemeral ? 'ephemeral' : isInit ? (container.restartPolicy === 'Always' ? 'sidecar' : 'init') : sidecarName ? 'sidecar' : index === 0 ? 'app' : 'container';
      const statusList = isEphemeral ? status.ephemeralContainerStatuses : isInit ? status.initContainerStatuses : status.containerStatuses;
      const containerStatus = statusList?.find((entry: any) => entry.name === container.name);
      const containerState = containerStatus?.state;
      const containerStateLabel = containerState?.waiting
        ? containerState.waiting.reason ?? 'Waiting'
        : containerState?.terminated
          ? containerState.terminated.reason ?? (containerState.terminated.exitCode === 0 ? 'Completed' : `Exited ${containerState.terminated.exitCode}`)
          : containerState?.running
            ? containerStatus.ready === false ? 'NotReady' : 'Running'
            : undefined;
      return { name: container.name, image: container.image ?? '', imageId: containerStatus?.imageID, ports: ports(container) ?? [], envVars: (container.env ?? []).map((env: any) => ({ name: env.name, value: env.value, valueFrom: env.valueFrom, fromSecret: !!env.valueFrom?.secretKeyRef })), volumeMounts: volumeMounts([container], podSpec.volumes ?? []), command: container.command, args: container.args, type, status: containerStateLabel, ready: containerStatus?.ready, restartCount: containerStatus?.restartCount };
    });
  }
  return resource;
}

interface DiscoveryScope {
  namespaces?: string[];
  kinds?: K8sKind[];
  limitPerKind?: number;
}

function logKubeFailure(stage: string, extra: Record<string, unknown>, error: unknown) {
  logger.error('live request failed', {
    stage,
    ...extra,
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
    code: (error as any)?.code,
    status: (error as any)?.statusCode ?? (error as any)?.response?.statusCode,
    stack: error instanceof Error ? error.stack : undefined,
    body: (error as any)?.response?.body ?? (error as any)?.body,
  });
}

export async function discoverLiveNamespaces(contextName?: string, settings?: Partial<ConnectionSettings>): Promise<{ namespaces: string[]; topologyNodes: { name: string; role: 'control-plane' | 'worker' | 'unknown'; status?: string }[]; warnings: DiscoveryWarning[]; contextName: string }> {
  const kubeConfig = createKubeConfig(settings);
  const selectedContext = contextName ?? kubeConfig.getCurrentContext();
  if (selectedContext) kubeConfig.setCurrentContext(selectedContext);
  const cluster = kubeConfig.getCurrentCluster();
  logger.info('namespace discovery starting', {
    context: selectedContext || 'current',
    server: cluster?.server ?? 'unknown',
    connectionConfigured: Boolean(settings?.connectionId),
  });
  const core = kubeConfig.makeApiClient(k8s.CoreV1Api);
  const warnings: DiscoveryWarning[] = [];
  let namespaces: string[] = [];
  let topologyNodes: { name: string; role: 'control-plane' | 'worker' | 'unknown'; status?: string }[] = [];
  try {
    const namespaceResponse = await core.listNamespace();
    namespaces = (namespaceResponse.items ?? []).map(item => item.metadata?.name).filter((name): name is string => Boolean(name)).sort();
  } catch (error: any) {
    logKubeFailure('listNamespace', { context: selectedContext || 'current', server: cluster?.server ?? 'unknown' }, error);
    const message = error instanceof Error ? error.message : 'Unable to list namespaces';
    const status = responseStatus(error, message);
    const forbidden = status === 403 || status === '403';
    warnings.push({ type: forbidden ? 'rbac' : 'error', resourceType: 'Namespace', message: forbidden ? 'Cannot list Namespace: forbidden' : message });
  }
  try {
    const nodeResponse = await core.listNode();
    const discoveredNodes = (nodeResponse.items ?? []).map(node => {
      const name = node.metadata?.name;
      if (!name) return null;
      const labels = node.metadata?.labels ?? {};
      const role = labels['node-role.kubernetes.io/control-plane'] !== undefined
        || labels['node-role.kubernetes.io/master'] !== undefined
        ? 'control-plane' as const
        : 'worker' as const;
      const ready = node.status?.conditions?.find(condition => condition.type === 'Ready');
      return { name, role, status: ready?.status === 'True' ? 'Ready' : ready?.status === 'False' ? 'NotReady' : 'Unknown' };
    }).filter((node): node is { name: string; role: 'control-plane' | 'worker'; status: string } => node !== null);
    topologyNodes = discoveredNodes;
  } catch (error: any) {
    logKubeFailure('listNode', { context: selectedContext || 'current', server: cluster?.server ?? 'unknown' }, error);
    const message = error instanceof Error ? error.message : 'Unable to list Nodes';
    const status = responseStatus(error, message);
    const forbidden = status === 403 || status === '403';
    warnings.push({ type: forbidden ? 'rbac' : 'error', resourceType: 'Node', message: forbidden ? 'Cannot list Node: forbidden; namespace topology remains available.' : message });
  }
  return { namespaces, topologyNodes, warnings, contextName: selectedContext || 'current' };
}

export async function discoverLiveResources(contextName?: string, settings?: Partial<ConnectionSettings>, scope: DiscoveryScope = {}): Promise<{ resources: K8sResource[]; warnings: DiscoveryWarning[]; contextName: string }> {
  const kubeConfig = createKubeConfig(settings);
  const selectedContext = contextName ?? kubeConfig.getCurrentContext();
  if (selectedContext) kubeConfig.setCurrentContext(selectedContext);
  const clients = {
    core: kubeConfig.makeApiClient(k8s.CoreV1Api), apps: kubeConfig.makeApiClient(k8s.AppsV1Api),
    batch: kubeConfig.makeApiClient(k8s.BatchV1Api), networking: kubeConfig.makeApiClient(k8s.NetworkingV1Api),
    discovery: kubeConfig.makeApiClient(k8s.DiscoveryV1Api), storage: kubeConfig.makeApiClient(k8s.StorageV1Api), autoscaling: kubeConfig.makeApiClient(k8s.AutoscalingV2Api),
  };
  const resources: K8sResource[] = [];
  const warnings: DiscoveryWarning[] = [];
  const cluster = kubeConfig.getCurrentCluster();
  logger.info('discovery started', {
    context: selectedContext || 'current',
    cluster: cluster?.server ?? 'unknown',
    connectionConfigured: Boolean(settings?.connectionId),
  });
  const scopedNamespaces = scope.namespaces?.filter(Boolean);
  const kinds = (scope.kinds?.length ? scope.kinds : resourceKinds)
    .filter(kind => !scopedNamespaces?.length || kind !== 'Namespace');
  const requests = scopedNamespaces?.length
    ? scopedNamespaces.flatMap(namespace => kinds.map(kind => ({ kind, namespace })))
    : kinds.map(kind => ({ kind, namespace: undefined }));
  for (let offset = 0; offset < requests.length; offset += 4) {
    const batch = requests.slice(offset, offset + 4);
    await Promise.all(batch.map(async ({ kind, namespace }) => {
    try {
      logger.info(`listing ${kind}`, { namespace: namespace ?? 'all' });
      // Wrap each call with a 15-second timeout so a stalled connection surfaces immediately
      const response = await Promise.race([
        apiResource(kind, clients, namespace, namespace ? Math.max(1, Math.min(scope.limitPerKind ?? Number(process.env.TOPOLOGY_RESOURCE_LIMIT_PER_KIND || 300), 1_000)) : undefined),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout listing ${kind} after 15s`)), 15_000)
        ),
      ]);
      const items = response?.body?.items ?? response?.items ?? [];
      resources.push(...items.map((item: KubernetesObject) => toResource(kind, item)));
      const continuation = response?.body?.metadata?._continue ?? response?.metadata?._continue;
      if (continuation) warnings.push({ type: 'info', resourceType: kind, message: `${kind} in ${namespace} exceeds the visualization limit; showing the first ${items.length}. Narrow the namespace or resource-type selection before loading more.` });
      logger.info(`listed ${kind}`, { namespace: namespace ?? 'all', count: items.length });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = responseStatus(error, message);
      const forbidden = status === 403 || status === '403';
      const unauthorized = status === 401 || status === '401' || /unauthorized/i.test(message);
      logKubeFailure(`list${kind}`, {
        kind,
        namespace: namespace ?? 'all',
        context: selectedContext || 'current',
        server: kubeConfig.getCurrentCluster()?.server ?? 'unknown',
      }, error);
      logger.error(`failed to list ${kind}`, {
        status,
        message,
      });
      warnings.push({ type: forbidden ? 'rbac' : 'error', resourceType: kind, message: `${forbidden ? 'Cannot list' : 'Failed to list'} ${kind}${namespace ? ` in ${namespace}` : ''}${forbidden ? ': forbidden' : unauthorized ? ': unauthorized (check the connection token)' : status ? `: HTTP ${status}` : ''}` });
    }
    }));
  }
  return { resources, warnings, contextName: selectedContext || 'current' };
}

export function availableContexts(settings?: Partial<ConnectionSettings>): k8s.KubeConfig['contexts'] {
  const kubeConfig = createKubeConfig(settings);
  return kubeConfig.getContexts();
}

export function currentContextName(settings?: Partial<ConnectionSettings>): string {
  return createKubeConfig(settings).getCurrentContext();
}

export async function readPodLogs(
  name: string,
  namespace: string,
  tailLines: number,
  settings?: Partial<ConnectionSettings>,
): Promise<string> {
  const kubeConfig = createKubeConfig(settings);
  const core = kubeConfig.makeApiClient(k8s.CoreV1Api);
  return core.readNamespacedPodLog({
    name,
    namespace,
    tailLines,
    timestamps: true,
  });
}

function cpuMillicores(value = '0') {
  if (value.endsWith('n')) return Number(value.slice(0, -1)) / 1_000_000;
  if (value.endsWith('u')) return Number(value.slice(0, -1)) / 1_000;
  if (value.endsWith('m')) return Number(value.slice(0, -1));
  return Number(value) * 1_000;
}

function memoryBytes(value = '0') {
  const match = value.match(/^([\d.]+)([KMGTE]i|[kMGTPE])?$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const binary = ['Ki', 'Mi', 'Gi', 'Ti', 'Ei'].indexOf(match[2] ?? '');
  if (binary >= 0) return amount * 1024 ** (binary + 1);
  const decimal = ['k', 'M', 'G', 'T', 'P', 'E'].indexOf(match[2] ?? '');
  return decimal >= 0 ? amount * 1000 ** (decimal + 1) : amount;
}

/** Equivalent to `kubectl top pod -A`; a 403 means the caller lacks metrics permission. */
export async function readAllPodMetrics(
  contextName?: string,
  settings?: Partial<ConnectionSettings>,
  namespace?: string,
): Promise<PodMetricsResponse> {
  const kubeConfig = createKubeConfig(settings);
  if (contextName) kubeConfig.setCurrentContext(contextName);
  const customObjects = kubeConfig.makeApiClient(k8s.CustomObjectsApi);

  try {
    const response = (namespace
      ? await customObjects.listNamespacedCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', namespace, plural: 'pods' })
      : await customObjects.listClusterCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', plural: 'pods' })) as { items?: Array<{ metadata?: { name?: string; namespace?: string }; containers?: Array<{ name?: string; usage?: { cpu?: string; memory?: string } }> }> };
    const metrics: PodMetricsResponse['metrics'] = {};
    for (const item of response.items ?? []) {
      const name = item.metadata?.name;
      const namespace = item.metadata?.namespace;
      if (!name || !namespace) continue;
      const containers = item.containers ?? [];
      const cpu = containers.reduce((sum, container) => sum + cpuMillicores(container.usage?.cpu), 0);
      const memory = containers.reduce((sum, container) => sum + memoryBytes(container.usage?.memory), 0);
      metrics[`${namespace}/${name}`] = {
        cpu: `${Math.round(cpu)}m`,
        memory: `${Math.round(memory / 1024 ** 2)}Mi`,
        containers: Object.fromEntries(containers.filter(container => container.name).map(container => [container.name!, {
          cpu: `${Math.round(cpuMillicores(container.usage?.cpu))}m`,
          memory: `${Math.round(memoryBytes(container.usage?.memory) / 1024 ** 2)}Mi`,
        }])),
      };
    }
    return { available: true, metrics };
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Pod metrics are unavailable';
    const status = responseStatus(error, message);
    return {
      available: false,
      metrics: {},
      error: status === 403 || status === '403'
        ? 'Permission denied for pods.metrics.k8s.io'
        : status === 404 || status === '404'
          ? 'Metrics Server is not installed or metrics.k8s.io is unavailable'
          : message,
    };
  }
}

interface AccessRequest {
  id: string;
  verb: PermissionVerb;
  group: string;
  resource: string;
  namespace?: string;
}

/** Uses Kubernetes authorization reviews to evaluate the currently authenticated identity. */
export async function reviewCurrentPermissions(
  contextName: string | undefined,
  namespace: string,
  settings?: Partial<ConnectionSettings>,
): Promise<PermissionsResponse> {
  const kubeConfig = createKubeConfig(settings);
  if (contextName) kubeConfig.setCurrentContext(contextName);
  const authorization = kubeConfig.makeApiClient(k8s.AuthorizationV1Api);
  const requests: AccessRequest[] = [];

  for (const target of PERMISSION_TARGETS) {
    const targetNamespace = target.id === 'systemcomponents'
      ? 'kube-system'
      : target.namespaced && namespace !== '*' ? namespace : undefined;
    for (const verb of MATRIX_VERBS) {
      requests.push({ id: `${target.id}.${verb}`, verb, group: target.group, resource: target.resource, namespace: targetNamespace });
    }
    // Update and patch are displayed together, but both are evaluated.
    requests.push({ id: `${target.id}.update`, verb: 'update', group: target.group, resource: target.resource, namespace: targetNamespace });
    for (const special of target.special ?? []) {
      requests.push({
        id: special.id,
        verb: special.verb,
        group: special.group ?? target.group,
        resource: special.resource ?? target.resource,
        namespace: targetNamespace,
      });
    }
  }
  for (const check of SENSITIVE_CHECKS) {
    requests.push({
      id: check.id,
      verb: check.verb,
      group: check.group,
      resource: check.resource,
      namespace: check.resource === 'pods' && namespace !== '*' ? namespace : undefined,
    });
  }

  const checks: Record<string, PermissionCheck> = {};
  // Keep pressure on the API server bounded; permission checks only run on demand.
  for (let offset = 0; offset < requests.length; offset += 12) {
    const batch = requests.slice(offset, offset + 12);
    await Promise.all(batch.map(async item => {
      try {
        const slash = item.resource.indexOf('/');
        const resource = slash === -1 ? item.resource : item.resource.slice(0, slash);
        const subresource = slash === -1 ? undefined : item.resource.slice(slash + 1);
        const review = await authorization.createSelfSubjectAccessReview({
          body: {
            apiVersion: 'authorization.k8s.io/v1',
            kind: 'SelfSubjectAccessReview',
            spec: { resourceAttributes: {
              group: item.group,
              resource,
              subresource,
              verb: item.verb,
              namespace: item.namespace,
            } },
          },
        });
        checks[item.id] = {
          id: item.id,
          allowed: review.status?.allowed === true,
          denied: review.status?.denied,
          reason: review.status?.reason,
          evaluationError: review.status?.evaluationError,
        };
      } catch (error) {
        checks[item.id] = {
          id: item.id,
          allowed: false,
          evaluationError: error instanceof Error ? error.message : 'Permission check failed',
        };
      }
    }));
  }

  return {
    checks,
    contextName: contextName || kubeConfig.getCurrentContext() || 'current',
    namespace,
    checkedAt: new Date().toISOString(),
    source: 'live',
  };
}

const resourceAccess: Record<string, { group: string; version: string; resource: string; namespaced: boolean }> = {
  Pod: { group: '', version: 'v1', resource: 'pods', namespaced: true },
  Service: { group: '', version: 'v1', resource: 'services', namespaced: true },
  ConfigMap: { group: '', version: 'v1', resource: 'configmaps', namespaced: true },
  Secret: { group: '', version: 'v1', resource: 'secrets', namespaced: true },
  ServiceAccount: { group: '', version: 'v1', resource: 'serviceaccounts', namespaced: true },
  Namespace: { group: '', version: 'v1', resource: 'namespaces', namespaced: false },
  PersistentVolume: { group: '', version: 'v1', resource: 'persistentvolumes', namespaced: false },
  PersistentVolumeClaim: { group: '', version: 'v1', resource: 'persistentvolumeclaims', namespaced: true },
  Deployment: { group: 'apps', version: 'v1', resource: 'deployments', namespaced: true },
  StatefulSet: { group: 'apps', version: 'v1', resource: 'statefulsets', namespaced: true },
  DaemonSet: { group: 'apps', version: 'v1', resource: 'daemonsets', namespaced: true },
  ReplicaSet: { group: 'apps', version: 'v1', resource: 'replicasets', namespaced: true },
  Job: { group: 'batch', version: 'v1', resource: 'jobs', namespaced: true },
  CronJob: { group: 'batch', version: 'v1', resource: 'cronjobs', namespaced: true },
  Ingress: { group: 'networking.k8s.io', version: 'v1', resource: 'ingresses', namespaced: true },
  NetworkPolicy: { group: 'networking.k8s.io', version: 'v1', resource: 'networkpolicies', namespaced: true },
  StorageClass: { group: 'storage.k8s.io', version: 'v1', resource: 'storageclasses', namespaced: false },
  HorizontalPodAutoscaler: { group: 'autoscaling', version: 'v2', resource: 'horizontalpodautoscalers', namespaced: true },
};

function labelCommands(kind: string, namespace: string | null) {
  const access = resourceAccess[kind];
  if (!access) throw new Error(`Labels are not supported for ${kind}`);
  const qualified = access.group ? `${access.resource}.${access.group}` : access.resource;
  const namespaceFlag = access.namespaced ? ` -n ${namespace || 'default'}` : '';
  const scope = access.namespaced ? 'role' : 'clusterrole';
  const binding = access.namespaced ? 'rolebinding' : 'clusterrolebinding';
  return {
    command: `kubectl auth can-i patch ${qualified}${namespaceFlag}`,
    grantCommands: [
      `kubectl create ${scope} klystr-label-editor --verb=get,patch --resource=${qualified}${namespaceFlag}`,
      `kubectl create ${binding} klystr-label-editor --${scope}=klystr-label-editor --user=<USER>${namespaceFlag}`,
    ],
  };
}

export async function reviewLabelPermission(
  contextName: string | undefined,
  kind: string,
  name: string,
  namespace: string | null,
  settings?: Partial<ConnectionSettings>,
): Promise<LabelPermissionResponse> {
  const access = resourceAccess[kind];
  if (!access) throw new Error(`Labels are not supported for ${kind}`);
  const kubeConfig = createKubeConfig(settings);
  if (contextName) kubeConfig.setCurrentContext(contextName);
  const authorization = kubeConfig.makeApiClient(k8s.AuthorizationV1Api);
  const commands = labelCommands(kind, namespace);
  const review = await authorization.createSelfSubjectAccessReview({ body: {
    apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview',
    spec: { resourceAttributes: {
      group: access.group, version: access.version, resource: access.resource,
      verb: 'patch', name, namespace: access.namespaced ? namespace ?? 'default' : undefined,
    } },
  } });
  return {
    allowed: review.status?.allowed === true,
    contextName: contextName || kubeConfig.getCurrentContext() || 'current',
    ...commands,
    reason: review.status?.reason || review.status?.evaluationError,
  };
}

export async function patchResourceLabels(
  contextName: string | undefined,
  kind: string,
  name: string,
  namespace: string | null,
  labels: Record<string, string | null>,
  settings?: Partial<ConnectionSettings>,
) {
  const access = resourceAccess[kind];
  if (!access) throw new Error(`Labels are not supported for ${kind}`);
  const kubeConfig = createKubeConfig(settings);
  if (contextName) kubeConfig.setCurrentContext(contextName);
  const api = k8s.KubernetesObjectApi.makeApiClient(kubeConfig);
  return api.patch({
    apiVersion: access.group ? `${access.group}/${access.version}` : access.version,
    kind,
    // Merge-patch deletion uses null values even though the generated object type only models persisted strings.
    metadata: { name, namespace: access.namespaced ? namespace ?? 'default' : undefined, labels: labels as Record<string, string> },
  }, undefined, undefined, 'klystr', undefined, k8s.PatchStrategy.MergePatch);
}

export function kubernetesErrorStatus(error: any): number | undefined {
  const message = error instanceof Error ? error.message : '';
  const value = responseStatus(error, message);
  return typeof value === 'string' ? Number(value) : value;
}

export interface DescribedKubeConfig {
  endpoint?: string;
  context?: string;
  user?: string;
  cluster?: string;
  configSource: string;
}

export function describeKubeConfig(
  config: k8s.KubeConfig,
  settings?: Partial<ConnectionSettings>,
): DescribedKubeConfig {
  const currentContext = config.getCurrentContext();
  const clusterObj = config.getCurrentCluster();
  let configSource = 'default (~/.kube/config)';
  if (settings?.clusterUrl) {
    configSource = 'remote endpoint';
  } else if (settings?.kubeconfigContent) {
    configSource = settings.kubeconfigFileName ? `uploaded: ${settings.kubeconfigFileName}` : 'uploaded kubeconfig';
  } else if (settings?.environment === 'microk8s') {
    configSource = 'microk8s config';
  } else if (settings?.environment === 'k3s') {
    configSource = '/etc/rancher/k3s/k3s.yaml';
  } else if (settings?.kubeconfigPath) {
    configSource = settings.kubeconfigPath;
  }

  return {
    endpoint: clusterObj?.server,
    context: currentContext,
    user: config.getCurrentUser()?.name,
    cluster: clusterObj?.name,
    configSource,
  };
}

function resolveKubeconfigPath(p: string): string {
  const trimmed = p.trim();
  if (trimmed.startsWith('~/') || trimmed === '~') {
    return join(homedir(), trimmed.slice(1));
  }
  return trimmed;
}

function readMicrok8sKubeconfig(): string {
  const augmentedPath = [
    process.env.PATH || '',
    '/snap/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
    .filter(Boolean)
    .join(':');

  const env = { ...process.env, PATH: augmentedPath };

  const candidateCommands = [
    'microk8s config',
    '/snap/bin/microk8s config',
    '/usr/local/bin/microk8s config',
    '/usr/bin/microk8s config',
  ];

  let lastError: any = null;
  for (const cmd of candidateCommands) {
    try {
      const yaml = execSync(cmd, { encoding: 'utf-8', timeout: 5000, env });
      if (yaml && (yaml.includes('apiVersion') || yaml.includes('clusters:'))) {
        return yaml;
      }
    } catch (err: any) {
      lastError = err;
      const combined = `${err?.stderr ?? ''} ${err?.message ?? ''}`;
      // If the command ran but failed because microk8s is stopped or permission denied,
      // don't try other candidate paths
      if (!/not found|ENOENT|127/i.test(combined)) {
        break;
      }
    }
  }

  throw lastError || new Error('microk8s command not found');
}

export function createKubeConfig(settings?: Partial<ConnectionSettings>): k8s.KubeConfig {
  const kubeConfig = new k8s.KubeConfig();

  // If explicit remote clusterUrl & token were provided via remote registration
  if (settings?.clusterUrl && (settings.token || settings.connectionId)) {
    try {
      const connection = resolveConnection(settings);
      if (connection.clusterUrl) {
        const parsedUrl = new URL(connection.clusterUrl);
        const server = `${parsedUrl.protocol}//${parsedUrl.host}`;
        logger.info('using configured endpoint', {
          server,
          source: 'server-registry',
          protocol: parsedUrl.protocol,
        });
        kubeConfig.loadFromOptions({
          clusters: [{ name: 'request-cluster', server, skipTLSVerify: connection.skipTlsVerify }],
          users: [{ name: 'request-token-user', token: connection.token }],
          contexts: [{ name: 'request-context', cluster: 'request-cluster', user: 'request-token-user' }],
          currentContext: 'request-context',
        });
        return kubeConfig;
      }
    } catch {
      // Fall through to local kubeconfig discovery
    }
  }

  // 1. Uploaded Kubeconfig content (file upload or memory)
  if (settings?.kubeconfigContent) {
    logger.info('loading kubeconfig from uploaded content', { fileName: settings.kubeconfigFileName });
    try {
      kubeConfig.loadFromString(settings.kubeconfigContent);
    } catch (err: any) {
      throw new Error(`Failed to parse uploaded kubeconfig: ${err?.message || 'Invalid YAML or kubeconfig format'}`);
    }
  }
  // 2. Custom Kubeconfig path provided by user
  else if ((settings?.environment === 'custom' || settings?.environment === 'kubeconfig') && settings?.kubeconfigPath) {
    const resolvedPath = resolveKubeconfigPath(settings.kubeconfigPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Kubeconfig file does not exist at "${settings.kubeconfigPath}".`);
    }
    logger.info('loading custom kubeconfig path', { path: resolvedPath });
    kubeConfig.loadFromFile(resolvedPath);
  } else if (settings?.kubeconfigPath) {
    const resolvedPath = resolveKubeconfigPath(settings.kubeconfigPath);
    if (existsSync(resolvedPath)) {
      logger.info('loading custom kubeconfig path', { path: resolvedPath });
      kubeConfig.loadFromFile(resolvedPath);
    }
  }
  // 3. MicroK8s explicit selection
  else if (settings?.environment === 'microk8s') {
    logger.info('loading microk8s kubeconfig');
    try {
      const yaml = readMicrok8sKubeconfig();
      kubeConfig.loadFromString(yaml);
    } catch (err: any) {
      const stderr = err?.stderr ? String(err.stderr).trim() : '';
      const message = err?.message ?? '';
      throw new Error(`Failed to load MicroK8s configuration (${stderr || message || 'command failed'}). Ensure MicroK8s is installed and running ('microk8s status'), and your user has permission ('sudo usermod -a -G microk8s $USER').`);
    }
  }
  // 3. K3s default configuration
  else if (settings?.environment === 'k3s') {
    const k3sDefaultPath = '/etc/rancher/k3s/k3s.yaml';
    if (!existsSync(k3sDefaultPath)) {
      throw new Error(`K3s kubeconfig not found at "${k3sDefaultPath}". Ensure K3s is installed and running, or specify a custom kubeconfig path.`);
    }
    try {
      logger.info('loading k3s kubeconfig');
      kubeConfig.loadFromFile(k3sDefaultPath);
    } catch (err: any) {
      throw new Error(`Failed to read K3s kubeconfig at "${k3sDefaultPath}": ${err?.message ?? 'Permission denied'}. You may need: 'sudo chmod 644 ${k3sDefaultPath}'`);
    }
  }
  // 4. Standard local default (~/.kube/config or KUBECONFIG env or microk8s fallback)
  else {
    let loaded = false;
    try {
      kubeConfig.loadFromDefault();
      loaded = true;
    } catch (err) {
      // If default fails, check microk8s config CLI as fallback
      try {
        const yaml = readMicrok8sKubeconfig();
        kubeConfig.loadFromString(yaml);
        loaded = true;
      } catch {
        logger.warn('could not load default kubeconfig', { error: String(err) });
      }
    }
    if (!loaded && !settings?.clusterUrl) {
      throw new Error('No local Kubernetes configuration found. Ensure ~/.kube/config exists or select a specific environment (MicroK8s, K3s, Custom).');
    }
  }

  // Set active context if specified
  const targetContext = settings?.contextName;
  if (targetContext) {
    try {
      kubeConfig.setCurrentContext(targetContext);
    } catch {
      // ignore
    }
  }

  // Apply skipTlsVerify if requested across all clusters
  if (settings?.skipTlsVerify) {
    for (const cluster of kubeConfig.clusters) {
      (cluster as { skipTLSVerify?: boolean }).skipTLSVerify = true;
    }
  }

  return kubeConfig;
}
