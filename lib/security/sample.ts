import type { SecuritySnapshot, SecurityTestRun } from './types';

export function buildSampleSecuritySnapshot(): SecuritySnapshot {
  return {
    source: 'sample', contextName: 'demo-cluster', generatedAt: new Date().toISOString(), namespaces: 6, warnings: [],
    controls: [
      { id: 'psa', title: 'Pod Security Admission coverage', category: 'Admission', status: 'warning', coverage: 67, evidence: '4 of 6 sample namespaces enforce baseline or restricted.', recommendation: 'Label remaining application namespaces with an appropriate enforce level.' },
      { id: 'rbac', title: 'Broad or escalating RBAC bindings', category: 'RBAC', status: 'fail', coverage: 70, evidence: '2 sample binding paths reach sensitive permissions.', recommendation: 'Replace broad roles with least-privilege grants.' },
      { id: 'network', title: 'Namespace network isolation', category: 'Network', status: 'warning', coverage: 50, evidence: '3 of 6 sample namespaces contain a NetworkPolicy.', recommendation: 'Add default-deny ingress and egress policies.' },
      { id: 'workloads', title: 'Restricted workload posture', category: 'Workloads', status: 'fail', coverage: 38, evidence: '2 sample workloads have critical or high-risk settings.', recommendation: 'Apply restricted security contexts and remove host access.' },
    ],
    attackPaths: [{ id: 'sample-public-admin', title: 'ServiceAccount can reach cluster-wide administration', severity: 'critical', summary: 'A sample public workload uses a ServiceAccount bound to cluster-admin.', nodes: [
      { label: 'api-runtime', type: 'ServiceAccount', detail: 'Namespace production' }, { label: 'platform-admins', type: 'ClusterRoleBinding', detail: 'Cluster scoped' }, { label: 'cluster-admin', type: 'ClusterRole', detail: 'Wildcard administrative permissions' },
    ] }],
    networkExposures: [
      { id: 'sample/api', entrypoint: 'api.example.test', namespace: 'production', route: '/ → Service/api', workload: 'Deployment/api', exposure: 'Ingress', policy: 'No namespace NetworkPolicy', severity: 'high' },
      { id: 'sample/metrics', entrypoint: 'node-metrics', namespace: 'monitoring', route: 'Service/node-metrics → DaemonSet/exporter', workload: 'DaemonSet/exporter', exposure: 'NodePort', policy: 'NetworkPolicy present', severity: 'medium' },
    ],
    workloadRisks: [
      { id: 'sample/operations/daemonset/debugger', workload: 'DaemonSet/debugger', namespace: 'operations', containers: 2, risks: ['Privileged container', 'Host namespace access', 'hostPath mount'], pss: 'privileged', severity: 'critical' },
      { id: 'sample/production/deployment/api', workload: 'Deployment/api', namespace: 'production', containers: 3, risks: ['ServiceAccount token automount', 'Writable root filesystem', 'Seccomp profile not declared'], pss: 'baseline', severity: 'high' },
      { id: 'sample/staging/deployment/catalog', workload: 'Deployment/catalog', namespace: 'staging', containers: 2, risks: [], pss: 'restricted', severity: 'info' },
    ],
  };
}

export function runSampleSecurityTests(testIds: string[], namespace: string): SecurityTestRun {
  return { contextName: 'demo-cluster', executedAt: new Date().toISOString(), readOnly: true, results: testIds.map((id, index) => ({ id, title: id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '), status: index === 0 ? 'warning' : 'pass', evidence: `Sample authorization review for ${namespace}: ${index === 0 ? 'sensitive permission allowed' : 'expected access confirmed'}.` })) };
}
