import type { K8sKind } from '@/config/resource-types';
import type { ConfidenceTier, EdgeKind, NetworkPolicyStatus, RelationshipCategory } from '@/config/constants';
import type { ContainerMetaphorMatch } from '@/lib/graph/pod-metaphor';

// ─── Discovered K8s Resource ───────────────────────────────────
export interface K8sResource {
  uid: string;
  kind: K8sKind;
  apiVersion: string;
  name: string;
  namespace: string | null; // null for cluster-scoped resources
  labels: Record<string, string>;
  annotations: Record<string, string>;
  status?: string;
  clusterIP?: string;
  podIP?: string;
  ports?: ResourcePort[];
  selector?: Record<string, string>;
  serviceType?: string;
  ownerReferences?: OwnerReference[];
  envVars?: EnvVar[];
  volumeMounts?: VolumeMount[];
  containers?: ContainerInfo[];
  nodeName?: string;
  raw?: Record<string, unknown>; // Full K8s object (lazy-loaded)
  discoveredAt: string;
}

export interface ResourcePort {
  name?: string;
  port: number;
  protocol: string;
  targetPort?: number | string;
}

export interface OwnerReference {
  kind: string;
  name: string;
  uid: string;
}

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    configMapKeyRef?: { name: string; key: string };
    secretKeyRef?: { name: string; key: string };
    fieldRef?: { fieldPath: string };
  };
  fromSecret?: boolean;
}

export interface VolumeMount {
  name: string;
  mountPath: string;
  configMapName?: string;
  secretName?: string;
  pvcName?: string;
}

export interface ContainerInfo {
  name: string;
  image: string;
  imageId?: string;
  ports: ResourcePort[];
  envVars: EnvVar[];
  volumeMounts: VolumeMount[];
  command?: string[];
  args?: string[];
  type?: 'app' | 'sidecar' | 'init' | 'ephemeral' | 'container';
  status?: string;
  ready?: boolean;
  restartCount?: number;
}

// ─── Dependency ────────────────────────────────────────────────
export interface DependencyCandidate {
  sourceUid: string;
  sourceKind: K8sKind;
  sourceName: string;
  sourceNamespace: string | null;
  destinationHint: string;          // Raw connection string / hostname / IP
  protocol?: string;
  port?: number;
  environmentVariable?: string;
  detector: string;
  edgeKind: EdgeKind;
  relationshipCategory?: RelationshipCategory;
  fromSecret?: boolean;
  rawEvidence: string;              // The raw value that triggered the detection
}

export interface ResolvedDependency {
  id: string;
  sourceUid: string;
  sourceKind: K8sKind;
  sourceName: string;
  sourceNamespace: string | null;
  destinationUid: string | null;    // null for external
  destinationKind: K8sKind;
  destinationName: string;
  destinationNamespace: string | null;
  connectionString: string;
  protocol: string;
  port: number | null;
  environmentVariable: string | null;
  evidence: EvidenceEntry[];
  confidence: ConfidenceTier;
  edgeKind: EdgeKind;
  relationshipCategory?: RelationshipCategory;
  networkPolicyStatus: NetworkPolicyStatus;
  discoveredAt: string;
}

export interface EvidenceEntry {
  detector: string;
  rawValue: string;
  environmentVariable?: string;
  fromSecret?: boolean;
  description: string;
}

// ─── Discovery ─────────────────────────────────────────────────
export interface DiscoveryProgress {
  resourceType: string;
  discovered: number;
  total: number | null;
  status: 'pending' | 'discovering' | 'complete' | 'error' | 'forbidden';
  error?: string;
}

export interface DiscoveryResult {
  resources: K8sResource[];
  dependencies: ResolvedDependency[];
  warnings: DiscoveryWarning[];
  timestamp: string;
  contextName: string;
}

export interface DiscoveryWarning {
  type: 'rbac' | 'error' | 'info';
  resourceType: string;
  message: string;
}

// ─── Graph ─────────────────────────────────────────────────────
export interface GraphNode {
  id: string;
  kind: K8sKind;
  name: string;
  namespace: string | null;
  status?: string;
  resourceUid: string;
  metadata: {
    ip?: string;
    ports?: ResourcePort[];
    labels?: Record<string, string>;
    selector?: Record<string, string>;
    serviceType?: string;
    replicas?: number;
    podMetrics?: PodMetrics;
    containers?: GraphContainerInfo[];
    nodeName?: string;
  };
}

export interface GraphContainerInfo {
  name: string;
  image: string;
  imageId?: string;
  type: 'app' | 'sidecar' | 'init' | 'ephemeral' | 'container';
  ports: ResourcePort[];
  metaphor?: ContainerMetaphorMatch | null;
  status?: string;
  ready?: boolean;
  restartCount?: number;
}

export interface ContainerMetrics {
  cpu: string;
  memory: string;
}

export interface PodMetrics {
  cpu: string;
  memory: string;
  containers?: Record<string, ContainerMetrics>;
}

export interface PodMetricsResponse {
  available: boolean;
  metrics: Record<string, PodMetrics>;
  error?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  edgeKind: EdgeKind;
  relationshipCategory?: RelationshipCategory;
  confidence: ConfidenceTier;
  connectionString: string;
  protocol: string;
  port: number | null;
  networkPolicyStatus: NetworkPolicyStatus;
  evidence: EvidenceEntry[];
  isCrossNamespace: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  namespaces: string[];
  warnings: DiscoveryWarning[];
  timestamp: string;
  contextName: string;
  namespaceStates?: Record<string, NamespaceBoundaryState>;
  topologyNodes?: TopologyNode[];
}

export interface TopologyNode {
  name: string;
  role: 'control-plane' | 'worker' | 'unknown';
  status?: string;
}

export interface NamespaceBoundaryState {
  status: 'unloaded' | 'loading' | 'loaded' | 'error';
  resourceCount: number;
  error?: string;
  metricsStatus?: 'off' | 'loading' | 'available' | 'unavailable';
  metricsError?: string;
}

// ─── K8s Context ───────────────────────────────────────────────
export interface K8sContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isActive: boolean;
}

export interface ConnectionSettings {
  mode: 'live' | 'mock';
  clusterUrl: string;
  connectionId?: string;
  token?: string;
  skipTlsVerify?: boolean;
}


// ─── Kubernetes permissions ───────────────────────────────────────────────
export type PermissionState = 'allowed' | 'denied' | 'unknown';

export interface PermissionCheck {
  id: string;
  allowed: boolean;
  denied?: boolean;
  reason?: string;
  evaluationError?: string;
}

export interface PermissionsResponse {
  checks: Record<string, PermissionCheck>;
  contextName: string;
  namespace: string;
  checkedAt: string;
  source?: 'live' | 'mock';
  error?: string;
}

export interface LabelPermissionResponse {
  allowed: boolean;
  contextName: string;
  command: string;
  grantCommands: string[];
  reason?: string;
  error?: string;
  status?: 401 | 403 | 500;
}
