import type { GraphEdgeRecord, ResourceNode } from './types';

export type InsightSeverity = 'critical' | 'warning' | 'info';
export type InsightCategory = 'relationship' | 'security' | 'reliability' | 'observability' | 'metadata';

export interface ManifestInsight {
  id: string;
  nodeKey: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  description: string;
  fieldPath?: string;
  containerName?: string;
}

const WORKLOAD_KINDS = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);

function isMutableImage(image: string) {
  if (image.includes('@sha256:')) return false;
  const lastSegment = image.slice(image.lastIndexOf('/') + 1);
  return !lastSegment.includes(':') || lastSegment.endsWith(':latest');
}

function selectorMatchesLabels(selector: Record<string, unknown>, labels: Record<string, string>) {
  const matchLabels = selector.matchLabels && typeof selector.matchLabels === 'object'
    ? selector.matchLabels as Record<string, unknown>
    : selector;
  return Object.entries(matchLabels).every(([key, value]) => key === 'matchExpressions' || labels[key] === value);
}

export function analyzeManifestGraph(nodes: ResourceNode[], edges: GraphEdgeRecord[], conflictKeys: Set<string> = new Set()) {
  const insights: ManifestInsight[] = [];
  const connected = new Set(edges.flatMap(edge => [edge.from, edge.to]));
  const add = (node: ResourceNode, insight: Omit<ManifestInsight, 'id' | 'nodeKey'>) => insights.push({
    ...insight, nodeKey: node.key, id: `${node.key}:${insight.category}:${insight.fieldPath ?? insight.title}:${insight.containerName ?? ''}`,
  });

  for (const node of nodes) {
    if (conflictKeys.has(node.key)) add(node, { severity: 'warning', category: 'reliability', title: 'Conflicting definition', description: 'This resource is defined more than once; review which source won ingestion.' });
    for (const ref of node.structuralRefs.filter(candidate => !candidate.resolved && candidate.mode === 'byName')) add(node, {
      severity: ['Ingress', 'HorizontalPodAutoscaler'].includes(node.kind) ? 'critical' : 'warning', category: 'relationship',
      title: `Missing ${ref.targetKind ?? 'dependency'}${ref.targetName ? ` “${ref.targetName}”` : ''}`, description: 'The referenced object is not present in the effective namespace of this manifest set.',
      fieldPath: ref.fieldPath, containerName: ref.containerName,
    });
    if (!connected.has(node.key)) add(node, { severity: 'info', category: 'relationship', title: 'Isolated object', description: 'No resolved incoming or outgoing relation was found.' });

    if (WORKLOAD_KINDS.has(node.kind)) {
      const labels = node.canonicalPodLabels ?? node.raw.metadata?.labels ?? {};
      if (!labels['app.kubernetes.io/name']) add(node, { severity: 'info', category: 'metadata', title: 'Application label missing', description: 'Add app.kubernetes.io/name to improve grouping and cross-tool visibility.', fieldPath: 'metadata.labels' });
      const spec = node.canonicalPodSpec ?? {};
      const workloadSelector = node.kind !== 'Pod' && node.kind !== 'Job' && node.kind !== 'CronJob' ? node.raw.spec?.selector : undefined;
      if (workloadSelector && typeof workloadSelector === 'object' && !selectorMatchesLabels(workloadSelector, labels)) add(node, { severity: 'critical', category: 'reliability', title: 'Workload selector mismatch', description: 'The workload selector does not match its declared Pod template labels.', fieldPath: 'spec.selector' });
      if (spec.hostNetwork || spec.hostPID || spec.hostIPC) add(node, { severity: 'critical', category: 'security', title: 'Host namespace enabled', description: 'This workload shares a host network, process, or IPC namespace.', fieldPath: 'canonicalPodSpec' });
      for (const [index, volume] of (spec.volumes ?? []).entries()) if (volume.hostPath) add(node, { severity: 'warning', category: 'security', title: 'HostPath volume', description: 'HostPath directly exposes node filesystem data to the Pod.', fieldPath: `canonicalPodSpec.volumes[${index}].hostPath` });
      const volumeNames = new Set((spec.volumes ?? []).map((volume: { name?: unknown }) => volume.name).filter((name: unknown): name is string => typeof name === 'string'));
      for (const container of node.containers) {
        const image = typeof container.spec.image === 'string' ? container.spec.image : '';
        if (!image) add(node, { severity: 'critical', category: 'reliability', title: 'Container image missing', description: 'Every declared container requires an image.', containerName: container.name, fieldPath: 'image' });
        else if (isMutableImage(image)) add(node, { severity: 'warning', category: 'reliability', title: 'Mutable image tag', description: 'Pin a deterministic image version or digest.', containerName: container.name, fieldPath: 'image' });
        if (container.role === 'container' && (!container.spec.resources?.requests || !container.spec.resources?.limits)) add(node, { severity: 'warning', category: 'reliability', title: 'Resource policy incomplete', description: 'Container resource requests or limits are missing.', containerName: container.name, fieldPath: 'resources' });
        if (container.role === 'container' && !container.spec.readinessProbe && !container.spec.livenessProbe) add(node, { severity: 'info', category: 'observability', title: 'Health probes missing', description: 'No readiness or liveness probe is declared for this container.', containerName: container.name, fieldPath: 'readinessProbe' });
        if (container.spec.securityContext?.privileged || container.spec.securityContext?.allowPrivilegeEscalation === true) add(node, { severity: 'critical', category: 'security', title: 'Privileged container', description: 'The container is privileged or explicitly permits privilege escalation.', containerName: container.name, fieldPath: 'securityContext' });
        const dangerousCapabilities = (container.spec.securityContext?.capabilities?.add ?? []).filter((capability: unknown) => ['ALL', 'SYS_ADMIN', 'NET_ADMIN'].includes(String(capability)));
        if (dangerousCapabilities.length) add(node, { severity: 'critical', category: 'security', title: 'Dangerous Linux capability', description: `The container adds ${dangerousCapabilities.join(', ')}.`, containerName: container.name, fieldPath: 'securityContext.capabilities.add' });
        for (const [portIndex, port] of (container.spec.ports ?? []).entries()) if (port.hostPort) add(node, { severity: 'warning', category: 'security', title: 'Host port exposed', description: `Container port ${port.containerPort ?? '?'} is bound directly on the node.`, containerName: container.name, fieldPath: `ports[${portIndex}].hostPort` });
        for (const [mountIndex, mount] of (container.spec.volumeMounts ?? []).entries()) if (typeof mount.name === 'string' && !volumeNames.has(mount.name)) add(node, { severity: 'critical', category: 'reliability', title: 'Undeclared volume mount', description: `Volume mount “${mount.name}” has no matching Pod volume.`, containerName: container.name, fieldPath: `volumeMounts[${mountIndex}].name` });
      }
    }
    if (node.kind === 'Service') {
      const selectorRefs = node.structuralRefs.filter(ref => ref.mode === 'bySelector');
      if (node.raw.spec?.selector && selectorRefs.every(ref => !ref.resolved)) add(node, { severity: 'critical', category: 'relationship', title: 'Service has no workload targets', description: 'The Service selector matches no uploaded Pod or workload template.', fieldPath: 'spec.selector' });
    }
  }
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.title.localeCompare(b.title));
}
