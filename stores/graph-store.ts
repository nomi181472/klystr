import { create } from 'zustand';
import type { GraphData, GraphEdge, GraphNode } from '@/lib/types';
import type { RelationshipCategory } from '@/config/constants';

interface GraphState {
  // Data
  graphData: GraphData | null;
  previousGraphData: GraphData | null; // For diff mode

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hoveredNodeId: string | null;
  isolateNodeId: string | null;
  pendingFitNodeId: string | null;
  highlightedEdgeCategory: RelationshipCategory | null;

  // View
  isDiffMode: boolean;
  collapsedNamespaces: Set<string>;
  customPositions: Record<string, { x: number; y: number }>; // Persisted manual layout

  // Loading
  isLoading: boolean;
  error: string | null;
}

interface GraphActions {
  setGraphData: (data: GraphData) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  setHoveredNode: (id: string | null) => void;
  setIsolateNode: (id: string | null) => void;
  toggleIsolate: (id: string) => void;
  setPendingFitNode: (id: string | null) => void;
  setHighlightedEdgeCategory: (cat: RelationshipCategory | null) => void;
  toggleHighlightedEdgeCategory: (cat: RelationshipCategory) => void;
  jumpToNode: (id: string) => void;
  clearInvestigation: () => void;
  toggleDiffMode: () => void;
  toggleNamespaceCollapse: (ns: string) => void;
  updateNodePosition: (id: string, pos: { x: number; y: number }) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  getSelectedNode: () => GraphNode | null;
  getSelectedEdge: () => GraphEdge | null;
}

export const useGraphStore = create<GraphState & GraphActions>((set, get) => ({
  graphData: null,
  previousGraphData: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  hoveredNodeId: null,
  isolateNodeId: null,
  pendingFitNodeId: null,
  highlightedEdgeCategory: null,
  isDiffMode: false,
  collapsedNamespaces: new Set(),
  customPositions: {},
  isLoading: false,
  error: null,

  setGraphData: (data) =>
    set((s) => ({
      graphData: data,
      previousGraphData: s.graphData,
      isLoading: false,
      error: null,
    })),

  setSelectedNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
  setIsolateNode: (id) => set({ isolateNodeId: id }),
  toggleIsolate: (id) =>
    set((s) => ({ isolateNodeId: s.isolateNodeId === id ? null : id })),
  setPendingFitNode: (id) => set({ pendingFitNodeId: id }),
  setHighlightedEdgeCategory: (cat) => set({ highlightedEdgeCategory: cat }),
  toggleHighlightedEdgeCategory: (cat) =>
    set((s) => ({
      highlightedEdgeCategory: s.highlightedEdgeCategory === cat ? null : cat,
    })),
  jumpToNode: (id) =>
    set({
      selectedNodeId: id,
      selectedEdgeId: null,
      pendingFitNodeId: id,
    }),
  clearInvestigation: () =>
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      isolateNodeId: null,
      hoveredNodeId: null,
      highlightedEdgeCategory: null,
    }),

  toggleDiffMode: () => set((s) => ({ isDiffMode: !s.isDiffMode })),

  toggleNamespaceCollapse: (ns) =>
    set((s) => {
      const next = new Set(s.collapsedNamespaces);
      if (next.has(ns)) next.delete(ns);
      else next.add(ns);
      return { collapsedNamespaces: next };
    }),

  updateNodePosition: (id, pos) =>
    set((s) => ({
      customPositions: { ...s.customPositions, [id]: pos },
    })),

  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e, isLoading: false }),

  getSelectedNode: () => {
    const s = get();
    if (!s.selectedNodeId || !s.graphData) return null;
    return s.graphData.nodes.find((n) => n.id === s.selectedNodeId) ?? null;
  },

  getSelectedEdge: () => {
    const s = get();
    if (!s.selectedEdgeId || !s.graphData) return null;
    return s.graphData.edges.find((e) => e.id === s.selectedEdgeId) ?? null;
  },
}));
