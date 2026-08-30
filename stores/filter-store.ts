import { create } from 'zustand';
import type { K8sKind } from '@/config/resource-types';
import type { ConfidenceTier, NetworkPolicyStatus } from '@/config/constants';

// ─── Detector registry ────────────────────────────────────────
// Canonical names must match the `detector` field on EvidenceEntry (set in resolver.ts)
export interface DetectorInfo {
  name: string;         // matches EvidenceEntry.detector
  label: string;        // human label shown in UI
  description: string;  // one-line tooltip
  edgeKind: 'communication' | 'ownership' | 'both';
}

export const DETECTOR_REGISTRY: DetectorInfo[] = [
  {
    name: 'OwnerReferenceDetector',
    label: 'Owner references',
    description: 'Pod ← ReplicaSet ← Deployment hierarchy via ownerReferences metadata',
    edgeKind: 'ownership',
  },
  {
    name: 'ServiceSelectorDetector',
    label: 'Service selectors',
    description: 'Service → Workload edges where the service selector matches workload labels',
    edgeKind: 'communication',
  },
  {
    name: 'IngressBackendDetector',
    label: 'Ingress backends',
    description: 'Ingress → Service edges from spec.rules[].http.paths[].backend',
    edgeKind: 'communication',
  },
  {
    name: 'EnvironmentVariableDetector',
    label: 'Environment variables',
    description: 'Edges inferred from URLs, DNS names, host:port, and configMap/secret refs in container env vars',
    edgeKind: 'communication',
  },
  {
    name: 'URLDetector',
    label: 'Command / args URLs',
    description: 'Edges inferred from http/redis/postgres/kafka URLs found in container command and args',
    edgeKind: 'communication',
  },
  {
    name: 'VolumeMountDetector',
    label: 'Volume mounts',
    description: 'Workload → ConfigMap / Secret / PVC edges from mounted volumes',
    edgeKind: 'communication',
  },
];

export interface FilterState {
  // Namespace
  selectedNamespaces: string[];
  namespaceSelection: 'all' | 'selected' | 'none';
  includeOutOfScope: boolean;         // show deps outside selected namespaces

  // Resource types
  visibleKinds: Set<K8sKind>;

  // Edge kinds
  showCommunicationEdges: boolean;
  showOwnershipEdges: boolean;
  animateCommunicationEdges: boolean;
  containerMetaphorDimensions: number;
  namespaceLayout: 'rows' | 'columns';
  namespaceLayoutCount: number;

  // Confidence
  minConfidence: ConfidenceTier[];

  // Network Policy
  networkPolicyFilter: NetworkPolicyStatus | 'all';

  // Search
  searchQuery: string;

  // Cluster
  activeContext: string | null;

  // Cross-namespace only
  crossNamespaceOnly: boolean;

  // Label selector (e.g. "app=frontend" or just "app")
  labelFilter: string;

  // Which detectors contribute edges (by detector name)
  activeDetectors: Set<string>;
}

interface FilterActions {
  setNamespaces: (ns: string[]) => void;
  setNamespaceSelection: (selection: 'all' | 'selected' | 'none') => void;
  toggleNamespace: (ns: string) => void;
  setIncludeOutOfScope: (v: boolean) => void;
  toggleKind: (kind: K8sKind) => void;
  setVisibleKinds: (kinds: Set<K8sKind>) => void;
  setShowCommunicationEdges: (v: boolean) => void;
  setShowOwnershipEdges: (v: boolean) => void;
  setAnimateCommunicationEdges: (v: boolean) => void;
  setContainerMetaphorDimensions: (v: number) => void;
    setNamespaceLayout: (layout: 'rows' | 'columns', count: number) => void;
  setMinConfidence: (tiers: ConfidenceTier[]) => void;
  setNetworkPolicyFilter: (v: NetworkPolicyStatus | 'all') => void;
  setSearchQuery: (q: string) => void;
  setActiveContext: (ctx: string | null) => void;
  setCrossNamespaceOnly: (v: boolean) => void;
  setLabelFilter: (v: string) => void;
  toggleDetector: (name: string) => void;
  setActiveDetectors: (names: Set<string>) => void;
  resetFilters: () => void;
  getFilterParams: () => Record<string, string>;
  applyFilterParams: (params: URLSearchParams) => void;
}

const DEFAULT_VISIBLE_KINDS = new Set<K8sKind>([
  'Pod', 'Service', 'Ingress',
]);

const DEFAULT_CONFIDENCE: ConfidenceTier[] = ['Confirmed', 'Probable', 'Possible', 'Unknown-External'];

const ALL_DETECTOR_NAMES = new Set(DETECTOR_REGISTRY.map(d => d.name));

const initialState: FilterState = {
  // Namespace inventories are data-source specific. Start unscoped so a
  // restored live connection never inherits names from the sample dataset.
  selectedNamespaces: [],
  namespaceSelection: 'all',
  includeOutOfScope: true,
  visibleKinds: new Set(DEFAULT_VISIBLE_KINDS),
  showCommunicationEdges: true,
  showOwnershipEdges: true,
  animateCommunicationEdges: false,
  containerMetaphorDimensions: 32,
    namespaceLayout: 'rows',
    namespaceLayoutCount: 1,
  minConfidence: DEFAULT_CONFIDENCE,
  networkPolicyFilter: 'all',
  searchQuery: '',
  activeContext: null,
  crossNamespaceOnly: false,
  labelFilter: '',
  activeDetectors: new Set(ALL_DETECTOR_NAMES),
};

export const useFilterStore = create<FilterState & FilterActions>((set, get) => ({
  ...initialState,

  setNamespaces: (ns) => set({ selectedNamespaces: ns }),
  setNamespaceSelection: (namespaceSelection) => set({ namespaceSelection }),
  toggleNamespace: (ns) =>
    set((s) => ({
      selectedNamespaces: s.selectedNamespaces.includes(ns)
        ? s.selectedNamespaces.filter((n) => n !== ns)
        : [...s.selectedNamespaces, ns],
    })),
  setIncludeOutOfScope: (v) => set({ includeOutOfScope: v }),
  toggleKind: (kind) =>
    set((s) => {
      const next = new Set(s.visibleKinds);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return { visibleKinds: next };
    }),
  setVisibleKinds: (kinds) => set({ visibleKinds: kinds }),
  setShowCommunicationEdges: (v) => set({ showCommunicationEdges: v }),
  setShowOwnershipEdges: (v) => set({ showOwnershipEdges: v }),
  setAnimateCommunicationEdges: (v) => set({ animateCommunicationEdges: v }),
  setContainerMetaphorDimensions: (v) => set({ containerMetaphorDimensions: Math.min(256, Math.max(16, Math.round(v / 16) * 16)) }),
    setNamespaceLayout: (namespaceLayout, namespaceLayoutCount) => set({ namespaceLayout, namespaceLayoutCount }),
  setMinConfidence: (tiers) => set({ minConfidence: tiers }),
  setNetworkPolicyFilter: (v) => set({ networkPolicyFilter: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveContext: (ctx) => set({ activeContext: ctx }),
  setCrossNamespaceOnly: (v) => set({ crossNamespaceOnly: v }),
  setLabelFilter: (v) => set({ labelFilter: v }),
  toggleDetector: (name) =>
    set((s) => {
      const next = new Set(s.activeDetectors);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { activeDetectors: next };
    }),
  setActiveDetectors: (names) => set({ activeDetectors: names }),
  resetFilters: () => set(initialState),

  getFilterParams: () => {
    const s = get();
    const params: Record<string, string> = {};
    if (s.selectedNamespaces.length) params.ns = s.selectedNamespaces.join(',');
    if (s.namespaceSelection !== 'all') params.nsMode = s.namespaceSelection;
    if (s.searchQuery) params.q = s.searchQuery;
    if (s.activeContext) params.ctx = s.activeContext;
    if (s.crossNamespaceOnly) params.crossNs = '1';
    if (!s.showOwnershipEdges) params.noOwnership = '1';
    if (!s.showCommunicationEdges) params.noComm = '1';
    if (s.labelFilter) params.label = s.labelFilter;
    if (s.containerMetaphorDimensions !== 32) params.metaphorDims = String(s.containerMetaphorDimensions);
    // Only persist disabled detectors (shorter URL — "all on" is the default)
    const disabled = DETECTOR_REGISTRY.map(d => d.name).filter(n => !s.activeDetectors.has(n));
    if (disabled.length) params.disabledDetectors = disabled.join(',');
    return params;
  },

  applyFilterParams: (params) => {
    const ns = params.get('ns');
    const q = params.get('q');
    const ctx = params.get('ctx');
    set({
      selectedNamespaces: ns ? ns.split(',') : [],
      namespaceSelection: (params.get('nsMode') as FilterState['namespaceSelection']) ?? 'all',
      searchQuery: q ?? '',
      activeContext: ctx ?? null,
      crossNamespaceOnly: params.get('crossNs') === '1',
      showOwnershipEdges: params.get('noOwnership') !== '1',
      showCommunicationEdges: params.get('noComm') !== '1',
      labelFilter: params.get('label') ?? '',
      containerMetaphorDimensions: Math.min(256, Math.max(16, Number(params.get('metaphorDims')) || 32)),
      activeDetectors: (() => {
        const disabled = params.get('disabledDetectors');
        if (!disabled) return new Set(ALL_DETECTOR_NAMES);
        const disabledSet = new Set(disabled.split(','));
        return new Set(DETECTOR_REGISTRY.map(d => d.name).filter(n => !disabledSet.has(n)));
      })(),
    });
  },
}));
