export type PermissionVerb = 'get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete' | 'deletecollection' | 'bind' | 'escalate' | 'impersonate' | 'approve';

export interface PermissionTarget {
  id: string;
  label: string;
  group: string;
  resource: string;
  namespaced: boolean;
  description: string;
  special?: Array<{ label: string; id: string; verb: PermissionVerb; resource?: string; group?: string; description: string }>;
}

export const MATRIX_VERBS = ['get', 'create', 'patch', 'delete'] as const;

export const PERMISSION_TARGETS: PermissionTarget[] = [
  { id: 'pods', label: 'Pods', group: '', resource: 'pods', namespaced: true, description: 'Run and inspect application containers', special: [
    { label: 'Logs', id: 'pods.logs', verb: 'get', resource: 'pods/log', description: 'Read container logs' },
    { label: 'Exec', id: 'pods.exec', verb: 'create', resource: 'pods/exec', description: 'Run commands in containers' },
    { label: 'Attach', id: 'pods.attach', verb: 'create', resource: 'pods/attach', description: 'Attach to container processes' },
    { label: 'Port-forward', id: 'pods.portforward', verb: 'create', resource: 'pods/portforward', description: 'Forward local ports to Pods' },
  ] },
  { id: 'deployments', label: 'Deployments', group: 'apps', resource: 'deployments', namespaced: true, description: 'Manage stateless workloads', special: [
    { label: 'Scale', id: 'deployments.scale', verb: 'patch', resource: 'deployments/scale', description: 'Change replica count' },
    { label: 'Restart', id: 'deployments.restart', verb: 'patch', description: 'Patch the Pod template to restart' },
    { label: 'Rollback', id: 'deployments.rollback', verb: 'patch', description: 'Restore a previous Pod template' },
  ] },
  { id: 'statefulsets', label: 'StatefulSets', group: 'apps', resource: 'statefulsets', namespaced: true, description: 'Manage stateful workloads', special: [
    { label: 'Scale', id: 'statefulsets.scale', verb: 'patch', resource: 'statefulsets/scale', description: 'Change replica count' },
    { label: 'Restart', id: 'statefulsets.restart', verb: 'patch', description: 'Patch the Pod template to restart' },
    { label: 'Rollout', id: 'statefulsets.rollout', verb: 'patch', description: 'Update the Pod template' },
  ] },
  { id: 'daemonsets', label: 'DaemonSets', group: 'apps', resource: 'daemonsets', namespaced: true, description: 'Manage node-wide workloads', special: [
    { label: 'Restart', id: 'daemonsets.restart', verb: 'patch', description: 'Patch the Pod template to restart' },
    { label: 'Rollout', id: 'daemonsets.rollout', verb: 'patch', description: 'Update the Pod template' },
  ] },
  { id: 'jobs', label: 'Jobs', group: 'batch', resource: 'jobs', namespaced: true, description: 'Manage one-time workloads' },
  { id: 'cronjobs', label: 'CronJobs', group: 'batch', resource: 'cronjobs', namespaced: true, description: 'Manage scheduled workloads', special: [
    { label: 'Run job', id: 'cronjobs.run', verb: 'create', resource: 'jobs', group: 'batch', description: 'Create a Job from a CronJob' },
    { label: 'Suspend', id: 'cronjobs.suspend', verb: 'patch', description: 'Pause or resume the schedule' },
  ] },
  { id: 'services', label: 'Services', group: '', resource: 'services', namespaced: true, description: 'Manage stable network endpoints', special: [
    { label: 'Port-forward', id: 'services.portforward', verb: 'create', resource: 'services/portforward', description: 'Forward local ports to Services' },
  ] },
  { id: 'ingresses', label: 'Ingress', group: 'networking.k8s.io', resource: 'ingresses', namespaced: true, description: 'Manage external routing and TLS' },
  { id: 'networkpolicies', label: 'NetworkPolicies', group: 'networking.k8s.io', resource: 'networkpolicies', namespaced: true, description: 'Control workload network access' },
  { id: 'configmaps', label: 'ConfigMaps', group: '', resource: 'configmaps', namespaced: true, description: 'Manage application configuration' },
  { id: 'secrets', label: 'Secrets', group: '', resource: 'secrets', namespaced: true, description: 'Manage credentials and sensitive values' },
  { id: 'serviceaccounts', label: 'ServiceAccounts', group: '', resource: 'serviceaccounts', namespaced: true, description: 'Manage workload identities' },
  { id: 'namespaces', label: 'Namespaces', group: '', resource: 'namespaces', namespaced: false, description: 'Manage cluster tenancy boundaries' },
  { id: 'persistentvolumeclaims', label: 'PVCs', group: '', resource: 'persistentvolumeclaims', namespaced: true, description: 'Request and release storage' },
  { id: 'persistentvolumes', label: 'PersistentVolumes', group: '', resource: 'persistentvolumes', namespaced: false, description: 'Control cluster-wide storage' },
  { id: 'storageclasses', label: 'StorageClasses', group: 'storage.k8s.io', resource: 'storageclasses', namespaced: false, description: 'Configure dynamic provisioning' },
  { id: 'nodes', label: 'Nodes', group: '', resource: 'nodes', namespaced: false, description: 'Manage cluster machines', special: [
    { label: 'Cordon / label / taint', id: 'nodes.patch', verb: 'patch', description: 'Modify scheduling and node metadata' },
    { label: 'Drain', id: 'nodes.drain', verb: 'create', resource: 'pods/eviction', description: 'Evict workloads while draining' },
  ] },
  { id: 'roles', label: 'Roles', group: 'rbac.authorization.k8s.io', resource: 'roles', namespaced: true, description: 'Define namespace permissions' },
  { id: 'rolebindings', label: 'RoleBindings', group: 'rbac.authorization.k8s.io', resource: 'rolebindings', namespaced: true, description: 'Grant namespace permissions', special: [
    { label: 'Bind', id: 'rolebindings.bind', verb: 'bind', description: 'Bind roles to identities' },
  ] },
  { id: 'clusterroles', label: 'ClusterRoles', group: 'rbac.authorization.k8s.io', resource: 'clusterroles', namespaced: false, description: 'Define cluster-wide permissions', special: [
    { label: 'Escalate', id: 'clusterroles.escalate', verb: 'escalate', description: 'Create roles stronger than your own access' },
  ] },
  { id: 'clusterrolebindings', label: 'ClusterRoleBindings', group: 'rbac.authorization.k8s.io', resource: 'clusterrolebindings', namespaced: false, description: 'Grant cluster-wide access', special: [
    { label: 'Bind', id: 'clusterrolebindings.bind', verb: 'bind', description: 'Bind cluster roles to identities' },
  ] },
  { id: 'customresourcedefinitions', label: 'CRDs', group: 'apiextensions.k8s.io', resource: 'customresourcedefinitions', namespaced: false, description: 'Add and remove custom APIs' },
  { id: 'webhooks', label: 'Webhooks', group: 'admissionregistration.k8s.io', resource: 'validatingwebhookconfigurations', namespaced: false, description: 'Intercept Kubernetes API operations' },
  { id: 'apiservices', label: 'API services', group: 'apiregistration.k8s.io', resource: 'apiservices', namespaced: false, description: 'Extend the Kubernetes API' },
  { id: 'certificates', label: 'Certificates', group: 'certificates.k8s.io', resource: 'certificatesigningrequests', namespaced: false, description: 'Manage certificate requests', special: [
    { label: 'Approve', id: 'certificates.approve', verb: 'approve', resource: 'signers', description: 'Approve certificate requests when authorized' },
  ] },
  { id: 'events', label: 'Events', group: '', resource: 'events', namespaced: true, description: 'Inspect cluster activity' },
  { id: 'systemcomponents', label: 'System components', group: '', resource: 'configmaps', namespaced: true, description: 'Modify configuration in kube-system' },
];

export const SENSITIVE_CHECKS = [
  { id: 'global.impersonate.users', label: 'Impersonate users', verb: 'impersonate' as const, group: '', resource: 'users', description: 'Act as another Kubernetes user' },
  { id: 'global.impersonate.groups', label: 'Impersonate groups', verb: 'impersonate' as const, group: '', resource: 'groups', description: 'Act as another Kubernetes group' },
  { id: 'global.deletecollection.pods', label: 'Bulk delete Pods', verb: 'deletecollection' as const, group: '', resource: 'pods', description: 'Delete many Pods in one request' },
];
