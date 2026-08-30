import { useQuery, useQueries } from '@tanstack/react-query';
import type { ConnectionSettings, DiscoveryWarning, GraphData, GraphNode, NamespaceBoundaryState, TopologyNode } from '@/lib/types';
import type { K8sKind } from '@/config/resource-types';
import { useMemo } from 'react';

export interface TopologyNodesResponse {
  topologyNodes: TopologyNode[];
  warnings: DiscoveryWarning[];
  contextName: string;
}

export interface TopologyNamespacesResponse {
  namespaces: string[];
  warnings: DiscoveryWarning[];
  contextName: string;
}

async function fetchNodes(
  activeContext: string | null,
  connectionSettings: ConnectionSettings,
  signal?: AbortSignal
): Promise<TopologyNodesResponse> {
  const params = new URLSearchParams();
  if (activeContext) params.set('ctx', activeContext);

  const response = await fetch(`/api/topology/nodes?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connectionSettings),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch nodes (${response.status})`);
  }
  return response.json();
}

async function fetchNamespaces(
  activeContext: string | null,
  connectionSettings: ConnectionSettings,
  signal?: AbortSignal
): Promise<TopologyNamespacesResponse> {
  const params = new URLSearchParams();
  if (activeContext) params.set('ctx', activeContext);

  const response = await fetch(`/api/topology/namespaces?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connectionSettings),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch namespaces (${response.status})`);
  }
  return response.json();
}

async function fetchNamespaceResources(
  namespace: string,
  kinds: string[],
  activeContext: string | null,
  connectionSettings: ConnectionSettings,
  signal?: AbortSignal
): Promise<GraphData> {
  const resourceParam = kinds.map(k => k.toLowerCase()).join(',');
  const params = new URLSearchParams({ resources: resourceParam });
  if (activeContext) params.set('ctx', activeContext);

  const response = await fetch(`/api/topology/namespaces/${encodeURIComponent(namespace)}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connectionSettings),
    signal,
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(failure?.error ?? `Failed to fetch ${namespace} resources (${response.status})`);
  }
  return response.json();
}

export function useNodesQuery(activeContext: string | null, connectionSettings: ConnectionSettings, enabled = true) {
  return useQuery({
    queryKey: ['topology', connectionSettings.mode, 'nodes', activeContext ?? 'default'],
    queryFn: ({ signal }) => fetchNodes(activeContext, connectionSettings, signal),
    staleTime: 60000,
    gcTime: 300000,
    retry: 1,
    enabled,
  });
}

export function useNamespacesQuery(activeContext: string | null, connectionSettings: ConnectionSettings, enabled = true) {
  return useQuery({
    queryKey: ['topology', connectionSettings.mode, 'namespaces', activeContext ?? 'default'],
    queryFn: ({ signal }) => fetchNamespaces(activeContext, connectionSettings, signal),
    staleTime: 60000,
    gcTime: 300000,
    retry: 1,
    enabled,
  });
}

export function useNamespaceResourceQueries(
  selectedNamespaces: string[],
  visibleKinds: Set<K8sKind>,
  activeContext: string | null,
  connectionSettings: ConnectionSettings,
  enabled = true,
) {
  const sortedKinds = useMemo(() => [...visibleKinds].sort(), [visibleKinds]);

  return useQueries({
    queries: selectedNamespaces.map(namespace => ({
      queryKey: ['topology', connectionSettings.mode, 'namespace', namespace, sortedKinds, activeContext ?? 'default'],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchNamespaceResources(namespace, sortedKinds, activeContext, connectionSettings, signal),
      staleTime: 30000,
      gcTime: 300000,
      retry: 1,
      enabled: enabled && Boolean(namespace),
    })),
  });
}

/** Merges individual namespace GraphData results into a single unified GraphData structure with cross-namespace edge resolution. */
export function useMergedGraphData({
  nodesData,
  namespacesData,
  namespaceQueries,
  selectedNamespaces,
}: {
  nodesData?: TopologyNodesResponse;
  namespacesData?: TopologyNamespacesResponse;
  namespaceQueries: ReturnType<typeof useNamespaceResourceQueries>;
  selectedNamespaces: string[];
}) {
  return useMemo(() => {
    const availableNamespaces = namespacesData?.namespaces ?? [];
    const topologyNodes = nodesData?.topologyNodes;

    const namespaceStates: Record<string, NamespaceBoundaryState> = {};
    const loadedPatches: GraphData[] = [];

    selectedNamespaces.forEach((ns, index) => {
      const q = namespaceQueries[index];
      if (!q) return;

      if (q.isLoading && !q.data) {
        namespaceStates[ns] = {
          status: 'loading',
          resourceCount: 0,
          metricsStatus: 'off',
        };
      } else if (q.isError && !q.data) {
        namespaceStates[ns] = {
          status: 'error',
          error: q.error instanceof Error ? q.error.message : `Unable to load ${ns}`,
          resourceCount: 0,
          metricsStatus: 'off',
        };
      } else if (q.data) {
        const patchNodes = q.data.nodes.filter(n => n.namespace === ns);
        namespaceStates[ns] = {
          status: 'loaded',
          resourceCount: patchNodes.length,
          metricsStatus: 'off',
        };
        loadedPatches.push(q.data);
      }
    });

    if (loadedPatches.length === 0) {
      return {
        nodes: [],
        edges: [],
        namespaces: availableNamespaces,
        topologyNodes,
        namespaceStates,
        warnings: [...(nodesData?.warnings ?? []), ...(namespacesData?.warnings ?? [])],
        timestamp: new Date().toISOString(),
        contextName: nodesData?.contextName ?? 'dev-cluster',
      } as GraphData;
    }

    // Combine all nodes
    const nodeMap = new Map<string, GraphNode>();
    for (const patch of loadedPatches) {
      for (const node of patch.nodes) {
        nodeMap.set(node.id, node);
      }
    }
    const combinedNodes = [...nodeMap.values()];

    // Combine intra-namespace edges
    const edgeMap = new Map<string, GraphData['edges'][number]>();
    for (const patch of loadedPatches) {
      for (const edge of patch.edges) {
        edgeMap.set(edge.id, edge);
      }
    }

    // Resolve cross-namespace DNS / External service edges between loaded namespaces
    const services = combinedNodes.filter(n => n.kind === 'Service');
    const nodesById = new Map(combinedNodes.map(n => [n.id, n]));

    const mergedEdges = [...edgeMap.values()].map(edge => {
      const external = nodesById.get(edge.target);
      if (external?.kind !== 'External') return edge;

      const match = external.name.match(/^([a-z0-9-]+)\.([a-z0-9-]+)\.svc(?:\.cluster\.local)?$/i);
      if (!match) return edge;

      const service = services.find(candidate => candidate.name === match[1] && candidate.namespace === match[2]);
      if (!service) return edge;

      const source = nodesById.get(edge.source);
      return {
        ...edge,
        target: service.id,
        confidence: 'Confirmed' as const,
        isCrossNamespace: Boolean(source?.namespace && service.namespace && source.namespace !== service.namespace),
        evidence: edge.evidence.map(entry => ({
          ...entry,
          description: `Service DNS resolved after namespace load to Service/${service.name} in ${service.namespace}`,
        })),
      };
    });

    const connectedIds = new Set(mergedEdges.flatMap(edge => [edge.source, edge.target]));
    const retainedNodes = combinedNodes.filter(node => node.kind !== 'External' || connectedIds.has(node.id));

    const combinedWarnings = [
      ...(nodesData?.warnings ?? []),
      ...(namespacesData?.warnings ?? []),
      ...loadedPatches.flatMap(p => p.warnings),
    ];
    const uniqueWarnings = [...new Map(combinedWarnings.map(w => [`${w.resourceType}:${w.message}`, w])).values()];

    return {
      nodes: retainedNodes,
      edges: mergedEdges,
      namespaces: availableNamespaces,
      topologyNodes,
      namespaceStates,
      warnings: uniqueWarnings,
      timestamp: new Date().toISOString(),
      contextName: nodesData?.contextName ?? 'dev-cluster',
    } as GraphData;
  }, [nodesData, namespacesData, namespaceQueries, selectedNamespaces]);
}
