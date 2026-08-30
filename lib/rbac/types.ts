export const RBAC_VERBS = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'] as const;
export type RbacVerb = typeof RBAC_VERBS[number];
export interface RbacResource { id: string; label: string; group: string; resource: string; risk?: 'sensitive' | 'critical' }
export interface RbacRuleSelection { resourceId: string; verbs: RbacVerb[] }
export interface RbacIdentity { name: string; namespace: string; scope: 'namespace' | 'cluster'; rules: RbacRuleSelection[]; managed: boolean }
export interface RbacInventory { identities: RbacIdentity[]; namespaces: string[] }

export const RBAC_RESOURCES: RbacResource[] = [
  { id: 'pods', label: 'Pods', group: '', resource: 'pods' },
  { id: 'deployments', label: 'Deployments', group: 'apps', resource: 'deployments' },
  { id: 'statefulsets', label: 'StatefulSets', group: 'apps', resource: 'statefulsets' },
  { id: 'daemonsets', label: 'DaemonSets', group: 'apps', resource: 'daemonsets' },
  { id: 'jobs', label: 'Jobs', group: 'batch', resource: 'jobs' },
  { id: 'cronjobs', label: 'CronJobs', group: 'batch', resource: 'cronjobs' },
  { id: 'services', label: 'Services', group: '', resource: 'services' },
  { id: 'ingresses', label: 'Ingress', group: 'networking.k8s.io', resource: 'ingresses' },
  { id: 'configmaps', label: 'ConfigMaps', group: '', resource: 'configmaps' },
  { id: 'secrets', label: 'Secrets', group: '', resource: 'secrets', risk: 'sensitive' },
  { id: 'serviceaccounts', label: 'ServiceAccounts', group: '', resource: 'serviceaccounts', risk: 'sensitive' },
  { id: 'persistentvolumeclaims', label: 'PVCs', group: '', resource: 'persistentvolumeclaims' },
  { id: 'networkpolicies', label: 'NetworkPolicies', group: 'networking.k8s.io', resource: 'networkpolicies' },
  { id: 'roles', label: 'Roles', group: 'rbac.authorization.k8s.io', resource: 'roles', risk: 'critical' },
  { id: 'rolebindings', label: 'RoleBindings', group: 'rbac.authorization.k8s.io', resource: 'rolebindings', risk: 'critical' },
  { id: 'nodes', label: 'Nodes', group: '', resource: 'nodes', risk: 'critical' },
  { id: 'namespaces', label: 'Namespaces', group: '', resource: 'namespaces', risk: 'critical' },
];
