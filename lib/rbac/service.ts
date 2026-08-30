import * as k8s from '@kubernetes/client-node';
import { createKubeConfig, kubernetesErrorStatus } from '@/lib/k8s/discovery';
import { projectName } from '@/lib/k8s/project-resources';
import type { ConnectionSettings } from '@/lib/types';
import { RBAC_RESOURCES, type RbacIdentity, type RbacInventory, type RbacRuleSelection } from './types';

const MANAGED_BY = 'klystr';
const mockIdentities = new Map<string, RbacIdentity>([
  ['klystr/platform-viewer', { name: 'platform-viewer', namespace: 'klystr', scope: 'namespace', managed: true, rules: [{ resourceId: 'pods', verbs: ['get', 'list', 'watch'] }, { resourceId: 'deployments', verbs: ['get', 'list', 'watch'] }] }],
  ['default/release-bot', { name: 'release-bot', namespace: 'default', scope: 'namespace', managed: true, rules: [{ resourceId: 'deployments', verbs: ['get', 'list', 'watch', 'update', 'patch'] }, { resourceId: 'pods', verbs: ['get', 'list', 'watch'] }] }],
  ['database/database-reader', { name: 'database-reader', namespace: 'database', scope: 'namespace', managed: true, rules: [{ resourceId: 'pods', verbs: ['get', 'list', 'watch'] }, { resourceId: 'services', verbs: ['get', 'list', 'watch'] }, { resourceId: 'persistentvolumeclaims', verbs: ['get', 'list', 'watch'] }] }],
  ['monitoring/metrics-reader', { name: 'metrics-reader', namespace: 'monitoring', scope: 'cluster', managed: true, rules: [{ resourceId: 'pods', verbs: ['get', 'list', 'watch'] }, { resourceId: 'services', verbs: ['get', 'list', 'watch'] }] }],
  ['payments/checkout-deployer', { name: 'checkout-deployer', namespace: 'payments', scope: 'namespace', managed: true, rules: [{ resourceId: 'deployments', verbs: ['get', 'list', 'watch', 'create', 'update', 'patch'] }, { resourceId: 'services', verbs: ['get', 'list', 'watch', 'create', 'update', 'patch'] }, { resourceId: 'ingresses', verbs: ['get', 'list', 'watch', 'create', 'update', 'patch'] }] }],
]);

function clients(context: string | undefined, settings: Partial<ConnectionSettings>) {
  const kubeConfig = createKubeConfig(settings); if (context) kubeConfig.setCurrentContext(context);
  return { core: kubeConfig.makeApiClient(k8s.CoreV1Api), rbac: kubeConfig.makeApiClient(k8s.RbacAuthorizationV1Api), auth: kubeConfig.makeApiClient(k8s.AuthorizationV1Api) };
}

function managedName(identity: string) { return `klystr-${identity}`.slice(0, 63).replace(/-+$/g, ''); }
function validName(value: string) { return /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/.test(value); }

async function readOrNull<T>(operation: () => Promise<T>): Promise<T | null> {
  try { return await operation(); }
  catch (error) {
    if (kubernetesErrorStatus(error) === 404) return null;
    throw error;
  }
}

function selectionsFromRules(rules: k8s.V1PolicyRule[] = []): RbacRuleSelection[] {
  const selected = new Map<string, Set<string>>();
  for (const rule of rules) for (const resource of rule.resources ?? []) {
    const match = RBAC_RESOURCES.find(item => item.group === (rule.apiGroups?.[0] ?? '') && item.resource === resource);
    if (!match) continue; const verbs = selected.get(match.id) ?? new Set<string>(); for (const verb of rule.verbs) verbs.add(verb); selected.set(match.id, verbs);
  }
  return [...selected].map(([resourceId, verbs]) => ({ resourceId, verbs: [...verbs].filter(verb => ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'].includes(verb)) as RbacRuleSelection['verbs'] }));
}

export async function rbacInventory(context: string | undefined, namespace: string, settings: Partial<ConnectionSettings>): Promise<RbacInventory> {
  if (settings.mode === 'mock') return { namespaces: ['klystr', 'default', 'database', 'monitoring', 'payments'], identities: [...mockIdentities.values()].filter(identity => identity.namespace === namespace) };
  const { core, rbac } = clients(context, settings);
  const [namespaceList, accountList, roles, bindings, clusterRoles, clusterBindings] = await Promise.all([core.listNamespace(), core.listNamespacedServiceAccount({ namespace }), rbac.listNamespacedRole({ namespace }), rbac.listNamespacedRoleBinding({ namespace }), rbac.listClusterRole(), rbac.listClusterRoleBinding()]);
  const roleMap = new Map(roles.items.map(role => [role.metadata?.name ?? '', role.rules ?? []]));
  const clusterRoleMap = new Map(clusterRoles.items.map(role => [role.metadata?.name ?? '', role.rules ?? []]));
  const identities = accountList.items.map(account => {
    const name = account.metadata?.name ?? '';
    const namespacedBindings = bindings.items.filter(binding => binding.subjects?.some(subject => subject.kind === 'ServiceAccount' && subject.name === name && (subject.namespace ?? namespace) === namespace));
    const globalBindings = clusterBindings.items.filter(binding => binding.subjects?.some(subject => subject.kind === 'ServiceAccount' && subject.name === name && subject.namespace === namespace));
    const rules = [...namespacedBindings.flatMap(binding => binding.roleRef.kind === 'Role' ? roleMap.get(binding.roleRef.name) ?? [] : clusterRoleMap.get(binding.roleRef.name) ?? []), ...globalBindings.flatMap(binding => clusterRoleMap.get(binding.roleRef.name) ?? [])];
    return { name, namespace, scope: globalBindings.length ? 'cluster' as const : 'namespace' as const, rules: selectionsFromRules(rules), managed: account.metadata?.labels?.['app.kubernetes.io/managed-by'] === MANAGED_BY };
  });
  return { namespaces: namespaceList.items.map(item => item.metadata?.name).filter((name): name is string => Boolean(name)).sort(), identities };
}

interface Review { verb: string; group: string; resource: string; namespace?: string; name?: string; command: string }
async function requireAccess(auth: k8s.AuthorizationV1Api, reviews: Review[]) {
  const denied: string[] = [];
  for (const item of reviews) {
    const result = await auth.createSelfSubjectAccessReview({ body: { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', spec: { resourceAttributes: { verb: item.verb, group: item.group, resource: item.resource, namespace: item.namespace, name: item.name } } } });
    if (!result.status?.allowed) denied.push(item.command);
  }
  if (denied.length) throw new Error(`RBAC preflight denied. Required checks:\n${denied.join('\n')}`);
}

function policyRules(selections: RbacRuleSelection[]): k8s.V1PolicyRule[] {
  return selections.filter(selection => selection.verbs.length).map(selection => { const resource = RBAC_RESOURCES.find(item => item.id === selection.resourceId); if (!resource) throw new Error(`Unknown resource ${selection.resourceId}`); return { apiGroups: [resource.group], resources: [resource.resource], verbs: selection.verbs }; });
}

export async function saveRbacIdentity(context: string | undefined, identity: RbacIdentity, settings: Partial<ConnectionSettings>) {
  if (!validName(identity.name) || !validName(identity.namespace)) throw new Error('Identity and namespace must be valid Kubernetes DNS labels.');
  if (!identity.rules.some(rule => rule.verbs.length)) throw new Error('Select at least one permission.');
  if (settings.mode === 'mock') { mockIdentities.set(`${identity.namespace}/${identity.name}`, { ...identity, managed: true }); return; }
  const { core, rbac, auth } = clients(context, settings), roleName = managedName(identity.name), cluster = identity.scope === 'cluster';
  const namespaceFlag = cluster ? '' : ` -n ${identity.namespace}`;
  const [account, role, binding] = await Promise.all([
    readOrNull(() => core.readNamespacedServiceAccount({ name: identity.name, namespace: identity.namespace })),
    cluster
      ? readOrNull(() => rbac.readClusterRole({ name: roleName }))
      : readOrNull(() => rbac.readNamespacedRole({ name: roleName, namespace: identity.namespace })),
    cluster
      ? readOrNull(() => rbac.readClusterRoleBinding({ name: roleName }))
      : readOrNull(() => rbac.readNamespacedRoleBinding({ name: roleName, namespace: identity.namespace })),
  ]);
  const roleResource = cluster ? 'clusterroles' : 'roles';
  const bindingResource = cluster ? 'clusterrolebindings' : 'rolebindings';
  await requireAccess(auth, [
    ...(!account ? [{ verb: 'create', group: '', resource: 'serviceaccounts', namespace: identity.namespace, name: identity.name, command: `kubectl auth can-i create serviceaccounts -n ${identity.namespace}` }] : []),
    { verb: role ? 'update' : 'create', group: 'rbac.authorization.k8s.io', resource: roleResource, namespace: cluster ? undefined : identity.namespace, name: roleName, command: `kubectl auth can-i ${role ? 'update' : 'create'} ${roleResource}${namespaceFlag}` },
    { verb: 'escalate', group: 'rbac.authorization.k8s.io', resource: roleResource, namespace: cluster ? undefined : identity.namespace, name: roleName, command: `kubectl auth can-i escalate ${roleResource}${namespaceFlag}` },
    { verb: 'bind', group: 'rbac.authorization.k8s.io', resource: roleResource, namespace: cluster ? undefined : identity.namespace, name: roleName, command: `kubectl auth can-i bind ${roleResource}${namespaceFlag}` },
    { verb: binding ? 'update' : 'create', group: 'rbac.authorization.k8s.io', resource: bindingResource, namespace: cluster ? undefined : identity.namespace, name: roleName, command: `kubectl auth can-i ${binding ? 'update' : 'create'} ${bindingResource}${namespaceFlag}` },
  ] as Review[]);
  const labels = { 'app.kubernetes.io/name': identity.name, 'app.kubernetes.io/managed-by': MANAGED_BY };
  if (!account) await core.createNamespacedServiceAccount({ namespace: identity.namespace, body: { metadata: { name: identity.name, namespace: identity.namespace, labels } } });
  const rules = policyRules(identity.rules), roleBody = { metadata: { name: roleName, ...(cluster ? {} : { namespace: identity.namespace }), labels }, rules };
  if (cluster) { if (role) await rbac.replaceClusterRole({ name: roleName, body: { ...role, ...roleBody } }); else await rbac.createClusterRole({ body: roleBody }); }
  else { if (role) await rbac.replaceNamespacedRole({ name: roleName, namespace: identity.namespace, body: { ...role, ...roleBody } }); else await rbac.createNamespacedRole({ namespace: identity.namespace, body: roleBody }); }
  const roleRef = { apiGroup: 'rbac.authorization.k8s.io', kind: cluster ? 'ClusterRole' : 'Role', name: roleName }, subjects = [{ kind: 'ServiceAccount', name: identity.name, namespace: identity.namespace }];
  if (cluster) { if (binding) await rbac.replaceClusterRoleBinding({ name: roleName, body: { ...binding, roleRef, subjects } }); else await rbac.createClusterRoleBinding({ body: { metadata: { name: roleName, labels }, roleRef, subjects } }); }
  else { if (binding) await rbac.replaceNamespacedRoleBinding({ name: roleName, namespace: identity.namespace, body: { ...binding, roleRef, subjects } }); else await rbac.createNamespacedRoleBinding({ namespace: identity.namespace, body: { metadata: { name: roleName, namespace: identity.namespace, labels }, roleRef, subjects } }); }
}

export async function issueRbacToken(context: string | undefined, namespace: string, name: string, durationSeconds: number, settings: Partial<ConnectionSettings>) {
  if (settings.mode === 'mock') return { token: `mock.${Buffer.from(`system:serviceaccount:${namespace}:${name}`).toString('base64url')}.signature`, expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString() };
  const { core, auth } = clients(context, settings);
  await requireAccess(auth, [{ verb: 'create', group: '', resource: 'serviceaccounts/token', namespace, name, command: `kubectl auth can-i create serviceaccounts/token -n ${namespace}` }]);
  const audience = process.env.KLYSTR_TOKEN_AUDIENCE?.trim() || 'https://kubernetes.default.svc';
  const result = await core.createNamespacedServiceAccountToken({ name, namespace, body: { apiVersion: 'authentication.k8s.io/v1', kind: 'TokenRequest', spec: { audiences: [audience], expirationSeconds: Math.min(3600, Math.max(600, durationSeconds)) } } });
  if (!result.status?.token) throw new Error('Kubernetes did not issue a token.');
  return { token: result.status.token, expiresAt: result.status.expirationTimestamp?.toISOString?.() ?? String(result.status.expirationTimestamp) };
}

export function defaultRbacNamespace() { return projectName(); }
