export const APP_NAME = 'Klystr';
export const APP_DESCRIPTION = 'See. Understand. Operate.';

// Discovery
export const DISCOVERY_CACHE_TTL_MS = 60_000; // 1 minute
export const DISCOVERY_BATCH_SIZE = 50;
export const AUTO_REFRESH_INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '15s', value: 15_000 },
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
] as const;

// Graph
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 70;
export const NAMESPACE_PADDING = 40;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2.5;
export const LABEL_HIDE_ZOOM_THRESHOLD = 0.5;
export const COLLAPSE_NODE_THRESHOLD = 100;

// Layout
export const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '60',
  'elk.spacing.edgeNode': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': '[top=50,left=50,bottom=50,right=50]',
} as const;

// Confidence
export type ConfidenceTier = 'Confirmed' | 'Probable' | 'Possible' | 'Unknown-External';

export const CONFIDENCE_CONFIG: Record<ConfidenceTier, { label: string; color: string; strokeStyle: string }> = {
  Confirmed: { label: 'Confirmed', color: 'var(--success)', strokeStyle: 'solid' },
  Probable: { label: 'Probable', color: 'var(--warning)', strokeStyle: 'dashed' },
  Possible: { label: 'Possible', color: 'var(--resource-daemonset)', strokeStyle: 'dashed' },
  'Unknown-External': { label: 'Unknown/External', color: 'var(--external)', strokeStyle: 'dotted' },
};

// Edge Kinds
export type EdgeKind = 'communication' | 'ownership';

// NetworkPolicy Status
export type NetworkPolicyStatus = 'unrestricted' | 'allowed' | 'likely-blocked' | 'unknown';

// Relationship Categories (10 Categories Matrix)
export type RelationshipCategory =
  | 'network'
  | 'ownership'
  | 'storage-association'
  | 'storage-binding'
  | 'attachment'
  | 'config'
  | 'identity'
  | 'policy'
  | 'scaling'
  | 'external';

export interface RelationshipCategoryConfig {
  id: RelationshipCategory;
  label: string;
  description: string;
  visualLabel: string;
  color: string;
  strokeStyle: 'solid' | 'dashed' | 'dotted' | 'thick-dotted' | 'attachment' | 'config' | 'identity' | 'policy' | 'scaling' | 'external';
  strokeDasharray?: string;
  strokeWidth: number;
  hasArrow: boolean;
  isBiDirectional?: boolean;
}

export const EDGE_RELATIONSHIP_CONFIG: Record<RelationshipCategory, RelationshipCategoryConfig> = {
  network: {
    id: 'network',
    label: 'Network / Traffic',
    description: 'Ingress → Service, Service → Pod, Pod → Pod',
    visualLabel: 'solid arrow',
    color: '#3b82f6',
    strokeStyle: 'solid',
    strokeWidth: 2,
    hasArrow: true,
  },
  ownership: {
    id: 'ownership',
    label: 'Ownership / Association',
    description: 'Deployment → RS, RS → Pod, STS → Pod, DS → Pod, Job → Pod, CronJob → Job',
    visualLabel: 'dashed line',
    color: '#71717a',
    strokeStyle: 'dashed',
    strokeDasharray: '6 4',
    strokeWidth: 1.5,
    hasArrow: false,
  },
  'storage-association': {
    id: 'storage-association',
    label: 'Storage Association',
    description: 'StorageClass → PV',
    visualLabel: 'dotted line',
    color: '#0891b2',
    strokeStyle: 'dotted',
    strokeDasharray: '3 3',
    strokeWidth: 1.5,
    hasArrow: true,
  },
  'storage-binding': {
    id: 'storage-binding',
    label: 'Storage Binding',
    description: 'PV ↔ PVC',
    visualLabel: 'thicker dotted/binding line',
    color: '#14b8a6',
    strokeStyle: 'thick-dotted',
    strokeDasharray: '4 4',
    strokeWidth: 3,
    hasArrow: true,
    isBiDirectional: true,
  },
  attachment: {
    id: 'attachment',
    label: 'Attachment / Mount',
    description: 'PVC → Pod',
    visualLabel: 'attachment line',
    color: '#10b981',
    strokeStyle: 'attachment',
    strokeDasharray: '8 3 2 3',
    strokeWidth: 2,
    hasArrow: true,
  },
  config: {
    id: 'config',
    label: 'Configuration',
    description: 'ConfigMap → Pod, Secret → Pod',
    visualLabel: 'attachment/config line',
    color: '#f59e0b',
    strokeStyle: 'config',
    strokeDasharray: '5 3 2 3',
    strokeWidth: 1.8,
    hasArrow: true,
  },
  identity: {
    id: 'identity',
    label: 'Identity',
    description: 'ServiceAccount → Pod',
    visualLabel: 'identity edge',
    color: '#8b5cf6',
    strokeStyle: 'identity',
    strokeDasharray: '10 3 2 3',
    strokeWidth: 2,
    hasArrow: true,
  },
  policy: {
    id: 'policy',
    label: 'Policy',
    description: 'NetworkPolicy → Pod',
    visualLabel: 'policy edge',
    color: '#ec4899',
    strokeStyle: 'policy',
    strokeDasharray: '4 2 1 2',
    strokeWidth: 2,
    hasArrow: true,
  },
  scaling: {
    id: 'scaling',
    label: 'Scaling',
    description: 'HPA → Deployment, HPA → StatefulSet',
    visualLabel: 'scaling/control edge',
    color: '#a855f7',
    strokeStyle: 'scaling',
    strokeDasharray: '12 3 3 3',
    strokeWidth: 2,
    hasArrow: true,
  },
  external: {
    id: 'external',
    label: 'External Traffic',
    description: 'External endpoint → Ingress / Service',
    visualLabel: 'external/network edge',
    color: '#94a3b8',
    strokeStyle: 'external',
    strokeDasharray: '6 2',
    strokeWidth: 2,
    hasArrow: true,
  },
};

