import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────
export const ConfidenceTierSchema = z.enum(['Confirmed', 'Probable', 'Possible', 'Unknown-External']);
export const EdgeKindSchema = z.enum(['communication', 'ownership']);
export const NetworkPolicyStatusSchema = z.enum(['unrestricted', 'allowed', 'likely-blocked', 'unknown']);

// ─── Resource Schemas ──────────────────────────────────────────
export const ResourcePortSchema = z.object({
  name: z.string().optional(),
  port: z.number(),
  protocol: z.string(),
  targetPort: z.union([z.number(), z.string()]).optional(),
});

export const OwnerReferenceSchema = z.object({
  kind: z.string(),
  name: z.string(),
  uid: z.string(),
});

export const EnvVarSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  valueFrom: z.object({
    configMapKeyRef: z.object({ name: z.string(), key: z.string() }).optional(),
    secretKeyRef: z.object({ name: z.string(), key: z.string() }).optional(),
    fieldRef: z.object({ fieldPath: z.string() }).optional(),
  }).optional(),
  fromSecret: z.boolean().optional(),
});

export const VolumeMountSchema = z.object({
  name: z.string(),
  mountPath: z.string(),
  configMapName: z.string().optional(),
  secretName: z.string().optional(),
  pvcName: z.string().optional(),
});

export const ContainerInfoSchema = z.object({
  name: z.string(),
  image: z.string(),
  ports: z.array(ResourcePortSchema),
  envVars: z.array(EnvVarSchema),
  volumeMounts: z.array(VolumeMountSchema),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
});

export const K8sResourceSchema = z.object({
  uid: z.string(),
  kind: z.string(),
  apiVersion: z.string(),
  name: z.string(),
  namespace: z.string().nullable(),
  labels: z.record(z.string(), z.string()),
  annotations: z.record(z.string(), z.string()),
  status: z.string().optional(),
  clusterIP: z.string().optional(),
  podIP: z.string().optional(),
  ports: z.array(ResourcePortSchema).optional(),
  selector: z.record(z.string(), z.string()).optional(),
  ownerReferences: z.array(OwnerReferenceSchema).optional(),
  envVars: z.array(EnvVarSchema).optional(),
  volumeMounts: z.array(VolumeMountSchema).optional(),
  containers: z.array(ContainerInfoSchema).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  discoveredAt: z.string(),
});

// ─── Dependency Schemas ────────────────────────────────────────
export const EvidenceEntrySchema = z.object({
  detector: z.string(),
  rawValue: z.string(),
  environmentVariable: z.string().optional(),
  fromSecret: z.boolean().optional(),
  description: z.string(),
});

export const ResolvedDependencySchema = z.object({
  id: z.string(),
  sourceUid: z.string(),
  sourceKind: z.string(),
  sourceName: z.string(),
  sourceNamespace: z.string().nullable(),
  destinationUid: z.string().nullable(),
  destinationKind: z.string(),
  destinationName: z.string(),
  destinationNamespace: z.string().nullable(),
  connectionString: z.string(),
  protocol: z.string(),
  port: z.number().nullable(),
  environmentVariable: z.string().nullable(),
  evidence: z.array(EvidenceEntrySchema),
  confidence: ConfidenceTierSchema,
  edgeKind: EdgeKindSchema,
  networkPolicyStatus: NetworkPolicyStatusSchema,
  discoveredAt: z.string(),
});

// ─── Graph Schemas ─────────────────────────────────────────────
export const GraphNodeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  namespace: z.string().nullable(),
  status: z.string().optional(),
  resourceUid: z.string(),
  metadata: z.object({
    ip: z.string().optional(),
    ports: z.array(ResourcePortSchema).optional(),
    labels: z.record(z.string(), z.string()).optional(),
    replicas: z.number().optional(),
  }),
});

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  edgeKind: EdgeKindSchema,
  confidence: ConfidenceTierSchema,
  connectionString: z.string(),
  protocol: z.string(),
  port: z.number().nullable(),
  networkPolicyStatus: NetworkPolicyStatusSchema,
  evidence: z.array(EvidenceEntrySchema),
  isCrossNamespace: z.boolean(),
});

export const DiscoveryWarningSchema = z.object({
  type: z.enum(['rbac', 'error', 'info']),
  resourceType: z.string(),
  message: z.string(),
});

export const GraphDataSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  namespaces: z.array(z.string()),
  warnings: z.array(DiscoveryWarningSchema),
  timestamp: z.string(),
  contextName: z.string(),
});

export const K8sContextSchema = z.object({
  name: z.string(),
  cluster: z.string(),
  user: z.string(),
  namespace: z.string().optional(),
  isActive: z.boolean(),
});
