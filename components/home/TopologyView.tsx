'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { useGraphStore } from '@/stores/graph-store';
import { useUIStore } from '@/stores/ui-store';
import { useDiscoveryStore } from '@/stores/discovery-store';
import { useFilterStore } from '@/stores/filter-store';
import { useShellSnapshot } from '@/lib/shell-sdk/runtime';
import type { GraphNode, PodMetricsResponse } from '@/lib/types';
import type { ContainerMetaphorMatch } from '@/lib/graph/pod-metaphor';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import {
  useMergedGraphData,
  useNamespaceResourceQueries,
  useNamespacesQuery,
  useNodesQuery,
} from '@/lib/hooks/use-topology-queries';

// ─── Dynamic imports ──────────────────────────────────────────────────────────
// Each chunk is only downloaded when the topology page is first visited.
// ssr: false prevents ReactFlow / canvas APIs from running on the server.

const GraphCanvas = dynamic(
  () => import('@/components/graph/GraphCanvas').then(m => ({ default: m.GraphCanvas })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <LoadingIndicator size="lg" label="Loading graph engine…" />
      </div>
    ),
  }
);

// ReactFlowProvider must wrap GraphCanvas — import it dynamically too so
// the @xyflow/react bundle is in the same split chunk.
const ReactFlowProvider = dynamic(
  () => import('@xyflow/react').then(m => ({ default: m.ReactFlowProvider })),
  { ssr: false }
);

const FilterSidebar = dynamic(
  () => import('@/components/filters/FilterSidebar').then(m => ({ default: m.FilterSidebar })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center p-4">
        <LoadingIndicator size="sm" label="Loading filters…" />
      </div>
    ),
  }
);

const NodeDetailsPanel = dynamic(
  () => import('@/components/panels/NodeDetailsPanel').then(m => ({ default: m.NodeDetailsPanel })),
  { ssr: false }
);

const EdgeDetailsPanel = dynamic(
  () => import('@/components/panels/EdgeDetailsPanel').then(m => ({ default: m.EdgeDetailsPanel })),
  { ssr: false }
);

// CommandPalette registers global keyboard shortcuts — load after mount
const CommandPalette = dynamic(
  () => import('@/components/command/CommandPalette').then(m => ({ default: m.CommandPalette })),
  { ssr: false }
);

// ─────────────────────────────────────────────────────────────────────────────

type ContainerMetaphorMap = Record<string, Record<string, ContainerMetaphorMatch | null>>;

export function TopologyView() {
  const { connection: connectionSettings, activeContext: shellActiveContext } = useShellSnapshot();
  const settingsReady = true;

  const [containerMetaphors, setContainerMetaphors] = useState<ContainerMetaphorMap>({});
  const [containerMetaphorsLoading, setContainerMetaphorsLoading] = useState(false);
  const [podMetrics, setPodMetrics] = useState<Record<string, PodMetricsResponse['metrics']>>({});
  const [metricsStatus, setMetricsStatus] = useState<Record<string, 'off' | 'loading' | 'available' | 'unavailable'>>({});
  const [metricsErrors, setMetricsErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();

  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId);
  const isFilterSidebarOpen = useUIStore(s => s.isFilterSidebarOpen);
  const setFilterSidebarOpen = useUIStore(s => s.setFilterSidebarOpen);
  const setIsDiscovering = useDiscoveryStore(s => s.setIsDiscovering);
  const setLastDiscoveredAt = useDiscoveryStore(s => s.setLastDiscoveredAt);
  const autoRefreshInterval = useDiscoveryStore(s => s.autoRefreshInterval);

  const activeContext = useFilterStore(s => s.activeContext);
  const setActiveContext = useFilterStore(s => s.setActiveContext);
  const applyFilterParams = useFilterStore(s => s.applyFilterParams);
  const namespaceSelection = useFilterStore(s => s.namespaceSelection);
  const selectedNamespaces = useFilterStore(s => s.selectedNamespaces);
  const visibleKinds = useFilterStore(s => s.visibleKinds);
  const containerMetaphorDimensions = useFilterStore(s => s.containerMetaphorDimensions);

  // Derive a stable serialized string of URL-relevant filter state.
  // The useEffect below uses this as its dependency so it only fires when
  // something that actually affects the URL changes — not on every render.
  const filterParamsString = useFilterStore(s => {
    const p = s.getFilterParams();
    return new URLSearchParams(p).toString();
  });

  // Mirror shell-owned context into this feature's local filter state.
  useEffect(() => {
    if (activeContext !== shellActiveContext) setActiveContext(shellActiveContext);
  }, [activeContext, setActiveContext, shellActiveContext]);

  // Collapse sidebar on mobile
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    if (media.matches) setFilterSidebarOpen(false);
  }, [setFilterSidebarOpen]);

  // Restore filter state from URL on mount
  const didRestoreUrl = useRef(false);
  useEffect(() => {
    if (didRestoreUrl.current) return;
    didRestoreUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.toString()) applyFilterParams(params);
  }, [applyFilterParams]);

  // Sync filter state to URL — only re-run when URL-relevant filter state changes.
  useEffect(() => {
    const url = filterParamsString ? `?${filterParamsString}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [filterParamsString]);

  // 1. Fetch Cluster Nodes
  const nodesQuery = useNodesQuery(activeContext, connectionSettings, settingsReady);

  // 2. Fetch Cluster Namespaces
  const namespacesQuery = useNamespacesQuery(activeContext, connectionSettings, settingsReady);

  // Determine target namespaces to load
  const targetNamespaces = useMemo(() => {
    if (namespaceSelection === 'none') return [];
    if (namespaceSelection === 'selected') return selectedNamespaces;
    return namespacesQuery.data?.namespaces ?? [];
  }, [namespaceSelection, selectedNamespaces, namespacesQuery.data?.namespaces]);

  // 3. Fetch Namespace Resources independently in parallel
  const namespaceQueries = useNamespaceResourceQueries(
    targetNamespaces,
    visibleKinds,
    activeContext,
    connectionSettings,
    settingsReady,
  );

  // 4. Merge results into unified GraphData
  const baseGraphData = useMergedGraphData({
    nodesData: nodesQuery.data,
    namespacesData: namespacesQuery.data,
    namespaceQueries,
    selectedNamespaces: targetNamespaces,
  });

  // Inject metrics into graph data if active
  const graphData = useMemo(() => {
    if (!baseGraphData) return null;
    let modified = false;

    const updatedNodes = baseGraphData.nodes.map((node): GraphNode => {
      if (node.kind === 'Pod' && node.namespace && podMetrics[node.namespace]) {
        const metric = podMetrics[node.namespace][`${node.namespace}/${node.name}`];
        if (metric) {
          modified = true;
          return { ...node, metadata: { ...node.metadata, podMetrics: metric } };
        }
      }
      return node;
    });

    const updatedNamespaceStates = { ...baseGraphData.namespaceStates };
    for (const ns of targetNamespaces) {
      if (metricsStatus[ns] && updatedNamespaceStates[ns]) {
        updatedNamespaceStates[ns] = {
          ...updatedNamespaceStates[ns],
          metricsStatus: metricsStatus[ns],
          metricsError: metricsErrors[ns],
        };
        modified = true;
      }
    }

    if (!modified) return baseGraphData;
    return { ...baseGraphData, nodes: updatedNodes, namespaceStates: updatedNamespaceStates };
  }, [baseGraphData, podMetrics, metricsStatus, metricsErrors, targetNamespaces]);

  // Track global discovery loading state
  const isGlobalFetching = nodesQuery.isFetching || namespacesQuery.isFetching || namespaceQueries.some(q => q.isFetching);
  useEffect(() => {
    setIsDiscovering(isGlobalFetching);
    if (!isGlobalFetching && baseGraphData.nodes.length > 0) {
      setLastDiscoveredAt(new Date().toISOString());
    }
  }, [isGlobalFetching, baseGraphData.nodes.length, setIsDiscovering, setLastDiscoveredAt]);

  // Handle Load/Refresh namespace action
  const loadNamespace = useCallback((namespace: string) => {
    const filters = useFilterStore.getState();
    if (filters.namespaceSelection !== 'all' && !filters.selectedNamespaces.includes(namespace)) {
      filters.setNamespaces([...filters.selectedNamespaces, namespace]);
      filters.setNamespaceSelection('selected');
    }
    void queryClient.invalidateQueries({ queryKey: ['topology', 'namespace', namespace] });
  }, [queryClient]);

  // Handle Enable/Toggle namespace pod metrics
  const toggleNamespaceMetrics = useCallback(async (namespace: string) => {
    if (metricsStatus[namespace] === 'available') {
      setMetricsStatus(prev => ({ ...prev, [namespace]: 'off' }));
      setPodMetrics(prev => { const next = { ...prev }; delete next[namespace]; return next; });
      return;
    }

    setMetricsStatus(prev => ({ ...prev, [namespace]: 'loading' }));
    try {
      const params = new URLSearchParams({ namespace });
      if (activeContext) params.set('ctx', activeContext);
      const response = await fetch(`/api/pod-metrics?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionSettings),
      });
      const result = await response.json() as PodMetricsResponse;
      if (!result.available) throw new Error(result.error ?? 'Pod metrics unavailable');
      setPodMetrics(prev => ({ ...prev, [namespace]: result.metrics }));
      setMetricsStatus(prev => ({ ...prev, [namespace]: 'available' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pod metrics unavailable';
      setMetricsErrors(prev => ({ ...prev, [namespace]: message }));
      setMetricsStatus(prev => ({ ...prev, [namespace]: 'unavailable' }));
    }
  }, [activeContext, connectionSettings, metricsStatus]);

  // Update container metaphors when dimensions change
  const appliedMetaphorDimensions = useRef(containerMetaphorDimensions);
  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return;
    if (appliedMetaphorDimensions.current === containerMetaphorDimensions) return;
    appliedMetaphorDimensions.current = containerMetaphorDimensions;

    const controller = new AbortController();
    setContainerMetaphorsLoading(true);

    fetch(`/api/container-metaphors${activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...connectionSettings,
        containerMetaphorDimensions,
        namespaces: Object.entries(graphData.namespaceStates ?? {})
          .filter(([, state]) => state.status === 'loaded')
          .map(([namespace]) => namespace),
      }),
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(result => setContainerMetaphors(result.metaphors))
      .catch(() => {})
      .finally(() => setContainerMetaphorsLoading(false));

    return () => controller.abort();
  }, [activeContext, connectionSettings, containerMetaphorDimensions, graphData]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ['topology'] });
    }, autoRefreshInterval);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, queryClient]);

  const handleLabelsChanged = useCallback(async () => {
    const selected = graphData?.nodes.find(node => node.id === useGraphStore.getState().selectedNodeId);
    if (selected?.namespace) loadNamespace(selected.namespace);
  }, [graphData?.nodes, loadNamespace]);

  const showDetailsPanel = selectedNodeId || selectedEdgeId;
  const isInitialLoading = nodesQuery.isLoading || namespacesQuery.isLoading;
  const isError = nodesQuery.isError || namespacesQuery.isError;
  const errorMessage =
    (nodesQuery.error as Error)?.message ||
    (namespacesQuery.error as Error)?.message ||
    'Kubernetes topology error';

  if (!settingsReady) {
    return (
      <div className="grid h-full place-items-center">
        <LoadingIndicator size="lg" label="Loading workspace…" />
      </div>
    );
  }

  return (
    <div key={connectionSettings.mode} className="relative flex h-full overflow-hidden">
      {/* Filter Sidebar */}
      <div
        className="app-surface app-border border-r transition-all duration-300 flex-shrink-0 overflow-hidden"
        style={{ width: isFilterSidebarOpen ? 288 : 0 }}
      >
        {isFilterSidebarOpen && (
          <FilterSidebar namespaces={graphData?.namespaces ?? []} />
        )}
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 relative">
        {isInitialLoading && !graphData?.nodes.length ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <LoadingIndicator size="lg" className="justify-center" />
              <h3 className="text-lg font-semibold app-heading">Discovering Nodes &amp; Namespaces...</h3>
              <p className="text-sm app-muted">Connecting to cluster and building topology boundaries</p>
            </div>
          </div>
        ) : isError && !graphData?.nodes.length ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-center">
              <h3 className="text-sm font-semibold text-destructive">Kubernetes connection failed</h3>
              <p className="mt-2 text-xs text-destructive/80">{errorMessage}</p>
              <p className="mt-3 text-[11px] app-muted">Check cluster connection and retry.</p>
            </div>
          </div>
        ) : (
          <ReactFlowProvider>
            <GraphCanvas
              graphData={graphData}
              containerMetaphors={containerMetaphors}
              containerMetaphorsLoading={containerMetaphorsLoading}
              connectionSettings={connectionSettings}
              activeContext={activeContext}
              onLabelsChanged={handleLabelsChanged}
              onLoadNamespace={loadNamespace}
              onToggleNamespaceMetrics={toggleNamespaceMetrics}
            />
          </ReactFlowProvider>
        )}
      </div>

      {/* Details Panel */}
      {showDetailsPanel && graphData && (
        <div className="absolute inset-y-0 right-0 z-30 w-[380px] overflow-hidden shadow-[-12px_0_32px_rgba(0,0,0,0.18)]">
          {selectedNodeId && (
            <NodeDetailsPanel graphData={graphData} connectionSettings={connectionSettings} />
          )}
          {selectedEdgeId && !selectedNodeId && (
            <EdgeDetailsPanel graphData={graphData} />
          )}
        </div>
      )}

      {/* CommandPalette registers global keyboard shortcuts */}
      <CommandPalette graphData={graphData} />
    </div>
  );
}
