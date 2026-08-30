// Kubernetes and CRD payloads intentionally have an open, runtime-defined schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ManifestObject = Record<string, any>;

export type ContainerRole = 'container' | 'initContainer' | 'ephemeralContainer';

export interface ContainerRef {
  name: string;
  role: ContainerRole;
  index: number;
  spec: ManifestObject;
}

export interface MatchedName {
  name: string;
  candidateNodeKeys: string[];
  confidence: 'same-namespace' | 'cross-namespace';
}

export interface LiteralRefCandidate {
  fieldPath: string;
  containerName?: string;
  containerRole?: ContainerRole;
  rawValue: string;
  matchedNames: MatchedName[];
}

export interface StructuralRefCandidate {
  fieldPath: string;
  containerName?: string;
  containerRole?: ContainerRole;
  mode: 'byName' | 'bySelector' | 'byKindMatch';
  targetKind?: string;
  targetName?: string;
  candidateNodeKeys: string[];
  resolved: boolean;
  rawSelector?: unknown;
}

export interface ResourceSource {
  filePath: string;
  chartName?: string;
  lastModified?: number;
  ingestOrder: number;
}

export interface ResourceNode {
  key: string;
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
  raw: ManifestObject;
  source: ResourceSource;
  literalRefs: LiteralRefCandidate[];
  structuralRefs: StructuralRefCandidate[];
  canonicalPodSpec?: ManifestObject;
  canonicalPodLabels?: Record<string, string>;
  containers: ContainerRef[];
}

export interface EdgeRef {
  to: string;
  type: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export interface GraphEdgeRecord extends EdgeRef {
  from: string;
}

export interface ConflictRecord {
  key: string;
  previous: ResourceSource;
  incoming: ResourceSource;
  resolvedTo: 'previous' | 'incoming';
  detectedAt: number;
}

export interface ManifestGraphSession {
  id: string;
  nodeStore: Map<string, ResourceNode>;
  adjacencyOut: Map<string, EdgeRef[]>;
  adjacencyIn: Map<string, EdgeRef[]>;
  conflicts: Map<string, ConflictRecord[]>;
  createdAt: number;
  expiresAt: number;
}

export type IngestEvent =
  | { type: 'progress'; filePath: string; index: number; total: number }
  | { type: 'parsed'; key: string; kind: string; name: string; namespace: string | null }
  | { type: 'conflict'; key: string; previousSource: string; incomingSource: string; resolvedTo: 'previous' | 'incoming' }
  | { type: 'file-error'; filePath: string; message: string }
  | { type: 'file-warning'; filePath: string; message: string }
  | { type: 'chart-error'; chartPath: string; message: string }
  | { type: 'chart-warning'; chartPath: string; message: string }
  | { type: 'indices-built'; nodeCount: number }
  | { type: 'structural-refs-extracted'; ruleMatches: number }
  | { type: 'literal-refs-scanned'; fieldsScanned: number; matchesFound: number }
  | { type: 'edges-built'; edgeCount: number }
  | { type: 'done'; sessionId: string; nodeCount: number; edgeCount: number; conflictCount: number };

export interface UploadedManifestFile {
  relativePath: string;
  lastModified?: number;
  content: string;
  chartName?: string;
}
