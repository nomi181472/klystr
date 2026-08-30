'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { ResourceNode } from './nodes/ResourceNode';
import { ExternalNode } from './nodes/ExternalNode';
import { NamespaceGroup } from './nodes/NamespaceGroup';
import { NodeGroup } from './nodes/NodeGroup';
import { ServiceAttachmentNode } from './nodes/ServiceAttachmentNode';
import { CommunicationEdge } from './edges/CommunicationEdge';
import { OwnershipEdge } from './edges/OwnershipEdge';
import { useGraphStore } from '@/stores/graph-store';
import { useFilterStore } from '@/stores/filter-store';
import type { ConnectionSettings, GraphData, GraphNode } from '@/lib/types';
import type { ContainerMetaphorMatch } from '@/lib/graph/pod-metaphor';
import type { K8sKind } from '@/config/resource-types';
import type { RelationshipCategory } from '@/config/constants';
import { computeLayout } from './layout-engine';
import { getDirectionalNeighborhood, getNeighborhood } from '@/lib/graph/neighborhood';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Map as MapIcon, Maximize2, X } from 'lucide-react';
import { ResourceLabelsDialog } from '@/components/graph/ResourceLabelsDialog';
import { EdgeLegendPanel } from './EdgeLegendPanel';

const nodeTypes = {
  resource: ResourceNode,
  external: ExternalNode,
  namespaceGroup: NamespaceGroup,
  nodeGroup: NodeGroup,
  serviceAttachment: ServiceAttachmentNode,
};

const edgeTypes = {
  communication: CommunicationEdge,
  ownership: OwnershipEdge,
};

interface GraphCanvasProps {
  graphData: GraphData | null;
  containerMetaphors: Record<string, Record<string, ContainerMetaphorMatch | null>>;
  containerMetaphorsLoading: boolean;
  connectionSettings: ConnectionSettings;
  activeContext: string | null;
  onLabelsChanged: () => Promise<void> | void;
  onLoadNamespace: (namespace: string) => void;
  onToggleNamespaceMetrics: (namespace: string) => void;
}

// Inner component that has access to React Flow instance
function GraphCanvasInner({ graphData, containerMetaphors, containerMetaphorsLoading, connectionSettings, activeContext, onLabelsChanged, onLoadNamespace, onToggleNamespaceMetrics }: GraphCanvasProps) {
  const { fitView, getNode, getViewport } = useReactFlow();

  const setSelectedNode = useGraphStore(s => s.setSelectedNode);
  const setSelectedEdge = useGraphStore(s => s.setSelectedEdge);
  const setHoveredNode = useGraphStore(s => s.setHoveredNode);
  const collapsedNamespaces = useGraphStore(s => s.collapsedNamespaces);
  const isolateNodeId = useGraphStore(s => s.isolateNodeId);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId);
  const pendingFitNodeId = useGraphStore(s => s.pendingFitNodeId);
  const setPendingFitNode = useGraphStore(s => s.setPendingFitNode);
  const clearInvestigation = useGraphStore(s => s.clearInvestigation);
  const highlightedEdgeCategory = useGraphStore(s => s.highlightedEdgeCategory);

  const visibleKinds = useFilterStore(s => s.visibleKinds);
  const showCommunicationEdges = useFilterStore(s => s.showCommunicationEdges);
  const showOwnershipEdges = useFilterStore(s => s.showOwnershipEdges);
  const animateCommunicationEdges = useFilterStore(s => s.animateCommunicationEdges);
  const namespaceLayout = useFilterStore(s => s.namespaceLayout);
  const namespaceLayoutCount = useFilterStore(s => s.namespaceLayoutCount);
  const selectedNamespaces = useFilterStore(s => s.selectedNamespaces);
  const namespaceSelection = useFilterStore(s => s.namespaceSelection);
  const minConfidence = useFilterStore(s => s.minConfidence);
  const searchQuery = useFilterStore(s => s.searchQuery);
  const crossNamespaceOnly = useFilterStore(s => s.crossNamespaceOnly);
  const networkPolicyFilter = useFilterStore(s => s.networkPolicyFilter);
  const includeOutOfScope = useFilterStore(s => s.includeOutOfScope);
  const labelFilter = useFilterStore(s => s.labelFilter);
  const activeDetectors = useFilterStore(s => s.activeDetectors);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isPreparing, setIsPreparing] = useState(true);
  const [readyToken, setReadyToken] = useState(0);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [editingLabelsNodeId, setEditingLabelsNodeId] = useState<string | null>(null);
  const layoutGeneration = useRef(0);
  const layoutConfigurationKey = useRef('');
  const graphDataRef = useRef(graphData);
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);
  // Track whether we've ever done an initial fitView for this graphData load
  const initialFitDone = useRef(false);

  // Patch only container data so metaphor tuning cannot trigger layout or edge work.
  useEffect(() => {
    setNodes(current => current.map(node => {
      if (node.type !== 'resource' || node.data.kind !== 'Pod') return node;
      const metaphors = containerMetaphors[node.id];
      const containers = (node.data.containers as GraphNode['metadata']['containers'] | undefined)?.map(container => ({
        ...container,
        metaphor: metaphors && Object.hasOwn(metaphors, container.name) ? metaphors[container.name] : container.metaphor,
      }));
      return { ...node, data: { ...node.data, containers, containerMetaphorsPending: containerMetaphorsLoading } };
    }));
  }, [containerMetaphors, containerMetaphorsLoading, setNodes]);

  // Boundary state changes only update the existing boundary nodes.
  useEffect(() => {
    const states = graphData?.namespaceStates;
    if (!states) return;
    setNodes(current => current.map(node => {
      if (node.type !== 'namespaceGroup') return node;
      const namespace = String(node.data.label ?? '');
      const state = states[namespace];
      if (!state || (node.data.status === state.status && node.data.error === state.error
        && node.data.metricsStatus === state.metricsStatus && node.data.metricsError === state.metricsError)) return node;
      return {
        ...node,
        data: {
          ...node.data,
          status: state.status,
          error: state.error,
          metricsStatus: state.metricsStatus,
          metricsError: state.metricsError,
        },
      };
    }));
  }, [graphData?.namespaceStates, setNodes]);

  // Metrics are a data-only patch; avoid rebuilding or repositioning the graph.
  useEffect(() => {
    if (!graphData?.nodes.length) return;
    const resourcesById = new Map(graphData.nodes.map(resource => [resource.id, resource]));
    setNodes(current => current.map(node => {
      const resource = resourcesById.get(node.id);
      if (!resource || node.type !== 'resource' || node.data.podMetrics === resource.metadata.podMetrics) return node;
      return { ...node, data: { ...node.data, podMetrics: resource.metadata.podMetrics } };
    }));
  }, [graphData?.nodes, setNodes]);

  // Selection only changes emphasis. Keep positions and the current viewport untouched.
  useEffect(() => {
    let neighborhood: ReturnType<typeof getDirectionalNeighborhood> | null = null;
    if (!isolateNodeId && graphData) {
      if (selectedNodeId) {
        neighborhood = getDirectionalNeighborhood(selectedNodeId, graphData.edges);
      } else if (selectedEdgeId) {
        const selectedGraphEdge = graphData.edges.find(edge => edge.id === selectedEdgeId);
        if (selectedGraphEdge) {
          const endpointNeighborhoods = [
            getDirectionalNeighborhood(selectedGraphEdge.source, graphData.edges),
            getDirectionalNeighborhood(selectedGraphEdge.target, graphData.edges),
          ];
          neighborhood = {
            nodeIds: new Set(endpointNeighborhoods.flatMap(result => [...result.nodeIds])),
            edgeIds: new Set(endpointNeighborhoods.flatMap(result => [...result.edgeIds])),
            incomingNodeIds: new Set(endpointNeighborhoods.flatMap(result => [...result.incomingNodeIds])),
            outgoingNodeIds: new Set(endpointNeighborhoods.flatMap(result => [...result.outgoingNodeIds])),
          };
          neighborhood.edgeIds.add(selectedGraphEdge.id);
        }
      }
    }
    setNodes(current => current.map(node => {
      if (node.type === 'namespaceGroup' || node.type === 'nodeGroup') return node;
      const canonicalNodeId = String(node.data.canonicalNodeId ?? node.id);
      const dimmed = Boolean(neighborhood && !neighborhood.nodeIds.has(canonicalNodeId));
      const pathDirection = neighborhood?.incomingNodeIds.has(canonicalNodeId) && neighborhood.outgoingNodeIds.has(canonicalNodeId)
        ? 'both'
        : neighborhood?.incomingNodeIds.has(canonicalNodeId)
          ? 'upstream'
          : neighborhood?.outgoingNodeIds.has(canonicalNodeId)
            ? 'downstream'
            : undefined;
      if (node.data.dimmed === dimmed && node.data.pathDirection === pathDirection) return node;
      return { ...node, data: { ...node.data, dimmed, pathDirection } };
    }));
    setEdges(current => current.map(edge => {
      const canonicalEdgeId = String(edge.data?.canonicalEdgeId ?? edge.id);
      const isInvestigationPath = Boolean(neighborhood?.edgeIds.has(canonicalEdgeId));
      const dimmed = Boolean(neighborhood && !neighborhood.edgeIds.has(canonicalEdgeId));
      if (edge.data?.isInvestigationPath === isInvestigationPath && edge.data?.dimmed === dimmed) return edge;
      return { ...edge, data: { ...edge.data, isInvestigationPath, dimmed } };
    }));
  }, [graphData, isolateNodeId, selectedEdgeId, selectedNodeId, setEdges, setNodes]);

  // Keep the topology readable: every edge stays below nodes until explicitly selected.
  // This is a z-index-only patch, so selecting an edge never recalculates the layout.
  useEffect(() => {
    setEdges(current => current.map(edge => {
      const canonicalEdgeId = String(edge.data?.canonicalEdgeId ?? edge.id);
      const zIndex = canonicalEdgeId === selectedEdgeId ? 10 : 1;
      return edge.zIndex === zIndex ? edge : { ...edge, zIndex };
    }));
  }, [readyToken, selectedEdgeId, setEdges]);

  // Namespace patches must not reset the viewport. Only a context change is a new graph.
  useEffect(() => {
    initialFitDone.current = false;
  }, [graphData?.contextName]);

  // Cover the canvas before paint so large select/unselect updates do not flicker.
  useLayoutEffect(() => {
    if (!graphData?.timestamp || readyToken > 0) return;
    // This overlay must be committed before the expensive layout can paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPreparing(true);
  }, [
    graphData?.timestamp,
    readyToken,
    visibleKinds,
    showCommunicationEdges,
    showOwnershipEdges,
    animateCommunicationEdges,
    namespaceLayout,
    namespaceLayoutCount,
    selectedNamespaces,
    namespaceSelection,
    minConfidence,
    searchQuery,
    crossNamespaceOnly,
    includeOutOfScope,
    collapsedNamespaces,
    isolateNodeId,
    labelFilter,
    activeDetectors,
    highlightedEdgeCategory,
  ]);

  // Build React Flow nodes/edges after the spinner can paint.
  useEffect(() => {
    const currentGraphData = graphDataRef.current;
    if (!currentGraphData?.timestamp) return;

    const generation = ++layoutGeneration.current;
    const configurationKey = JSON.stringify({
      visibleKinds: [...visibleKinds].sort(), showCommunicationEdges, showOwnershipEdges,
      namespaceLayout, namespaceLayoutCount, selectedNamespaces, namespaceSelection,
      minConfidence, searchQuery, crossNamespaceOnly, networkPolicyFilter, includeOutOfScope,
      collapsedNamespaces: [...collapsedNamespaces].sort(), isolateNodeId, labelFilter,
      activeDetectors: [...activeDetectors].sort(), highlightedEdgeCategory,
    });
    const preserveUnaffectedPositions = layoutConfigurationKey.current === configurationKey;
    layoutConfigurationKey.current = configurationKey;
    const timer = window.setTimeout(() => {
      const { flowNodes, flowEdges } = buildFlowElements(currentGraphData, {
        visibleKinds,
        showCommunicationEdges,
        showOwnershipEdges,
        animateCommunicationEdges,
        namespaceLayout,
        namespaceLayoutCount,
        selectedNamespaces,
        namespaceSelection,
        minConfidence,
        searchQuery,
        crossNamespaceOnly,
        networkPolicyFilter,
        includeOutOfScope,
        collapsedNamespaces,
        isolateNodeId,
        labelFilter,
        activeDetectors,
        highlightedEdgeCategory,
      }, setEditingLabelsNodeId, connectionSettings, activeContext);

      const activeNamespaces = selectedNamespaces.length > 0 && namespaceSelection === 'selected'
        ? selectedNamespaces
        : currentGraphData.namespaces;

      const positioned = computeLayout(flowNodes, flowEdges, activeNamespaces, {
        direction: namespaceLayout,
        count: namespaceLayoutCount,
        namespaceStates: currentGraphData.namespaceStates,
        topologyNodes: currentGraphData.topologyNodes,
        onLoadNamespace,
        onToggleNamespaceMetrics,
      });
      if (generation !== layoutGeneration.current) return;

      setNodes(current => reconcileFlowItems(current, positioned.nodes, preserveUnaffectedPositions));
      setEdges(current => reconcileFlowItems(current, positioned.edges, preserveUnaffectedPositions));
      setReadyToken(generation);
      setIsPreparing(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    graphData?.timestamp,
    visibleKinds,
    showCommunicationEdges,
    showOwnershipEdges,
    animateCommunicationEdges,
    namespaceLayout,
    namespaceLayoutCount,
    selectedNamespaces,
    namespaceSelection,
    minConfidence,
    searchQuery,
    crossNamespaceOnly,
    networkPolicyFilter,
    includeOutOfScope,
    collapsedNamespaces,
    isolateNodeId,
    labelFilter,
    activeDetectors,
    highlightedEdgeCategory,
    connectionSettings,
    activeContext,
    onLoadNamespace,
    onToggleNamespaceMetrics,
    setNodes,
    setEdges,
  ]);

  // After layout settles: remove preparing overlay, and fitView only on initial load
  useEffect(() => {
    if (!readyToken) return;

    let cancelled = false;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (cancelled || readyToken !== layoutGeneration.current) return;
        setIsPreparing(false);
        // Only fitView on first load of this graph data, not on filter changes
        if (!initialFitDone.current) {
          initialFitDone.current = true;
          fitView({ padding: 0.06, duration: 300, maxZoom: 1.15 });
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [readyToken, fitView]);

  // Handle jump-to-node (from CommandPalette)
  useEffect(() => {
    if (!pendingFitNodeId) return;
    // small delay to let React Flow settle
    const t = window.setTimeout(() => {
      fitView({ nodes: [{ id: pendingFitNodeId }], padding: 0.4, duration: 400, maxZoom: 1.5 });
      setPendingFitNode(null);
    }, 100);
    return () => window.clearTimeout(t);
  }, [pendingFitNodeId, fitView, setPendingFitNode]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'nodeGroup' || node.type === 'namespaceGroup') return;
    setSelectedNode(String(node.data.canonicalNodeId ?? node.id));
  }, [setSelectedNode]);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(String(edge.data?.canonicalEdgeId ?? edge.id));
  }, [setSelectedEdge]);

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(String(edge.data?.canonicalEdgeId ?? edge.id));
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) return;

    const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
    const viewport = getViewport();
    const center = canvas
      ? { x: (canvas.width / 2 - viewport.x) / viewport.zoom, y: (canvas.height / 2 - viewport.y) / viewport.zoom }
      : { x: target.position.x, y: target.position.y };
    const nodeCenter = (node: typeof source) => ({
      x: node.position.x + (node.measured?.width ?? node.width ?? 0) / 2,
      y: node.position.y + (node.measured?.height ?? node.height ?? 0) / 2,
    });
    const distance = (node: typeof source) => {
      const point = nodeCenter(node);
      return (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
    };
    const destination = distance(source) < distance(target) ? target : source;
    fitView({ nodes: [{ id: destination.id }], padding: 0.55, duration: 600, maxZoom: 1.5 });
  }, [fitView, getNode, getViewport, setSelectedEdge]);

  const navigateToEdgeEndpoint = useCallback((endpoint: 'source' | 'target') => {
    if (!selectedEdgeId) return;
    const edge = edges.find(item => String(item.data?.canonicalEdgeId ?? item.id) === selectedEdgeId);
    const nodeId = edge?.[endpoint];
    if (!nodeId) return;
    fitView({ nodes: [{ id: nodeId }], padding: 0.55, duration: 600, maxZoom: 1.5 });
  }, [edges, fitView, selectedEdgeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedEdgeId || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateToEdgeEndpoint('target');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateToEdgeEndpoint('source');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigateToEdgeEndpoint, selectedEdgeId]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [setSelectedNode, setSelectedEdge]);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNode(node.id);
  }, [setHoveredNode]);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, [setHoveredNode]);

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <LoadingIndicator size="lg" className="justify-center" />
          <h3 className="text-lg font-semibold text-foreground">Loading Cluster Graph...</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Discovering resources and analyzing dependencies
          </p>
        </div>
      </div>
    );
  }

  // Filtered counts (visible rendered nodes/edges, excluding namespace group nodes)
  const visibleNodeCount = new Set(nodes
    .filter(node => node.type !== 'namespaceGroup' && node.type !== 'nodeGroup')
    .map(node => String(node.data.canonicalNodeId ?? node.id))).size;
  const visibleEdgeCount = edges.length;
  const totalNodeCount = graphData.nodes.length;
  const isFiltered = visibleNodeCount < totalNodeCount;

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        elevateEdgesOnSelect={false}
        zIndexMode="manual"
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className={isPreparing ? '!bg-transparent invisible' : '!bg-transparent'}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--graph-grid)"
        />
        <Controls
          className="app-subtle !border-border !rounded-lg [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-muted-foreground [&>button:hover]:!bg-accent"
          showInteractive={false}
        />
        <Panel position="top-left" className="!m-3">
          <div className="nodrag nopan flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => fitView({ padding: 0.06, duration: 300, maxZoom: 1.15 })}>
              <Maximize2 size={14} /> Reset view
            </Button>
            {(selectedNodeId || selectedEdgeId || isolateNodeId) && (
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground" onClick={clearInvestigation}>
                <X size={14} /> Show all
              </Button>
            )}
          </div>
        </Panel>
        {selectedEdgeId && edges.some(edge => String(edge.data?.canonicalEdgeId ?? edge.id) === selectedEdgeId) && (
          <Panel position="top-center">
            <div className="nodrag nopan flex items-center gap-1 rounded-lg border border-white/10 bg-card/45 p-1 backdrop-blur-sm">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-foreground/75 hover:bg-foreground/10 hover:text-foreground"
                title="Move to destination"
                aria-label="Move to destination"
                onClick={event => { event.stopPropagation(); navigateToEdgeEndpoint('target'); }}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-foreground/75 hover:bg-foreground/10 hover:text-foreground"
                title="Move to source"
                aria-label="Move to source"
                onClick={event => { event.stopPropagation(); navigateToEdgeEndpoint('source'); }}
              >
                <ArrowRight />
              </Button>
            </div>
          </Panel>
        )}
        {showMiniMap && <MiniMap
          className="!right-4 !bottom-16 !h-28 !w-44 !rounded-lg !border !border-border !bg-card/90 opacity-70 shadow-lg transition-opacity hover:opacity-100"
          pannable
          zoomable
          zoomStep={8}
          ariaLabel="Graph navigation minimap. Drag the viewport to pan and scroll to zoom."
          nodeBorderRadius={2}
          nodeStrokeWidth={1}
          nodeColor={(node) => (node.data as { dimmed?: boolean })?.dimmed ? 'var(--border)' : 'var(--muted-foreground)'}
          nodeStrokeColor={(node) => (node.data as { dimmed?: boolean })?.dimmed ? 'var(--border)' : 'var(--foreground)'}
          maskColor="var(--graph-mask)"
          maskStrokeColor="var(--primary)"
          maskStrokeWidth={2}
        />}
        <EdgeLegendPanel
          visibleEdges={edges}
          className={`!right-3 transition-all duration-200 ${showMiniMap ? '!bottom-48' : '!bottom-14'}`}
        />
        <Panel position="bottom-right" className="!bottom-3 !right-3">
          <Button
            variant="outline"
            size="sm"
            className="nodrag nopan h-8 gap-1.5 bg-card/90 px-2.5 text-xs shadow-md"
            aria-pressed={showMiniMap}
            onClick={() => setShowMiniMap(value => !value)}
          >
            <MapIcon size={14} /> {showMiniMap ? 'Hide map' : 'Show map'}
          </Button>
        </Panel>
        <Panel position="bottom-center">
          <div className="app-subtle app-border flex items-center gap-4 rounded-lg border px-4 py-2 text-xs app-muted shadow-md">
            <span>
              {isFiltered ? (
                <><span className="text-foreground">{visibleNodeCount}</span>/{totalNodeCount}</>
              ) : (
                visibleNodeCount
              )} nodes
            </span>
            <span className="w-px h-3 bg-muted-foreground" />
            <span>{visibleEdgeCount} edges</span>
            <span className="w-px h-3 bg-muted-foreground" />
            <span>{graphData.namespaces.length} namespaces</span>
            {isolateNodeId && (
              <>
                <span className="w-px h-3 bg-muted-foreground" />
                <span className="text-primary">isolated</span>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>
      {!isPreparing && visibleNodeCount === 0 && graphData.namespaces.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-lg border border-border bg-card/95 px-6 py-5 text-center shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">No resources match these filters</h3>
            <p className="mt-1 text-xs text-muted-foreground">Reset or broaden the active filters to restore the graph.</p>
          </div>
        </div>
      )}
      {isPreparing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
          <div className="app-surface app-border rounded-lg border px-5 py-4 shadow-xl">
            <LoadingIndicator size="lg" label="Preparing graph..." className="flex-col items-center" />
          </div>
        </div>
      )}
      {editingLabelsNodeId && graphData.nodes.find(node => node.id === editingLabelsNodeId) && (
        <ResourceLabelsDialog
          node={graphData.nodes.find(node => node.id === editingLabelsNodeId)!}
          contextName={activeContext}
          connectionSettings={connectionSettings}
          onClose={() => setEditingLabelsNodeId(null)}
          onSaved={onLabelsChanged}
        />
      )}
    </div>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return <GraphCanvasInner {...props} />;
}

function flowItemFingerprint(item: Node | Edge, includeLayout = true) {
  if ('source' in item) {
    return JSON.stringify([item.source, item.target, item.type, item.animated, item.markerEnd, item.data]);
  }
  return JSON.stringify([item.type, item.parentId, item.extent, includeLayout ? item.position : undefined, includeLayout ? item.style : undefined, item.data], (_key, value) => typeof value === 'function' ? undefined : value);
}

/** Preserve object identity so React Flow only reconciles entities whose boundary data changed. */
function reconcileFlowItems<T extends Node | Edge>(current: T[], next: T[], preserveUnaffectedPositions: boolean): T[] {
  const existing = new Map(current.map(item => [item.id, item]));
  return next.map(item => {
    const previous = existing.get(item.id);
    const includeLayout = !preserveUnaffectedPositions;
    if (!previous || flowItemFingerprint(previous, includeLayout) !== flowItemFingerprint(item, includeLayout)) return item;
    if (!('source' in item) && item.type === 'namespaceGroup' && !('source' in previous)) {
      return { ...previous, data: { ...previous.data, onLoad: item.data.onLoad, onToggleMetrics: item.data.onToggleMetrics } } as T;
    }
    return previous;
  });
}

// ─── Build filtered React Flow elements ─────────────────────────
interface FilterConfig {
  visibleKinds: Set<K8sKind>;
  showCommunicationEdges: boolean;
  showOwnershipEdges: boolean;
  animateCommunicationEdges: boolean;
  namespaceLayout: 'rows' | 'columns';
  namespaceLayoutCount: number;
  selectedNamespaces: string[];
  namespaceSelection: 'all' | 'selected' | 'none';
  minConfidence: string[];
  searchQuery: string;
  crossNamespaceOnly: boolean;
  networkPolicyFilter: string;
  includeOutOfScope: boolean;
  collapsedNamespaces: Set<string>;
  isolateNodeId: string | null;
  labelFilter: string;
  activeDetectors: Set<string>;
  highlightedEdgeCategory?: RelationshipCategory | null;
}

function buildFlowElements(data: GraphData, filters: FilterConfig, onEditLabels: (nodeId: string) => void, connectionSettings: ConnectionSettings, activeContext: string | null) {
  // Resolve isolate neighborhood first
  let isolatedNodeIds: Set<string> | null = null;
  let isolatedEdgeIds: Set<string> | null = null;
  if (filters.isolateNodeId) {
    const hood = getNeighborhood(filters.isolateNodeId, data.edges, 2);
    isolatedNodeIds = hood.nodeIds;
    isolatedEdgeIds = hood.edgeIds;
  }

  // Filter nodes
  const filteredNodes = data.nodes.filter(n => {
    if (isolatedNodeIds && !isolatedNodeIds.has(n.id)) return false;
    if (!filters.visibleKinds.has(n.kind)) return false;
    if (filters.namespaceSelection === 'none') return false;
    if (filters.namespaceSelection === 'selected' && n.namespace && !filters.selectedNamespaces.includes(n.namespace)) return false;
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      if (!n.name.toLowerCase().includes(q) && !n.namespace?.toLowerCase().includes(q)) return false;
    }
    if (filters.labelFilter) {
      const [filterKey, filterVal] = filters.labelFilter.split('=').map(s => s.trim());
      const labels = n.metadata?.labels ?? {};
      const match = filterKey && filterVal
        ? labels[filterKey] === filterVal
        : Object.keys(labels).some(k => k.includes(filterKey ?? ''));
      if (!match) return false;
    }
    return true;
  });

  const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
  const nodesById = new Map(data.nodes.map(node => [node.id, node]));
  const selectedNamespaceSet = new Set(filters.selectedNamespaces);

  const visiblePods = filteredNodes.filter(node => node.kind === 'Pod');
  const serviceTargets = new Map<string, GraphNode[]>();
  for (const service of filteredNodes.filter(node => node.kind === 'Service')) {
    const selector = service.metadata.selector ?? {};
    const entries = Object.entries(selector);
    if (!entries.length) continue;
    const targets = visiblePods.filter(pod => pod.namespace === service.namespace
      && entries.every(([key, value]) => pod.metadata.labels?.[key] === value));
    if (targets.length) serviceTargets.set(service.id, targets);
  }

  // Filter edges
  const filteredEdges = data.edges.filter(e => {
    if (isolatedEdgeIds && !isolatedEdgeIds.has(e.id)) return false;
    if (e.edgeKind === 'communication' && !filters.showCommunicationEdges) return false;
    if (e.edgeKind === 'ownership' && !filters.showOwnershipEdges) return false;
    if (!filters.minConfidence.includes(e.confidence)) return false;
    if (filters.crossNamespaceOnly && !e.isCrossNamespace) return false;
    if (filters.networkPolicyFilter !== 'all' && e.networkPolicyStatus !== filters.networkPolicyFilter) return false;
    if (filters.namespaceSelection === 'selected' && !filters.includeOutOfScope) {
      const source = nodesById.get(e.source);
      const target = nodesById.get(e.target);
      const inScope = (node: GraphNode | undefined) => !!node && (!node.namespace || selectedNamespaceSet.has(node.namespace));
      if (!inScope(source) || !inScope(target)) return false;
    }
    if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) return false;
    // Keep edge only if at least one of its evidence entries comes from an active detector.
    // An empty activeDetectors set means "all off" — hide every edge.
    if (filters.activeDetectors.size === 0) return false;
    const hasActiveDetector = e.evidence.some(ev => filters.activeDetectors.has(ev.detector));
    if (!hasActiveDetector) return false;
    return true;
  });

  // Convert to React Flow format
  const flowNodes: Node[] = filteredNodes.filter(node => !serviceTargets.has(node.id)).map(n => {
    const boundaryNodeName = n.kind === 'Pod' ? n.metadata.nodeName ?? 'Unscheduled Pods' : n.kind === 'External' ? 'External' : 'Logical resources';
    const boundaryNamespace = n.namespace ?? 'external';
    return ({
    id: n.id,
    type: n.kind === 'External' ? 'external' : 'resource',
    position: { x: 0, y: 0 },
    data: {
      kind: n.kind,
      name: n.name,
      namespace: n.namespace,
      status: n.status,
      ip: n.metadata.ip,
      ports: n.metadata.ports,
      podMetrics: n.metadata.podMetrics,
      containers: n.metadata.containers,
      resourceUid: n.resourceUid,
      labels: n.metadata.labels,
      attachedServiceCount: n.kind === 'Pod'
        ? [...serviceTargets.values()].filter(pods => pods.some(pod => pod.id === n.id)).length
        : 0,
      nodeName: n.metadata.nodeName,
      boundaryNodeName,
      connectionSettings,
      activeContext,
      onEditLabels: () => onEditLabels(n.id),
      dimmed: false,
      pathDirection: undefined,
    },
    parentId: `scope:${encodeURIComponent(boundaryNodeName)}:${encodeURIComponent(boundaryNamespace)}`,
    extent: n.namespace || n.kind === 'External' ? 'parent' as const : undefined,
  });
  });

  for (const [serviceId, pods] of serviceTargets) {
    const service = nodesById.get(serviceId);
    if (!service) continue;
    const attachedService = service;
    for (const pod of pods) {
      const boundaryNodeName = pod.metadata.nodeName ?? 'Unscheduled Pods';
      flowNodes.push({
        id: `service-attachment:${attachedService.id}:${pod.id}`,
        type: 'serviceAttachment',
        position: { x: 0, y: 0 },
        data: {
          kind: 'Service', name: attachedService.name, namespace: attachedService.namespace,
          status: attachedService.status, ip: attachedService.metadata.ip, ports: attachedService.metadata.ports,
          serviceType: attachedService.metadata.serviceType, canonicalNodeId: attachedService.id,
          attachedPodId: pod.id, boundaryNodeName,
        },
        parentId: `scope:${encodeURIComponent(boundaryNodeName)}:${encodeURIComponent(pod.namespace ?? 'external')}`,
        extent: 'parent',
        zIndex: 7,
      });
    }
  }

  const arrowMarker = {
    type: MarkerType.ArrowClosed,
    width: 10,
    height: 10,
  };

  const flowEdges: Edge[] = filteredEdges.flatMap(e => {
    if (serviceTargets.has(e.source) && e.evidence.every(entry => entry.detector === 'ServiceSelectorDetector')) return [];
    const sources = serviceTargets.get(e.source)?.map(pod => `service-attachment:${e.source}:${pod.id}`) ?? [e.source];
    const targets = serviceTargets.get(e.target)?.map(pod => `service-attachment:${e.target}:${pod.id}`) ?? [e.target];

    const relationshipCategory = e.relationshipCategory ?? (e.edgeKind === 'ownership' ? 'ownership' : 'network');
    const isCategoryHighlighted = filters.highlightedEdgeCategory === relationshipCategory;
    const isAnyCategoryHighlighted = filters.highlightedEdgeCategory !== null && filters.highlightedEdgeCategory !== undefined;
    const isCategoryDimmed = isAnyCategoryHighlighted && !isCategoryHighlighted;

    return sources.flatMap(source => targets.map(target => ({
    id: source === e.source && target === e.target ? e.id : `${e.id}:attached:${source}:${target}`,
    source,
    target,
    type: e.edgeKind === 'ownership' ? 'ownership' : 'communication',
    markerEnd: e.edgeKind === 'ownership' || !filters.animateCommunicationEdges ? arrowMarker : undefined,
    data: {
      confidence: e.confidence,
      connectionString: e.connectionString,
      protocol: e.protocol,
      port: e.port,
      isCrossNamespace: e.isCrossNamespace,
      networkPolicyStatus: e.networkPolicyStatus,
      animate: filters.animateCommunicationEdges,
      isInvestigationPath: false,
      relationshipCategory,
      highlighted: isCategoryHighlighted,
      dimmed: isCategoryDimmed,
      canonicalEdgeId: e.id,
    },
    animated: filters.animateCommunicationEdges && e.edgeKind === 'communication' && e.confidence === 'Confirmed',
    className: 'topology-edge',
    zIndex: isCategoryHighlighted ? 1000 : 1,
  })));
  });

  return { flowNodes, flowEdges };
}
