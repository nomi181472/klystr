import type { ResourceNode } from '@/lib/manifest-graph/types';
import type { K8sResource } from '@/lib/types';

export type DiffStatus = 'in-sync' | 'out-of-sync' | 'missing-in-cluster' | 'cluster-only';

export interface DiffField {
  path: string;
  label: string;
  manifestValue: string;
  clusterValue: string;
  isDifferent: boolean;
  manifestHash?: string;
  clusterHash?: string;
}

export interface PropertyTreeNode {
  key: string;
  path: string;
  type: 'object' | 'array' | 'primitive';
  label?: string;
  manifestValue?: string;
  clusterValue?: string;
  manifestHash?: string;
  clusterHash?: string;
  status: DiffStatus;
  isDifferent: boolean;
  children?: PropertyTreeNode[];
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
  propertyTree: PropertyTreeNode[];
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

export interface CompareProgress {
  step: 1 | 2 | 3 | 4 | 5;
  stepName: string;
  description: string;
  percent: number;
  currentItem?: string;
}

export type OnProgressFn = (progress: CompareProgress) => void;

// Preferred Kind order matching user presentation requirement
export const KIND_ORDER: readonly string[] = [
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

export function normalizeNamespace(ns?: string | null): string {
  if (!ns || ns === 'null' || ns === 'undefined') return 'default';
  const trimmed = ns.trim();
  return trimmed || 'default';
}

/**
 * Fast, deterministic 32-bit FNV-1a hash algorithm for strings.
 * Generates an 8-character hex hash that runs identically in Node.js and browser Webviews.
 */
export function fnv1aHex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime: 16777619
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministically serializes any JavaScript value with sorted keys.
 */
export function canonicalJsonStringify(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'object') return String(val);

  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJsonStringify).join(',') + ']';
  }

  const keys = Object.keys(val as Record<string, unknown>).sort();
  const pairs = keys.map(k => {
    const v = (val as Record<string, unknown>)[k];
    return JSON.stringify(k) + ':' + canonicalJsonStringify(v);
  });
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes a deterministic canonical property hash for any value.
 */
export function computePropertyHash(val: unknown): string {
  if (val === null || val === undefined) return '00000000';
  const canonical = canonicalJsonStringify(val);
  return fnv1aHex(canonical);
}

/**
 * Decodes base64 string safely if valid, otherwise returns original string.
 */
export function safeDecodeBase64(str: string): string {
  try {
    if (typeof atob === 'function') {
      return atob(str);
    }
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch {
    return str;
  }
}

/**
 * Safe base64 detection
 */
function isBase64(str: string): boolean {
  if (typeof str !== 'string' || str.length === 0 || str.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(str);
}

function extractPodSpec(raw?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const spec = (raw.spec as Record<string, unknown>) ?? raw;
  if (spec.template && typeof spec.template === 'object') {
    const template = spec.template as Record<string, unknown>;
    return (template.spec as Record<string, unknown>) ?? spec;
  }
  return spec;
}

function extractContainers(raw?: Record<string, unknown>): Array<Record<string, unknown>> {
  const podSpec = extractPodSpec(raw);
  if (!podSpec) return [];
  const list: Array<Record<string, unknown>> = [];
  if (Array.isArray(podSpec.containers)) {
    list.push(...(podSpec.containers as Array<Record<string, unknown>>));
  }
  if (Array.isArray(podSpec.initContainers)) {
    list.push(...(podSpec.initContainers as Array<Record<string, unknown>>));
  }
  return list;
}

function extractImages(raw?: Record<string, unknown>, resource?: K8sResource): string[] {
  const set = new Set<string>();
  if (resource?.containers) {
    for (const c of resource.containers) {
      if (c.image) set.add(c.image);
    }
  }
  const containers = extractContainers(raw);
  for (const c of containers) {
    if (typeof c.image === 'string' && c.image) {
      set.add(c.image);
    }
  }
  return Array.from(set);
}

function extractReplicas(raw?: Record<string, unknown>, resource?: K8sResource): number | string | undefined {
  if (!raw && !resource) return undefined;
  const spec = raw?.spec as Record<string, unknown> | undefined;
  if (spec && typeof spec.replicas === 'number') return spec.replicas;
  const status = raw?.status as Record<string, unknown> | undefined;
  if (status && typeof status.replicas === 'number') return status.replicas;
  return undefined;
}

function extractPorts(raw?: Record<string, unknown>, resource?: K8sResource): string[] {
  if (resource?.ports && resource.ports.length > 0) {
    return resource.ports.map(p => typeof p === 'string' ? p : `${p.port}/${p.protocol || 'TCP'}`);
  }
  const spec = raw?.spec as Record<string, unknown> | undefined;
  if (spec && Array.isArray(spec.ports)) {
    const portsList: string[] = [];
    for (const p of spec.ports as Array<Record<string, unknown>>) {
      if (p && p.port !== undefined) {
        portsList.push(`${p.port}${p.protocol ? `/${p.protocol}` : ''}`);
      }
    }
    return portsList;
  }
  return [];
}

function extractDataMap(raw?: Record<string, unknown>): Record<string, string> {
  if (!raw) return {};
  const result: Record<string, string> = {};
  const data = (raw.data as Record<string, unknown>) ?? {};
  const stringData = (raw.stringData as Record<string, unknown>) ?? {};

  for (const [k, v] of Object.entries(stringData)) {
    if (v !== undefined && v !== null) {
      result[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  for (const [k, v] of Object.entries(data)) {
    if (result[k] === undefined && v !== undefined && v !== null) {
      result[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  return result;
}

function extractServiceType(raw?: Record<string, unknown>, resource?: K8sResource): string | undefined {
  if (resource?.serviceType) return resource.serviceType;
  const spec = raw?.spec as Record<string, unknown> | undefined;
  return typeof spec?.type === 'string' ? spec.type : undefined;
}

/**
 * Tries to parse a string as JSON object or array. Returns null if invalid or not object/array.
 */
export function tryParseJson(val: unknown): Record<string, unknown> | unknown[] | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/**
 * Builds nested property tree nodes from structured JSON objects or arrays.
 */
export function buildStructuredJsonTree(
  basePath: string,
  mVal: unknown,
  cVal: unknown
): PropertyTreeNode[] {
  const isMObj = mVal !== null && typeof mVal === 'object';
  const isCObj = cVal !== null && typeof cVal === 'object';

  if (!isMObj && !isCObj) {
    return [];
  }

  const mIsArr = Array.isArray(mVal);
  const cIsArr = Array.isArray(cVal);

  const keysSet = new Set<string>();
  if (isMObj) {
    if (mIsArr) {
      (mVal as unknown[]).forEach((_, idx) => keysSet.add(String(idx)));
    } else {
      Object.keys(mVal as Record<string, unknown>).forEach(k => keysSet.add(k));
    }
  }
  if (isCObj) {
    if (cIsArr) {
      (cVal as unknown[]).forEach((_, idx) => keysSet.add(String(idx)));
    } else {
      Object.keys(cVal as Record<string, unknown>).forEach(k => keysSet.add(k));
    }
  }

  const keys = Array.from(keysSet).sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  const nodes: PropertyTreeNode[] = [];

  for (const k of keys) {
    const childPath = `${basePath}.${k}`;
    const mChild = isMObj ? (mVal as Record<string, unknown>)[k] : undefined;
    const cChild = isCObj ? (cVal as Record<string, unknown>)[k] : undefined;

    const inManifest = mChild !== undefined;
    const inCluster = cChild !== undefined;

    const mChildIsObj = mChild !== null && typeof mChild === 'object';
    const cChildIsObj = cChild !== null && typeof cChild === 'object';

    if (mChildIsObj || cChildIsObj) {
      const subChildren = buildStructuredJsonTree(childPath, mChild, cChild);
      const isDiff = !inManifest || !inCluster || subChildren.some(c => c.isDifferent);
      let status: DiffStatus = 'in-sync';
      if (inManifest && !inCluster) status = 'missing-in-cluster';
      else if (!inManifest && inCluster) status = 'cluster-only';
      else if (isDiff) status = 'out-of-sync';

      nodes.push({
        key: k,
        path: childPath,
        type: Array.isArray(mChild ?? cChild) ? 'array' : 'object',
        label: k,
        manifestHash: computePropertyHash(mChild),
        clusterHash: computePropertyHash(cChild),
        status,
        isDifferent: isDiff,
        children: subChildren,
      });
    } else {
      const mStr = mChild !== undefined ? String(mChild) : undefined;
      const cStr = cChild !== undefined ? String(cChild) : undefined;

      let status: DiffStatus = 'in-sync';
      let isDifferent = false;

      if (inManifest && !inCluster) {
        status = 'missing-in-cluster';
        isDifferent = true;
      } else if (!inManifest && inCluster) {
        status = 'cluster-only';
        isDifferent = true;
      } else if (canonicalJsonStringify(mChild) !== canonicalJsonStringify(cChild)) {
        status = 'out-of-sync';
        isDifferent = true;
      }

      nodes.push({
        key: k,
        path: childPath,
        type: 'primitive',
        label: k,
        manifestValue: mStr,
        clusterValue: cStr,
        manifestHash: computePropertyHash(mChild),
        clusterHash: computePropertyHash(cChild),
        status,
        isDifferent,
      });
    }
  }

  return nodes;
}

/**
 * Builds a hierarchical PropertyTreeNode tree for a Kubernetes object comparison.
 * Uses Merkle-style subtree hashing where parent branches hash their children.
 */
export function buildPropertyTree(
  manifestRaw?: Record<string, unknown>,
  clusterRaw?: Record<string, unknown>,
  kind?: string
): PropertyTreeNode[] {
  const roots: PropertyTreeNode[] = [];

  // 1. Data Branch (ConfigMap / Secret)
  if (['ConfigMap', 'Secret'].includes(kind || '')) {
    const manifestData = extractDataMap(manifestRaw);
    const clusterData = extractDataMap(clusterRaw);
    const isSecret = kind === 'Secret';

    const allKeys = Array.from(new Set([...Object.keys(manifestData), ...Object.keys(clusterData)])).sort();
    const dataChildren: PropertyTreeNode[] = [];

    for (const k of allKeys) {
      const inManifest = k in manifestData;
      const inCluster = k in clusterData;

      let mVal = inManifest ? manifestData[k] : undefined;
      let cVal = inCluster ? clusterData[k] : undefined;

      // Secret normalization: If cluster value is base64 and manifest is plaintext, decode cluster value for comparison
      if (isSecret && cVal !== undefined && isBase64(cVal)) {
        const decodedCluster = safeDecodeBase64(cVal);
        if (mVal !== undefined && !isBase64(mVal)) {
          cVal = decodedCluster;
        } else if (mVal !== undefined && isBase64(mVal)) {
          // both base64
          mVal = safeDecodeBase64(mVal);
          cVal = decodedCluster;
        }
      }

      const mHash = mVal !== undefined ? computePropertyHash(mVal) : undefined;
      const cHash = cVal !== undefined ? computePropertyHash(cVal) : undefined;

      let status: DiffStatus = 'in-sync';
      let isDifferent = false;

      if (inManifest && !inCluster) {
        status = 'missing-in-cluster';
        isDifferent = true;
      } else if (!inManifest && inCluster) {
        status = 'cluster-only';
        isDifferent = true;
      } else if (mVal !== cVal) {
        status = 'out-of-sync';
        isDifferent = true;
      }

      const mJson = tryParseJson(mVal);
      const cJson = tryParseJson(cVal);

      if (mJson || cJson) {
        const jsonChildren = buildStructuredJsonTree(`data.${k}`, mJson, cJson);
        const jsonDiff = !inManifest || !inCluster || jsonChildren.some(c => c.isDifferent);
        let nodeStatus: DiffStatus = 'in-sync';
        if (inManifest && !inCluster) nodeStatus = 'missing-in-cluster';
        else if (!inManifest && inCluster) nodeStatus = 'cluster-only';
        else if (jsonDiff) nodeStatus = 'out-of-sync';

        dataChildren.push({
          key: k,
          path: `data.${k}`,
          type: 'object',
          label: `Key: ${k} (JSON)`,
          manifestValue: mVal !== undefined ? (mVal.length > 200 ? mVal.slice(0, 200) + '…' : mVal) : undefined,
          clusterValue: cVal !== undefined ? (cVal.length > 200 ? cVal.slice(0, 200) + '…' : cVal) : undefined,
          manifestHash: mHash,
          clusterHash: cHash,
          status: nodeStatus,
          isDifferent: jsonDiff,
          children: jsonChildren,
        });
      } else {
        dataChildren.push({
          key: k,
          path: `data.${k}`,
          type: 'primitive',
          label: `Key: ${k}`,
          manifestValue: mVal !== undefined ? (mVal.length > 300 ? mVal.slice(0, 300) + '…' : mVal) : undefined,
          clusterValue: cVal !== undefined ? (cVal.length > 300 ? cVal.slice(0, 300) + '…' : cVal) : undefined,
          manifestHash: mHash,
          clusterHash: cHash,
          status,
          isDifferent,
        });
      }
    }

    const dataDiff = dataChildren.some(c => c.isDifferent);
    const mDataHash = computePropertyHash(manifestData);
    const cDataHash = computePropertyHash(clusterData);

    roots.push({
      key: 'data',
      path: 'data',
      type: 'object',
      label: `Data (${allKeys.length} keys)`,
      manifestHash: mDataHash,
      clusterHash: cDataHash,
      status: dataDiff ? 'out-of-sync' : 'in-sync',
      isDifferent: dataDiff,
      children: dataChildren,
    });
  }

  // 2. Spec Branch (Workloads & Networking)
  const manifestSpec = (manifestRaw?.spec as Record<string, unknown>) ?? {};
  const clusterSpec = (clusterRaw?.spec as Record<string, unknown>) ?? {};
  const specChildren: PropertyTreeNode[] = [];

  // Replicas
  if ('replicas' in manifestSpec || 'replicas' in clusterSpec) {
    const mRep = manifestSpec.replicas !== undefined ? String(manifestSpec.replicas) : undefined;
    const cRep = clusterSpec.replicas !== undefined ? String(clusterSpec.replicas) : undefined;
    const repDiff = mRep !== cRep;
    specChildren.push({
      key: 'replicas',
      path: 'spec.replicas',
      type: 'primitive',
      label: 'Replicas',
      manifestValue: mRep ?? '(unset)',
      clusterValue: cRep ?? '(unset)',
      manifestHash: computePropertyHash(mRep),
      clusterHash: computePropertyHash(cRep),
      status: repDiff ? 'out-of-sync' : 'in-sync',
      isDifferent: repDiff,
    });
  }

  // Service Type & Ports
  if (kind === 'Service') {
    const mType = typeof manifestSpec.type === 'string' ? manifestSpec.type : 'ClusterIP';
    const cType = typeof clusterSpec.type === 'string' ? clusterSpec.type : 'ClusterIP';
    const typeDiff = mType !== cType;
    specChildren.push({
      key: 'type',
      path: 'spec.type',
      type: 'primitive',
      label: 'Service Type',
      manifestValue: mType,
      clusterValue: cType,
      manifestHash: computePropertyHash(mType),
      clusterHash: computePropertyHash(cType),
      status: typeDiff ? 'out-of-sync' : 'in-sync',
      isDifferent: typeDiff,
    });
  }

  // Containers (Images & Environment Variables)
  const mContainers = extractContainers(manifestRaw);
  const cContainers = extractContainers(clusterRaw);
  if (mContainers.length > 0 || cContainers.length > 0) {
    const containerChildren: PropertyTreeNode[] = [];
    const maxLen = Math.max(mContainers.length, cContainers.length);

    for (let i = 0; i < maxLen; i++) {
      const mC = mContainers[i];
      const cC = cContainers[i];
      const cName = (mC?.name || cC?.name || `container-${i}`) as string;
      const cSubChildren: PropertyTreeNode[] = [];

      // Image
      const mImg = (mC?.image as string) ?? undefined;
      const cImg = (cC?.image as string) ?? undefined;
      const imgDiff = mImg !== cImg;
      cSubChildren.push({
        key: 'image',
        path: `spec.template.spec.containers[${i}].image`,
        type: 'primitive',
        label: 'Image',
        manifestValue: mImg ?? '(none)',
        clusterValue: cImg ?? '(none)',
        manifestHash: computePropertyHash(mImg),
        clusterHash: computePropertyHash(cImg),
        status: imgDiff ? 'out-of-sync' : 'in-sync',
        isDifferent: imgDiff,
      });

      // Environment variables
      const mEnv = Array.isArray(mC?.env) ? (mC.env as Array<Record<string, unknown>>) : [];
      const cEnv = Array.isArray(cC?.env) ? (cC.env as Array<Record<string, unknown>>) : [];
      const envMapM: Record<string, string> = {};
      const envMapC: Record<string, string> = {};

      for (const e of mEnv) {
        if (e && typeof e.name === 'string') envMapM[e.name] = String(e.value ?? '');
      }
      for (const e of cEnv) {
        if (e && typeof e.name === 'string') envMapC[e.name] = String(e.value ?? '');
      }

      const allEnvKeys = Array.from(new Set([...Object.keys(envMapM), ...Object.keys(envMapC)])).sort();
      if (allEnvKeys.length > 0) {
        const envNodes: PropertyTreeNode[] = allEnvKeys.map(envKey => {
          const inM = envKey in envMapM;
          const inC = envKey in envMapC;
          const valM = inM ? envMapM[envKey] : undefined;
          const valC = inC ? envMapC[envKey] : undefined;
          const isDiff = valM !== valC;
          let envStatus: DiffStatus = 'in-sync';
          if (inM && !inC) envStatus = 'missing-in-cluster';
          else if (!inM && inC) envStatus = 'cluster-only';
          else if (isDiff) envStatus = 'out-of-sync';

          return {
            key: envKey,
            path: `spec.template.spec.containers[${i}].env.${envKey}`,
            type: 'primitive',
            label: `env: ${envKey}`,
            manifestValue: valM ?? '(unset)',
            clusterValue: valC ?? '(unset)',
            manifestHash: computePropertyHash(valM),
            clusterHash: computePropertyHash(valC),
            status: envStatus,
            isDifferent: isDiff,
          };
        });

        const envDiff = envNodes.some(n => n.isDifferent);
        cSubChildren.push({
          key: 'env',
          path: `spec.template.spec.containers[${i}].env`,
          type: 'object',
          label: `Environment Variables (${allEnvKeys.length})`,
          manifestHash: computePropertyHash(envMapM),
          clusterHash: computePropertyHash(envMapC),
          status: envDiff ? 'out-of-sync' : 'in-sync',
          isDifferent: envDiff,
          children: envNodes,
        });
      }

      const cDiff = cSubChildren.some(c => c.isDifferent);
      containerChildren.push({
        key: cName,
        path: `spec.template.spec.containers[${i}]`,
        type: 'object',
        label: `Container: ${cName}`,
        manifestHash: computePropertyHash(mC),
        clusterHash: computePropertyHash(cC),
        status: cDiff ? 'out-of-sync' : 'in-sync',
        isDifferent: cDiff,
        children: cSubChildren,
      });
    }

    const containersDiff = containerChildren.some(c => c.isDifferent);
    specChildren.push({
      key: 'containers',
      path: 'spec.template.spec.containers',
      type: 'array',
      label: `Containers (${containerChildren.length})`,
      manifestHash: computePropertyHash(mContainers),
      clusterHash: computePropertyHash(cContainers),
      status: containersDiff ? 'out-of-sync' : 'in-sync',
      isDifferent: containersDiff,
      children: containerChildren,
    });
  }

  if (specChildren.length > 0) {
    const specDiff = specChildren.some(c => c.isDifferent);
    roots.push({
      key: 'spec',
      path: 'spec',
      type: 'object',
      label: 'Specification (spec)',
      manifestHash: computePropertyHash(manifestSpec),
      clusterHash: computePropertyHash(clusterSpec),
      status: specDiff ? 'out-of-sync' : 'in-sync',
      isDifferent: specDiff,
      children: specChildren,
    });
  }

  return roots;
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

  const manifestDataMap = extractDataMap(manifestRaw);
  const clusterDataMap = extractDataMap(clusterRaw);
  const manifestKeys = Object.keys(manifestDataMap).sort();
  const clusterKeys = Object.keys(clusterDataMap).sort();

  // Build the hierarchical Property Tree
  const propertyTree = buildPropertyTree(manifestRaw, clusterRaw, kind);

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
        manifestHash: computePropertyHash(manifestImages),
        clusterHash: computePropertyHash(clusterImages),
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
        manifestHash: computePropertyHash(manifestReplicas),
        clusterHash: computePropertyHash(clusterReplicas),
        isDifferent: diff,
      });
      if (diff) {
        diffSummary.push(`Replica drift: cluster has ${clusterReplicas} vs declared ${manifestReplicas}`);
      }
    }

    // 3. Service type
    if (manifestServiceType || clusterServiceType) {
      const diff = manifestServiceType !== clusterServiceType;
      fields.push({
        path: 'spec.type',
        label: 'Service Type',
        manifestValue: manifestServiceType || 'ClusterIP',
        clusterValue: clusterServiceType || 'ClusterIP',
        manifestHash: computePropertyHash(manifestServiceType),
        clusterHash: computePropertyHash(clusterServiceType),
        isDifferent: diff,
      });
      if (diff) {
        diffSummary.push(`Service type drift: cluster is ${clusterServiceType || 'ClusterIP'} vs declared ${manifestServiceType || 'ClusterIP'}`);
      }
    }

    // 4. Granular ConfigMap / Secret key-value comparison
    if (['ConfigMap', 'Secret'].includes(kind)) {
      const allKeys = Array.from(new Set([...manifestKeys, ...clusterKeys])).sort();
      let keyOrValueDiffCount = 0;

      for (const k of allKeys) {
        let valM = manifestDataMap[k];
        let valC = clusterDataMap[k];

        if (kind === 'Secret' && valC !== undefined && isBase64(valC)) {
          valC = safeDecodeBase64(valC);
          if (valM !== undefined && isBase64(valM)) {
            valM = safeDecodeBase64(valM);
          }
        }

        const isDiff = valM !== valC;
        if (isDiff) {
          keyOrValueDiffCount++;

          const mJson = tryParseJson(valM);
          const cJson = tryParseJson(valC);

          if (mJson || cJson) {
            const jsonTree = buildStructuredJsonTree(`data.${k}`, mJson, cJson);
            let nestedLeafDiffCount = 0;
            const extractDriftedLeaves = (treeNodes: PropertyTreeNode[]) => {
              for (const n of treeNodes) {
                if (n.children && n.children.length > 0) {
                  extractDriftedLeaves(n.children);
                } else if (n.isDifferent) {
                  nestedLeafDiffCount++;
                  fields.push({
                    path: n.path,
                    label: `${k} -> ${n.label || n.key}`,
                    manifestValue: n.manifestValue ?? '(missing)',
                    clusterValue: n.clusterValue ?? '(missing)',
                    manifestHash: n.manifestHash,
                    clusterHash: n.clusterHash,
                    isDifferent: true,
                  });
                  diffSummary.push(
                    `${k}.${n.key} drift: cluster has "${n.clusterValue ?? 'missing'}" vs declared "${n.manifestValue ?? 'missing'}"`
                  );
                }
              }
            };
            extractDriftedLeaves(jsonTree);

            if (nestedLeafDiffCount === 0) {
              fields.push({
                path: `data.${k}`,
                label: `Key: ${k}`,
                manifestValue: valM !== undefined ? (valM.length > 80 ? valM.slice(0, 80) + '…' : valM) : '(missing)',
                clusterValue: valC !== undefined ? (valC.length > 80 ? valC.slice(0, 80) + '…' : valC) : '(missing)',
                manifestHash: computePropertyHash(valM),
                clusterHash: computePropertyHash(valC),
                isDifferent: true,
              });
              diffSummary.push(`Key "${k}" drift: cluster value differs from declared manifest`);
            }
          } else {
            fields.push({
              path: `data.${k}`,
              label: `Key: ${k}`,
              manifestValue: valM !== undefined ? (valM.length > 80 ? valM.slice(0, 80) + '…' : valM) : '(missing)',
              clusterValue: valC !== undefined ? (valC.length > 80 ? valC.slice(0, 80) + '…' : valC) : '(missing)',
              manifestHash: computePropertyHash(valM),
              clusterHash: computePropertyHash(valC),
              isDifferent: true,
            });
            diffSummary.push(`Key "${k}" drift: cluster value differs from declared manifest`);
          }
        }
      }

      if (keyOrValueDiffCount > 0 && diffSummary.length === 0) {
        diffSummary.push(`${keyOrValueDiffCount} data key/value difference${keyOrValueDiffCount === 1 ? '' : 's'} detected`);
      }
    }

    // 5. Recursively collect all drifted leaf properties from propertyTree into fields and diffSummary
    const collectDriftedLeaves = (treeNodes: PropertyTreeNode[]) => {
      for (const node of treeNodes) {
        if (node.children && node.children.length > 0) {
          collectDriftedLeaves(node.children);
        } else if (node.isDifferent) {
          const alreadyCovered = fields.some(f => f.path === node.path);
          if (!alreadyCovered) {
            fields.push({
              path: node.path,
              label: node.label || node.key,
              manifestValue: node.manifestValue ?? '(unset)',
              clusterValue: node.clusterValue ?? '(unset)',
              manifestHash: node.manifestHash,
              clusterHash: node.clusterHash,
              isDifferent: true,
            });
            diffSummary.push(
              `${node.label || node.key} drift: cluster has "${node.clusterValue ?? 'unset'}" vs declared "${node.manifestValue ?? 'unset'}"`
            );
          }
        }
      }
    };
    collectDriftedLeaves(propertyTree);

    // Check tree diff for any other property drifts
    const hasTreeDrift = propertyTree.some(root => root.isDifferent);
    const hasFieldDrift = fields.some(f => f.isDifferent);

    if (hasFieldDrift || hasTreeDrift) {
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
    sourceLine: (manifestNode?.source as any)?.line,
    sourceColumn: (manifestNode?.source as any)?.column,
    manifestNode,
    clusterResource,
    diffSummary,
    fields,
    propertyTree,
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
 * Synchronous comparison report generator.
 */
export function buildComparisonReport(
  nodes: ResourceNode[],
  clusterResources: K8sResource[],
  selectedNamespaces?: string[]
): ComparisonReport {
  const activeNs = selectedNamespaces && selectedNamespaces.length > 0 ? new Set(selectedNamespaces.map(normalizeNamespace)) : null;

  const manifestMap = new Map<string, ResourceNode>();
  for (const n of nodes) {
    const ns = normalizeNamespace(n.namespace);
    if (!activeNs || activeNs.has(ns)) {
      const key = `${n.kind}/${ns}/${n.name}`.toLowerCase();
      manifestMap.set(key, n);
    }
  }

  const clusterMap = new Map<string, K8sResource>();
  for (const r of clusterResources) {
    const ns = normalizeNamespace(r.namespace);
    if (!activeNs || activeNs.has(ns)) {
      const key = `${r.kind}/${ns}/${r.name}`.toLowerCase();
      clusterMap.set(key, r);
    }
  }

  const allKeys = Array.from(new Set([...manifestMap.keys(), ...clusterMap.keys()]));
  const comparedItems: ObjectComparison[] = [];

  for (const key of allKeys) {
    const mNode = manifestMap.get(key);
    const cRes = clusterMap.get(key);
    comparedItems.push(compareObject(mNode, cRes));
  }

  return assembleReport(nodes, clusterResources, comparedItems, activeNs);
}

/**
 * Strictly Asynchronous, Parallel Comparison Pipeline with event-loop yielding and 5-step progress streaming.
 */
export async function buildComparisonReportAsync(
  nodes: ResourceNode[],
  clusterResources: K8sResource[],
  selectedNamespaces?: string[],
  onProgress?: OnProgressFn
): Promise<ComparisonReport> {
  const activeNs = selectedNamespaces && selectedNamespaces.length > 0 ? new Set(selectedNamespaces.map(normalizeNamespace)) : null;

  // Step 1 [0% - 25%]: Manifest Parsing & Indexing
  onProgress?.({
    step: 1,
    stepName: 'Reading Manifests',
    description: `Indexing ${nodes.length} manifest objects from workspace`,
    percent: 15,
  });
  await yieldToEventLoop();

  const manifestMap = new Map<string, ResourceNode>();
  for (const n of nodes) {
    const ns = normalizeNamespace(n.namespace);
    if (!activeNs || activeNs.has(ns)) {
      const key = `${n.kind}/${ns}/${n.name}`.toLowerCase();
      manifestMap.set(key, n);
    }
  }

  // Step 2 [25% - 50%]: Live Cluster Discovery Indexing
  onProgress?.({
    step: 2,
    stepName: 'Cluster Discovery',
    description: `Indexed ${clusterResources.length} live cluster resources`,
    percent: 35,
  });
  await yieldToEventLoop();

  const clusterMap = new Map<string, K8sResource>();
  for (const r of clusterResources) {
    const ns = normalizeNamespace(r.namespace);
    if (!activeNs || activeNs.has(ns)) {
      const key = `${r.kind}/${ns}/${r.name}`.toLowerCase();
      clusterMap.set(key, r);
    }
  }

  // Step 3 [50% - 65%]: Normalizing Objects & Stripping Metadata
  onProgress?.({
    step: 3,
    stepName: 'Metadata Normalization',
    description: 'Normalizing namespaces and stripping transient cluster metadata',
    percent: 55,
  });
  await yieldToEventLoop();

  const allKeys = Array.from(new Set([...manifestMap.keys(), ...clusterMap.keys()]));
  const comparedItems: ObjectComparison[] = [];
  const totalKeys = allKeys.length;

  // Step 4 [65% - 90%]: Chunked Parallel Property Hashing & Tree Diffing
  const CHUNK_SIZE = 8;
  for (let i = 0; i < totalKeys; i += CHUNK_SIZE) {
    const chunk = allKeys.slice(i, i + CHUNK_SIZE);
    for (const key of chunk) {
      const mNode = manifestMap.get(key);
      const cRes = clusterMap.get(key);
      comparedItems.push(compareObject(mNode, cRes));
    }

    const currentItem = chunk[chunk.length - 1];
    const progressPercent = Math.min(90, Math.round(65 + (i / (totalKeys || 1)) * 25));
    onProgress?.({
      step: 4,
      stepName: 'Property Hashing',
      description: `Computing property hashes & building diff trees (${Math.min(i + CHUNK_SIZE, totalKeys)}/${totalKeys})`,
      percent: progressPercent,
      currentItem,
    });
    await yieldToEventLoop();
  }

  // Step 5 [90% - 100%]: Assembling Kind-Grouped Report
  onProgress?.({
    step: 5,
    stepName: 'Report Assembly',
    description: 'Prioritizing Kind hierarchies and finalizing metrics',
    percent: 95,
  });
  await yieldToEventLoop();

  const report = assembleReport(nodes, clusterResources, comparedItems, activeNs);

  onProgress?.({
    step: 5,
    stepName: 'Complete',
    description: `Comparison complete (${comparedItems.length} objects analyzed)`,
    percent: 100,
  });

  return report;
}

function assembleReport(
  nodes: ResourceNode[],
  clusterResources: K8sResource[],
  comparedItems: ObjectComparison[],
  activeNs: Set<string> | null
): ComparisonReport {
  // Group by Kind
  const groupsMap = new Map<string, ObjectComparison[]>();
  for (const item of comparedItems) {
    if (!groupsMap.has(item.kind)) {
      groupsMap.set(item.kind, []);
    }
    groupsMap.get(item.kind)!.push(item);
  }

  // Sort groups with Deployment first, StatefulSet second, etc.
  const sortedKinds = Array.from(groupsMap.keys()).sort((a, b) => {
    const idxA = KIND_ORDER.indexOf(a);
    const idxB = KIND_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const byKind: KindGroupComparison[] = sortedKinds.map(kind => {
    const items = groupsMap.get(kind) || [];
    // Sort items: out-of-sync first, then missing-in-cluster, then name
    items.sort((a, b) => {
      const rank = (s: DiffStatus) => {
        if (s === 'out-of-sync') return 0;
        if (s === 'missing-in-cluster') return 1;
        if (s === 'cluster-only') return 2;
        return 3;
      };
      const rA = rank(a.status);
      const rB = rank(b.status);
      if (rA !== rB) return rA - rB;
      return a.name.localeCompare(b.name);
    });

    const outOfSyncCount = items.filter(i => i.status === 'out-of-sync').length;
    const missingInClusterCount = items.filter(i => i.status === 'missing-in-cluster').length;
    const inSyncCount = items.filter(i => i.status === 'in-sync').length;
    const clusterOnlyCount = items.filter(i => i.status === 'cluster-only').length;

    return {
      kind,
      total: items.length,
      outOfSyncCount,
      missingInClusterCount,
      inSyncCount,
      clusterOnlyCount,
      items,
    };
  });

  const summary = {
    outOfSync: comparedItems.filter(i => i.status === 'out-of-sync').length,
    missingInCluster: comparedItems.filter(i => i.status === 'missing-in-cluster').length,
    inSync: comparedItems.filter(i => i.status === 'in-sync').length,
    clusterOnly: comparedItems.filter(i => i.status === 'cluster-only').length,
  };

  const namespaces = Array.from(
    new Set([
      ...nodes.map(n => normalizeNamespace(n.namespace)),
      ...clusterResources.map(r => normalizeNamespace(r.namespace)),
    ])
  ).sort();

  return {
    timestamp: new Date().toISOString(),
    namespaces: activeNs ? Array.from(activeNs).sort() : namespaces,
    totalManifestObjects: nodes.length,
    totalClusterObjects: clusterResources.length,
    totalCompared: comparedItems.length,
    summary,
    byKind,
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
