import type { K8sResource, DiscoveryWarning, GraphData, GraphNode, GraphEdge } from '@/lib/types';
import type { K8sKind } from '@/config/resource-types';
import { runDetectorPipeline } from '@/lib/detectors/pipeline';
import { resolveDependencies } from '@/lib/resolver/resolver';
import { detectContainerMetaphor } from '@/lib/graph/pod-metaphor';

/** Build a full graph from discovered K8s resources */
export function buildGraph(
  resources: K8sResource[],
  contextName: string,
  warnings: DiscoveryWarning[] = [],
  containerMetaphorDimensions = 32,
): GraphData {
  // 1. Run detection pipeline
  const candidates = runDetectorPipeline(resources);

  // 2. Resolve dependencies
  const resolved = resolveDependencies(candidates, resources);

  // 3. Build nodes (skip Namespace kind — they become groups)
  const nodeResources = resources.filter(r => r.kind !== 'Namespace');
  const nodes: GraphNode[] = nodeResources.map(r => ({
    id: r.uid,
    kind: r.kind as K8sKind,
    name: r.name,
    namespace: r.namespace,
    status: r.status,
    resourceUid: r.uid,
    metadata: {
      ip: r.clusterIP ?? r.podIP,
      ports: r.ports,
      labels: r.labels,
      selector: r.kind === 'Service' ? r.selector : undefined,
      serviceType: r.kind === 'Service' ? (r.clusterIP === 'None' ? 'Headless' : r.serviceType ?? 'ClusterIP') : undefined,
      containers: r.kind === 'Pod' ? (r.containers ?? []).map((container, index) => ({
        name: container.name,
        image: container.image,
        imageId: container.imageId,
        type: container.type ?? (index === 0 ? 'app' : 'container'),
        ports: container.ports,
        metaphor: detectContainerMetaphor(container, containerMetaphorDimensions) ?? null,
        status: container.status ?? (container.ready === false ? 'NotReady' : container.ready === true || r.status === 'Running' ? 'Running' : undefined),
        ready: container.ready,
        restartCount: container.restartCount,
      })) : undefined,
      nodeName: r.kind === 'Pod' ? r.nodeName : undefined,
    },
  }));

  // 4. Add external nodes for unresolved destinations
  const externalDests = resolved.filter(d => d.destinationUid === null);
  const seenExternal = new Set<string>();
  for (const dep of externalDests) {
    if (seenExternal.has(dep.destinationName)) continue;
    seenExternal.add(dep.destinationName);
    const extId = `ext-${dep.destinationName}`;
    nodes.push({
      id: extId,
      kind: 'External',
      name: dep.destinationName,
      namespace: null,
      resourceUid: extId,
      metadata: {},
    });
  }

  // 5. Build edges
  const edges: GraphEdge[] = resolved.map(dep => {
    const targetId = dep.destinationUid ?? `ext-${dep.destinationName}`;
    const sourceNs = dep.sourceNamespace;
    const targetNs = dep.destinationNamespace;
    const isCrossNamespace = sourceNs !== null && targetNs !== null && sourceNs !== targetNs;

    const relationshipCategory = dep.relationshipCategory ?? (
      dep.edgeKind === 'ownership' ? 'ownership'
      : dep.destinationKind === 'External' || dep.sourceKind === 'External' ? 'external'
      : dep.sourceKind === 'StorageClass' || dep.destinationKind === 'StorageClass' ? 'storage-association'
      : (dep.sourceKind === 'PersistentVolume' && dep.destinationKind === 'PersistentVolumeClaim') ||
        (dep.sourceKind === 'PersistentVolumeClaim' && dep.destinationKind === 'PersistentVolume') ? 'storage-binding'
      : dep.destinationKind === 'PersistentVolumeClaim' || dep.sourceKind === 'PersistentVolumeClaim' ? 'attachment'
      : dep.destinationKind === 'ConfigMap' || dep.destinationKind === 'Secret' || dep.sourceKind === 'ConfigMap' || dep.sourceKind === 'Secret' ? 'config'
      : dep.sourceKind === 'ServiceAccount' || dep.destinationKind === 'ServiceAccount' ? 'identity'
      : dep.sourceKind === 'NetworkPolicy' || dep.destinationKind === 'NetworkPolicy' ? 'policy'
      : dep.sourceKind === 'HorizontalPodAutoscaler' || dep.destinationKind === 'HorizontalPodAutoscaler' ? 'scaling'
      : 'network'
    );

    return {
      id: dep.id,
      source: dep.sourceUid,
      target: targetId,
      edgeKind: dep.edgeKind,
      relationshipCategory,
      confidence: dep.confidence,
      connectionString: dep.connectionString,
      protocol: dep.protocol,
      port: dep.port,
      networkPolicyStatus: dep.networkPolicyStatus,
      evidence: dep.evidence,
      isCrossNamespace,
    };
  });

  // 6. Deduplicate edges (same source→target→relationshipCategory)
  const uniqueEdges = new Map<string, GraphEdge>();
  for (const edge of edges) {
    const key = `${edge.source}→${edge.target}:${edge.relationshipCategory ?? edge.edgeKind}`;
    if (uniqueEdges.has(key)) {
      const existing = uniqueEdges.get(key)!;
      existing.evidence.push(...edge.evidence);
    } else {
      uniqueEdges.set(key, edge);
    }
  }

  // 7. Get namespaces
  const namespaces = resources
    .filter(r => r.kind === 'Namespace')
    .map(r => r.name);

  return {
    nodes,
    edges: Array.from(uniqueEdges.values()),
    namespaces,
    warnings,
    timestamp: new Date().toISOString(),
    contextName,
  };
}
