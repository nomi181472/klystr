/* eslint-disable @typescript-eslint/no-explicit-any */
import * as k8s from '@kubernetes/client-node';
import { createKubeConfig } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';
import type { SecurityAttackPath, SecurityControl, SecurityExposure, SecuritySeverity, SecuritySnapshot, SecurityTestRun, SecurityWarning, SecurityWorkload } from './types';

const items = (response: any): any[] => response?.items ?? response?.body?.items ?? [];
const labelsMatch = (labels: Record<string, string> = {}, selector: Record<string, string> = {}) => Object.entries(selector).every(([key, value]) => labels[key] === value);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Kubernetes API request failed';

async function safeList(resource: string, call: () => Promise<any>, warnings: SecurityWarning[]) {
  try { return items(await Promise.race([call(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${resource} request timed out after 15 seconds`)), 15_000))])); }
  catch (error) { warnings.push({ resource, message: errorMessage(error) }); return []; }
}

function workloadSpec(object: any) { return object.spec?.template?.spec ?? object.spec?.jobTemplate?.spec?.template?.spec ?? object.spec ?? {}; }
function workloadName(object: any) { return `${object.kind}/${object.metadata?.name ?? 'unknown'}`; }
function severityFor(risks: string[]): SecuritySeverity {
  if (risks.some(risk => /Privileged|Host namespace|hostPath|Docker socket/i.test(risk))) return 'critical';
  if (risks.some(risk => /root|escalation|capability|token/i.test(risk))) return 'high';
  return risks.length > 1 ? 'medium' : risks.length ? 'low' : 'info';
}
function assessWorkload(object: any): SecurityWorkload | null {
  const spec = workloadSpec(object); const containers = [...(spec.initContainers ?? []), ...(spec.containers ?? []), ...(spec.ephemeralContainers ?? [])];
  if (!containers.length) return null;
  const risks = new Set<string>();
  if (spec.hostNetwork || spec.hostPID || spec.hostIPC) risks.add('Host namespace access');
  if (spec.automountServiceAccountToken !== false) risks.add('ServiceAccount token automount');
  for (const volume of spec.volumes ?? []) { if (volume.hostPath) risks.add(volume.hostPath.path === '/var/run/docker.sock' ? 'Docker socket mount' : 'hostPath mount'); }
  for (const container of containers) {
    const security = container.securityContext ?? {};
    if (security.privileged) risks.add('Privileged container');
    if (security.allowPrivilegeEscalation !== false) risks.add('Privilege escalation not disabled');
    if (security.runAsNonRoot !== true && security.runAsUser !== 65532) risks.add('Non-root execution not enforced');
    if (security.readOnlyRootFilesystem !== true) risks.add('Writable root filesystem');
    if (!security.seccompProfile && !spec.securityContext?.seccompProfile) risks.add('Seccomp profile not declared');
    if ((security.capabilities?.add ?? []).length) risks.add(`Added capabilities: ${security.capabilities.add.join(', ')}`);
    if (!container.image?.includes('@sha256:') && /:latest$|^[^:]+$/.test(container.image ?? '')) risks.add('Mutable image tag');
  }
  const pss = risks.has('Privileged container') || risks.has('Host namespace access') || risks.has('hostPath mount') || risks.has('Docker socket mount') ? 'privileged' : risks.size ? 'baseline' : 'restricted';
  return { id: `${object.metadata?.namespace}/${object.kind}/${object.metadata?.name}`, workload: workloadName(object), namespace: object.metadata?.namespace ?? 'default', containers: containers.length, risks: [...risks], pss, severity: severityFor([...risks]) };
}

function dangerousRole(role: any) {
  const rules = role.rules ?? [];
  const admin = rules.some((rule: any) => (rule.verbs ?? []).includes('*') && (rule.resources ?? []).includes('*'));
  const escalation = rules.some((rule: any) => (rule.verbs ?? []).some((verb: string) => ['create', 'update', 'patch', 'impersonate', 'bind', 'escalate', '*'].includes(verb)) && (rule.resources ?? []).some((resource: string) => ['pods', 'pods/exec', 'secrets', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings', 'serviceaccounts/token', '*'].includes(resource)));
  return { dangerous: admin || escalation, admin };
}

export async function buildSecuritySnapshot(contextName?: string, settings?: Partial<ConnectionSettings>): Promise<SecuritySnapshot> {
  const config = createKubeConfig(settings); if (contextName) config.setCurrentContext(contextName);
  const core = config.makeApiClient(k8s.CoreV1Api); const apps = config.makeApiClient(k8s.AppsV1Api); const batch = config.makeApiClient(k8s.BatchV1Api);
  const networking = config.makeApiClient(k8s.NetworkingV1Api); const rbac = config.makeApiClient(k8s.RbacAuthorizationV1Api);
  const warnings: SecurityWarning[] = [];
  const [namespaces, pods, deployments, statefulSets, daemonSets, jobs, cronJobs, services, ingresses, policies, roles, clusterRoles, roleBindings, clusterRoleBindings] = await Promise.all([
    safeList('namespaces', () => core.listNamespace(), warnings), safeList('pods', () => core.listPodForAllNamespaces(), warnings),
    safeList('deployments', () => apps.listDeploymentForAllNamespaces(), warnings), safeList('statefulsets', () => apps.listStatefulSetForAllNamespaces(), warnings),
    safeList('daemonsets', () => apps.listDaemonSetForAllNamespaces(), warnings), safeList('jobs', () => batch.listJobForAllNamespaces(), warnings),
    safeList('cronjobs', () => batch.listCronJobForAllNamespaces(), warnings), safeList('services', () => core.listServiceForAllNamespaces(), warnings),
    safeList('ingresses', () => networking.listIngressForAllNamespaces(), warnings), safeList('networkpolicies', () => networking.listNetworkPolicyForAllNamespaces(), warnings),
    safeList('roles', () => rbac.listRoleForAllNamespaces(), warnings), safeList('clusterroles', () => rbac.listClusterRole(), warnings),
    safeList('rolebindings', () => rbac.listRoleBindingForAllNamespaces(), warnings), safeList('clusterrolebindings', () => rbac.listClusterRoleBinding(), warnings),
  ]);
  for (const [kind, values] of [['Pod', pods], ['Deployment', deployments], ['StatefulSet', statefulSets], ['DaemonSet', daemonSets], ['Job', jobs], ['CronJob', cronJobs]] as const) for (const value of values) value.kind = kind;
  const controllers = [...deployments, ...statefulSets, ...daemonSets, ...jobs, ...cronJobs];
  const controllerSelectors = controllers.map(object => ({ object, selector: object.spec?.selector?.matchLabels ?? object.spec?.jobTemplate?.spec?.template?.metadata?.labels ?? {} }));
  const standalonePods = pods.filter(pod => !controllerSelectors.some(entry => entry.object.metadata?.namespace === pod.metadata?.namespace && labelsMatch(pod.metadata?.labels, entry.selector)));
  const workloadRisks = [...controllers, ...standalonePods].map(assessWorkload).filter((value): value is SecurityWorkload => Boolean(value)).sort((a, b) => ['critical','high','medium','low','info'].indexOf(a.severity) - ['critical','high','medium','low','info'].indexOf(b.severity));
  const policyNamespaces = new Set(policies.map(policy => policy.metadata?.namespace));
  const networkExposures: SecurityExposure[] = [];
  for (const service of services) {
    const namespace = service.metadata?.namespace ?? 'default'; const type = service.spec?.type ?? 'ClusterIP';
    if (!['LoadBalancer', 'NodePort', 'ExternalName'].includes(type)) continue;
    const selector = service.spec?.selector ?? {}; const target = Object.keys(selector).length ? controllers.find(object => object.metadata?.namespace === namespace && labelsMatch(object.spec?.template?.metadata?.labels, selector)) : undefined;
    networkExposures.push({ id: `${namespace}/service/${service.metadata?.name}`, entrypoint: service.metadata?.name, namespace, route: `Service/${service.metadata?.name} → ${workloadName(target ?? { kind: 'Workload', metadata: { name: 'unresolved' } })}`, workload: target ? workloadName(target) : 'Unresolved selector', exposure: type, policy: policyNamespaces.has(namespace) ? 'NetworkPolicy present' : 'No namespace NetworkPolicy', severity: type === 'LoadBalancer' && !policyNamespaces.has(namespace) ? 'high' : type === 'NodePort' ? 'medium' : 'low' });
  }
  for (const ingress of ingresses) for (const rule of ingress.spec?.rules ?? []) for (const path of rule.http?.paths ?? []) {
    const namespace = ingress.metadata?.namespace ?? 'default'; const serviceName = path.backend?.service?.name ?? 'unknown'; const service = services.find(value => value.metadata?.namespace === namespace && value.metadata?.name === serviceName); const selector = service?.spec?.selector ?? {}; const target = Object.keys(selector).length ? controllers.find(object => object.metadata?.namespace === namespace && labelsMatch(object.spec?.template?.metadata?.labels, selector)) : undefined;
    networkExposures.push({ id: `${namespace}/ingress/${ingress.metadata?.name}/${rule.host ?? '*'}/${path.path ?? '/'}`, entrypoint: rule.host ?? '*', namespace, route: `${path.path ?? '/'} → Service/${serviceName}`, workload: target ? workloadName(target) : 'Unresolved backend', exposure: 'Ingress', policy: policyNamespaces.has(namespace) ? 'NetworkPolicy present' : 'No namespace NetworkPolicy', severity: !policyNamespaces.has(namespace) ? 'high' : 'medium' });
  }
  const roleByKey = new Map<string, any>([...roles.map(role => [`Role/${role.metadata?.namespace}/${role.metadata?.name}`, role] as [string, any]), ...clusterRoles.map(role => [`ClusterRole//${role.metadata?.name}`, role] as [string, any])]);
  const attackPaths: SecurityAttackPath[] = [];
  for (const binding of [...roleBindings, ...clusterRoleBindings]) {
    const namespace = binding.metadata?.namespace; const ref = binding.roleRef; const role = roleByKey.get(`${ref?.kind}/${ref?.kind === 'Role' ? namespace : ''}/${ref?.name}`); const risk = dangerousRole(role ?? {}); if (!risk.dangerous) continue;
    for (const subject of binding.subjects ?? []) {
      const subjectNamespace = subject.namespace ?? namespace; const isDefaultGroup = subject.kind === 'Group' && ['system:authenticated', 'system:unauthenticated'].includes(subject.name);
      attackPaths.push({ id: `${binding.metadata?.uid ?? binding.metadata?.name}/${subject.kind}/${subject.name}`, title: `${subject.kind} can reach security-sensitive permissions`, severity: risk.admin || isDefaultGroup ? 'critical' : 'high', summary: `${subject.kind} ${subject.name} is bound to ${ref?.kind} ${ref?.name}, which grants administrative or privilege-escalating actions.`, nodes: [{ label: subject.name, type: subject.kind, detail: subjectNamespace ? `Namespace ${subjectNamespace}` : 'Cluster identity' }, { label: binding.metadata?.name, type: binding.kind ?? (namespace ? 'RoleBinding' : 'ClusterRoleBinding'), detail: namespace ? `Namespace ${namespace}` : 'Cluster scoped' }, { label: ref?.name, type: ref?.kind, detail: risk.admin ? 'Wildcard administrative permissions' : 'Security-sensitive write permissions' }] });
    }
  }
  const namespaceNames = namespaces.map(namespace => namespace.metadata?.name).filter(Boolean); const enforced = namespaces.filter(namespace => ['baseline','restricted'].includes(namespace.metadata?.labels?.['pod-security.kubernetes.io/enforce']));
  const unavailable = (pattern: RegExp) => warnings.some(warning => pattern.test(warning.resource));
  const controls: SecurityControl[] = [
    { id: 'psa', title: 'Pod Security Admission coverage', category: 'Admission', status: unavailable(/^namespaces$/) ? 'unknown' : enforced.length === namespaceNames.length ? 'pass' : enforced.length ? 'warning' : 'fail', coverage: namespaceNames.length ? Math.round(enforced.length / namespaceNames.length * 100) : 0, evidence: `${enforced.length} of ${namespaceNames.length} visible namespaces enforce baseline or restricted.`, recommendation: 'Label application namespaces with an appropriate Pod Security enforce level.' },
    { id: 'rbac', title: 'Broad or escalating RBAC bindings', category: 'RBAC', status: attackPaths.length ? 'fail' : warnings.some(w => /role/i.test(w.resource)) ? 'unknown' : 'pass', coverage: attackPaths.length ? Math.max(0, 100 - attackPaths.length * 10) : 100, evidence: `${attackPaths.length} visible binding paths reach sensitive permissions.`, recommendation: 'Replace broad roles with least-privilege, namespace-scoped grants.' },
    { id: 'network', title: 'Namespace network isolation', category: 'Network', status: unavailable(/^networkpolicies$/) || unavailable(/^namespaces$/) ? 'unknown' : policyNamespaces.size === namespaceNames.length ? 'pass' : policyNamespaces.size ? 'warning' : 'fail', coverage: namespaceNames.length ? Math.round(policyNamespaces.size / namespaceNames.length * 100) : 0, evidence: `${policyNamespaces.size} of ${namespaceNames.length} visible namespaces contain a NetworkPolicy.`, recommendation: 'Use default-deny ingress and egress policies, followed by explicit allows.' },
    { id: 'workloads', title: 'Restricted workload posture', category: 'Workloads', status: unavailable(/^(pods|deployments|statefulsets|daemonsets|jobs|cronjobs)$/) ? 'unknown' : workloadRisks.some(w => w.severity === 'critical') ? 'fail' : workloadRisks.some(w => w.severity === 'high') ? 'warning' : 'pass', coverage: workloadRisks.length ? Math.round(workloadRisks.filter(w => w.pss === 'restricted').length / workloadRisks.length * 100) : 100, evidence: `${workloadRisks.filter(w => w.severity === 'critical' || w.severity === 'high').length} workloads have critical or high-risk settings.`, recommendation: 'Apply restricted security contexts and remove host-level access.' },
  ];
  return { source: 'live', contextName: config.getCurrentContext() || 'current', generatedAt: new Date().toISOString(), namespaces: namespaceNames.length, controls, attackPaths, networkExposures, workloadRisks, warnings };
}

export async function runReadOnlySecurityTests(contextName: string | undefined, testIds: string[], namespace: string, settings?: Partial<ConnectionSettings>): Promise<SecurityTestRun> {
  const config = createKubeConfig(settings); if (contextName) config.setCurrentContext(contextName); const authorization = config.makeApiClient(k8s.AuthorizationV1Api);
  const definitions: Record<string, { title: string; verb: string; group?: string; resource: string; namespace?: string }> = {
    'api-permissions': { title: 'Sensitive Secret access boundary', verb: 'list', resource: 'secrets', namespace },
    'service-exposure': { title: 'Service discovery visibility', verb: 'list', resource: 'services', namespace },
    'token-boundary': { title: 'ServiceAccount token minting boundary', verb: 'create', resource: 'serviceaccounts/token', namespace },
    'admission-dry-run': { title: 'Admission configuration visibility', verb: 'list', group: 'admissionregistration.k8s.io', resource: 'validatingadmissionpolicies' },
    'network-reachability': { title: 'NetworkPolicy visibility', verb: 'list', group: 'networking.k8s.io', resource: 'networkpolicies', namespace },
  };
  const results = await Promise.all(testIds.filter(id => definitions[id]).map(async id => {
    const definition = definitions[id];
    try { const review = await authorization.createSelfSubjectAccessReview({ body: { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', spec: { resourceAttributes: { namespace: definition.namespace, verb: definition.verb, group: definition.group ?? '', resource: definition.resource } } } }); const allowed = review.status?.allowed ?? (review as any).body?.status?.allowed ?? false; const sensitive = ['api-permissions','token-boundary'].includes(id); return { id, title: definition.title, status: allowed && sensitive ? 'warning' as const : allowed ? 'pass' as const : 'fail' as const, evidence: `${definition.verb} ${definition.group ? `${definition.group}/` : ''}${definition.resource}${definition.namespace ? ` in ${definition.namespace}` : ' cluster-wide'}: ${allowed ? 'allowed' : 'denied'}` }; }
    catch (error) { return { id, title: definition.title, status: 'warning' as const, evidence: errorMessage(error) }; }
  }));
  return { contextName: config.getCurrentContext() || 'current', executedAt: new Date().toISOString(), readOnly: true, results };
}
