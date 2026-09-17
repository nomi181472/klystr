import type { ResourceNode } from '@/lib/manifest-graph/types';
import type { K8sResource } from '@/lib/types';

export type DiffStatus = 'in-sync' | 'out-of-sync' | 'missing-in-cluster' | 'cluster-only';

export interface DiffField {
  path: string;
  label: string;
  manifestValue: string;
  clusterValue: string;
  isDifferent: boolean;
}

export interface ObjectComparison {
  id: string; // `${kind}/${namespace}/${name}`
  kind: string;
  name: string;
  namespace: string;
  status: DiffStatus;
  statusLabel: string;
  fileName?: string;
  sourceLine?: number;
  sourceColumn?: number;
  manifestNode?: ResourceNode;
  clusterResource?: K8sResource;
  diffSummary: string[];
  fields: DiffField[];
  manifestSpecSummary: {
    images: string[];
    replicas?: number | string;
    ports: string[];
    serviceType?: string;
    keys?: string[];
  };
  clusterSpecSummary: {
    images: string[];
    replicas?: number | string;
    ports: string[];
    serviceType?: string;
    keys?: string[];
    status?: string;
  };
}

export interface KindGroupComparison {
  kind: string;
  total: number;
  outOfSyncCount: number;
  missingInClusterCount: number;
  inSyncCount: number;
  clusterOnlyCount: number;
  items: ObjectComparison[];
}

export interface ComparisonReport {
  timestamp: string;
  namespaces: string[];
  totalManifestObjects: number;
  totalClusterObjects: number;
  totalCompared: number;
  summary: {
    outOfSync: number;
    missingInCluster: number;
    inSync: number;
    clusterOnly: number;
  };
  byKind: KindGroupComparison[];
}

// Preferred Kind order matching user presentation requirement
const KIND_ORDER: readonly string[] = [
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Service',
  'Ingress',
  'ConfigMap',
  'Secret',
  'PersistentVolumeClaim',
  'HorizontalPodAutoscaler',
  'Job',
  'CronJob',
  'NetworkPolicy',
  'ServiceAccount',
  'Pod',
];

function normalizeNamespace(ns?: string | null): string {
  if (!ns || ns === 'null' || ns === 'undefined') return 'default';
  const trimmed = ns.trim();
  return trimmed || 'default';
}

function extractPodSpec(raw?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const spec = (raw.spec as Record<string, unknown>) ?? raw;
  if (spec.template && typeof spec.template === 'object') {
    const template = spec.template as Record<string, unknown>;
    return (template.spec as Record<string, unknown>) ?? spec;
  }
  if (spec.jobTemplate && typeof spec.jobTemplate === 'object') {
    const jobTemplate = spec.jobTemplate as Record<string, unknown>;
    const jobSpec = jobTemplate.spec as Record<string, unknown> | undefined;
    if (jobSpec?.template && typeof jobSpec.template === 'object') {
      const template = jobSpec.template as Record<string, unknown>;
      return (template.spec as Record<string, unknown>) ?? spec;
    }
  }
  return spec;
}

function extractImages(raw?: Record<string, unknown>, resource?: K8sResource): string[] {
  if (resource?.containers && resource.containers.length > 0) {
    return resource.containers.map(c => c.image).filter(Boolean);
  }
  const podSpec = extractPodSpec(raw);
  if (!podSpec) return [];
  const containers = Array.isArray(podSpec.containers) ? (podSpec.containers as Array<{ image?: string }>) : [];
  const initContainers = Array.isArray(podSpec.initContainers) ? (podSpec.initContainers as Array<{ image?: string }>) : [];
  return [...containers, ...initContainers].map(c => c.image ?? '').filter(Boolean);
}

function extractReplicas(raw?: Record<string, unknown>, resource?: K8sResource): number | undefined {
  const spec = raw?.spec as Record<string, unknown> | undefined;
  if (typeof spec?.replicas === 'number') return spec.replicas;
  const rawReplicas = (resource?.raw?.spec as Record<string, unknown> | undefined)?.replicas;
  if (typeof rawReplicas === 'number') return rawReplicas;
  return undefined;
}

function extractPorts(raw?: Record<string, unknown>, resource?: K8sResource): string[] {
  if (resource?.ports && resource.ports.length > 0) {
    return resource.ports.map(p => `${p.port}${p.targetPort ? `:${p.targetPort}` : ''}/${p.protocol || 'TCP'}`);
  }
  const spec = raw?.spec as Record<string, unknown> | undefined;
  if (spec && Array.isArray(spec.ports)) {
    return (spec.ports as Array<{ port?: number; targetPort?: unknown; protocol?: string }>)
      .map(p => `${p.port ?? '?'}${p.targetPort ? `:${p.targetPort}` : ''}/${p.protocol || 'TCP'}`);
  }
  const podSpec = extractPodSpec(raw);
  if (podSpec && Array.isArray(podSpec.containers)) {
    const portsList: string[] = [];
    for (const c of podSpec.containers as Array<{ ports?: Array<{ containerPort?: number; protocol?: string }> }>) {
      if (Array.isArray(c.ports)) {
        for (const p of c.ports) {
          if (p.containerPort) portsList.push(`${p.containerPort}/${p.protocol || 'TCP'}`);
        }
      }
    }
    return portsList;
  }
  return [];
}

function extractKeys(raw?: Record<string, unknown>): string[] {
  if (!raw) return [];
  const data = (raw.data as Record<string, unknown>) ?? (raw.stringData as Record<string, unknown>);
  if (data && typeof data === 'object') {
    return Object.keys(data).sort();
  }
  return [];
}

function extractServiceType(raw?: Record<string, unknown>, resource?: K8sResource): string | undefined {
  if (resource?.serviceType) return resource.serviceType;
  const spec = raw?.spec as Record<string, unknown> | undefined;
  return typeof spec?.type === 'string' ? spec.type : undefined;
}

/**
 * Compares a single manifest node against an optional cluster resource.
 */
export function compareObject(
  manifestNode?: ResourceNode,
  clusterResource?: K8sResource
): ObjectComparison {
  const kind = manifestNode?.kind || clusterResource?.kind || 'Unknown';
  const name = manifestNode?.name || clusterResource?.name || 'unknown';
  const namespace = normalizeNamespace(manifestNode?.namespace || clusterResource?.namespace);
  const id = `${kind}/${namespace}/${name}`;

  const manifestRaw = manifestNode?.raw;
  const clusterRaw = (clusterResource?.raw as Record<string, unknown> | undefined);

  const manifestImages = extractImages(manifestRaw);
  const clusterImages = extractImages(clusterRaw, clusterResource);

  const manifestReplicas = extractReplicas(manifestRaw);
  const clusterReplicas = extractReplicas(clusterRaw, clusterResource);

  const manifestPorts = extractPorts(manifestRaw);
  const clusterPorts = extractPorts(clusterRaw, clusterResource);

  const manifestServiceType = extractServiceType(manifestRaw);
  const clusterServiceType = extractServiceType(clusterRaw, clusterResource);

  const manifestKeys = extractKeys(manifestRaw);
  const clusterKeys = extractKeys(clusterRaw);

  const fields: DiffField[] = [];
  const diffSummary: string[] = [];

  // Determine Diff Status
  let status: DiffStatus = 'in-sync';
  let statusLabel = 'In Sync';

  if (manifestNode && !clusterResource) {
    status = 'missing-in-cluster';
    statusLabel = 'Missing in Cluster';
    diffSummary.push('Declared in manifest file, but not found in active cluster.');
  } else if (!manifestNode && clusterResource) {
    status = 'cluster-only';
    statusLabel = 'Cluster Only';
    diffSummary.push('Present in cluster, but no corresponding manifest file exists.');
  } else {
    // Both exist: check for drift

    // 1. Workload images
    if (manifestImages.length > 0 || clusterImages.length > 0) {
      const manifestImgStr = manifestImages.sort().join(', ');
      const clusterImgStr = clusterImages.sort().join(', ');
      const diff = manifestImgStr !== clusterImgStr;
      fields.push({
        path: 'spec.containers[].image',
        label: 'Container Images',
        manifestValue: manifestImgStr || '(none)',
        clusterValue: clusterImgStr || '(none)',
        isDifferent: diff,
      });
      if (diff) {
        diffSummary.push(`Image drift: cluster running "${clusterImgStr || 'none'}" vs declared "${manifestImgStr || 'none'}"`);
      }
    }

    // 2. Workload replicas
    if (manifestReplicas !== undefined || clusterReplicas !== undefined) {
      const diff = manifestReplicas !== undefined && clusterReplicas !== undefined && manifestReplicas !== clusterReplicas;
      fields.push({
        path: 'spec.replicas',
        label: 'Replicas',
        manifestValue: manifestReplicas !== undefined ? String(manifestReplicas) : '(unset)',
        clusterValue: clusterReplicas !== undefined ? String(clusterReplicas) : '(unset)',
        isDifferent: diff,
      });
      if (diff) {
        diffSummary.push(`Replica drift: cluster has ${clusterReplicas} vs declared ${manifestReplicas}`);
      }
    }

    // 3. Service type
    if (manifestServiceType || clusterServiceType) {
      const diff = Boolean(manifestServiceType && clusterServiceType && manifestServiceType !== clusterServiceType);
      fields.push({
        path: 'spec.type',
        label: 'Service Type',
        manifestValue: manifestServiceType || 'ClusterIP',
        clusterValue: clusterServiceType || 'ClusterIP',
        isDifferent: diff,
      });
      if (diff) {
        diffSummary.push(`Service type drift: cluster is ${clusterServiceType} vs declared ${manifestServiceType}`);
      }
    }

    // 4. Ports
    if (manifestPorts.length > 0 || clusterPorts.length > 0) {
      const manifestPortsStr = manifestPorts.sort().join(', ');
      const clusterPortsStr = clusterPorts.sort().join(', ');
      const diff = manifestPortsStr !== clusterPortsStr;
      fields.push({
        path: 'spec.ports',
        label: 'Ports',
        manifestValue: manifestPortsStr || '(none)',
        clusterValue: clusterPortsStr || '(none)',
        isDifferent: diff,
      });
      if (diff) {
        diffSummary.push(`Port configuration mismatch`);
      }
    }

    // 5. ConfigMap / Secret keys
    if (['ConfigMap', 'Secret'].includes(kind)) {
      const mKeys = manifestKeys.sort().join(', ');
      const cKeys = clusterKeys.sort().join(', ');
      const diff = mKeys !== cKeys;
      fields.push({
        path: 'data.keys',
        label: 'Data Keys',
        manifestValue: mKeys || '(none)',
        clusterValue: cKeys || '(none)',
        isDifferent: diff,
      });
      if (diff) {
        diffSummary.push(`Data keys differ`);
      }
    }

    const hasDrift = fields.some(f => f.isDifferent);
    if (hasDrift) {
      status = 'out-of-sync';
      statusLabel = 'Out of Sync';
    } else {
      status = 'in-sync';
      statusLabel = 'In Sync';
    }
  }

  return {
    id,
    kind,
    name,
    namespace,
    status,
    statusLabel,
    fileName: manifestNode?.source.filePath,
    sourceLine: manifestNode?.source.line,
    sourceColumn: manifestNode?.source.column,
    manifestNode,
    clusterResource,
    diffSummary,
    fields,
    manifestSpecSummary: {
      images: manifestImages,
      replicas: manifestReplicas,
      ports: manifestPorts,
      serviceType: manifestServiceType,
      keys: manifestKeys,
    },
    clusterSpecSummary: {
      images: clusterImages,
      replicas: clusterReplicas,
      ports: clusterPorts,
      serviceType: clusterServiceType,
      keys: clusterKeys,
      status: clusterResource?.status,
    },
  };
}

/**
 * Builds a full comparison report between local manifest nodes and live cluster resources.
 */
export function buildComparisonReport(
  manifestNodes: ResourceNode[],
  clusterResources: K8sResource[],
  namespaceFilter?: string[]
): ComparisonReport {
  const activeNamespaces = namespaceFilter && namespaceFilter.length > 0 && !namespaceFilter.includes('all')
    ? new Set(namespaceFilter.map(ns => normalizeNamespace(ns)))
    : null;

  // Filter nodes if namespaces specified
  const filteredNodes = manifestNodes.filter(node => {
    if (!activeNamespaces) return true;
    return activeNamespaces.has(normalizeNamespace(node.namespace));
  });

  const filteredClusterResources = clusterResources.filter(res => {
    if (!activeNamespaces) return true;
    return activeNamespaces.has(normalizeNamespace(res.namespace));
  });

  // Map manifest nodes by `${kind}/${namespace}/${name}`
  const manifestMap = new Map<string, ResourceNode>();
  for (const node of filteredNodes) {
    const key = `${node.kind}/${normalizeNamespace(node.namespace)}/${node.name}`.toLowerCase();
    manifestMap.set(key, node);
  }

  // Map cluster resources by `${kind}/${namespace}/${name}`
  const clusterMap = new Map<string, K8sResource>();
  for (const res of filteredClusterResources) {
    const key = `${res.kind}/${normalizeNamespace(res.namespace)}/${res.name}`.toLowerCase();
    clusterMap.set(key, res);
  }

  // Collect all unique keys
  const allKeys = new Set([...manifestMap.keys(), ...clusterMap.keys()]);
  const comparisons: ObjectComparison[] = [];

  for (const key of allKeys) {
    const manifestNode = manifestMap.get(key);
    const clusterRes = clusterMap.get(key);
    comparisons.push(compareObject(manifestNode, clusterRes));
  }

  // Group by Kind
  const byKindMap = new Map<string, ObjectComparison[]>();
  for (const comp of comparisons) {
    const list = byKindMap.get(comp.kind) ?? [];
    list.push(comp);
    byKindMap.set(comp.kind, list);
  }

  // Order kinds: Known preferred kinds first, then remaining alphabetically
  const orderedKindNames = [
    ...KIND_ORDER.filter(k => byKindMap.has(k)),
    ...[...byKindMap.keys()].filter(k => !KIND_ORDER.includes(k)).sort(),
  ];

  const byKind: KindGroupComparison[] = orderedKindNames.map(kind => {
    const items = byKindMap.get(kind) ?? [];
    // Sort items: out-of-sync and missing first, then in-sync, cluster-only
    const statusPriority: Record<DiffStatus, number> = {
      'out-of-sync': 0,
      'missing-in-cluster': 1,
      'cluster-only': 2,
      'in-sync': 3,
    };
    items.sort((a, b) => {
      const prioDiff = statusPriority[a.status] - statusPriority[b.status];
      if (prioDiff !== 0) return prioDiff;
      return a.name.localeCompare(b.name);
    });

    return {
      kind,
      total: items.length,
      outOfSyncCount: items.filter(i => i.status === 'out-of-sync').length,
      missingInClusterCount: items.filter(i => i.status === 'missing-in-cluster').length,
      inSyncCount: items.filter(i => i.status === 'in-sync').length,
      clusterOnlyCount: items.filter(i => i.status === 'cluster-only').length,
      items,
    };
  });

  // Calculate summary
  const summary = {
    outOfSync: comparisons.filter(c => c.status === 'out-of-sync').length,
    missingInCluster: comparisons.filter(c => c.status === 'missing-in-cluster').length,
    inSync: comparisons.filter(c => c.status === 'in-sync').length,
    clusterOnly: comparisons.filter(c => c.status === 'cluster-only').length,
  };

  // Discover all distinct namespaces
  const allNamespaces = Array.from(
    new Set([
      ...filteredNodes.map(n => normalizeNamespace(n.namespace)),
      ...filteredClusterResources.map(r => normalizeNamespace(r.namespace)),
    ])
  ).sort();

  return {
    timestamp: new Date().toISOString(),
    namespaces: allNamespaces,
    totalManifestObjects: filteredNodes.length,
    totalClusterObjects: filteredClusterResources.length,
    totalCompared: comparisons.length,
    summary,
    byKind,
  };
}
