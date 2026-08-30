import type { K8sResource, DependencyCandidate, ResolvedDependency, EvidenceEntry } from '@/lib/types';
import type { ConfidenceTier, NetworkPolicyStatus } from '@/config/constants';
import type { K8sKind } from '@/config/resource-types';

const SVC_DNS_RE = /^([a-z0-9-]+)\.([a-z0-9-]+)\.svc(?:\.cluster\.local)?$/i;
const EXTERNAL_DOMAINS = /\.(com|io|org|net|dev|app|cloud|co|me|us|uk)$/i;

export function resolveDependencies(
  candidates: DependencyCandidate[],
  resources: K8sResource[]
): ResolvedDependency[] {
  const edgeMap = new Map<string, ResolvedDependency>();

  for (const candidate of candidates) {
    const resolution = resolveCandidate(candidate, resources);
    if (!resolution) continue;

    const edgeKey = `${candidate.sourceUid}→${resolution.destinationUid ?? resolution.destinationName}:${candidate.edgeKind}`;

    if (edgeMap.has(edgeKey)) {
      // Merge evidence into existing edge
      const existing = edgeMap.get(edgeKey)!;
      existing.evidence.push(...resolution.evidence);
      // Upgrade confidence if new evidence is stronger
      if (confidenceRank(resolution.confidence) < confidenceRank(existing.confidence)) {
        existing.confidence = resolution.confidence;
      }
    } else {
      edgeMap.set(edgeKey, resolution);
    }
  }

  return Array.from(edgeMap.values());
}

function resolveCandidate(
  candidate: DependencyCandidate,
  resources: K8sResource[]
): ResolvedDependency | null {
  const hint = candidate.destinationHint;

  if (candidate.edgeKind === 'ownership') {
    const childName = hint.split(' → ').at(-1)?.split('/').at(-1);
    const child = resources.find(r => r.name === childName && r.namespace === candidate.sourceNamespace);
    if (child) {
      return makeEdge(candidate, child.uid, child.kind as K8sKind, child.name, child.namespace, 'Confirmed',
        `Owner reference resolves to ${child.kind}/${child.name}`);
    }
    return null;
  }

  // Skip self-references
  if (hint === candidate.sourceName) return null;

  // Relationship-specific resources need exact kind-aware resolution before
  // generic fuzzy matching (cluster-scoped PVs intentionally differ in scope).
  if (candidate.relationshipCategory === 'storage-association') {
    const pv = resources.find(resource => resource.kind === 'PersistentVolume' && resource.name === hint);
    if (pv) return makeEdge(candidate, pv.uid, pv.kind, pv.name, pv.namespace, 'Confirmed', `StorageClass association resolves to PersistentVolume/${pv.name}`);
  }
  if (candidate.relationshipCategory === 'storage-binding') {
    const pvc = resources.find(resource => resource.kind === 'PersistentVolumeClaim' && resource.name === hint);
    if (pvc) return makeEdge(candidate, pvc.uid, pvc.kind, pvc.name, pvc.namespace, 'Confirmed', `Volume claim binding resolves to PersistentVolumeClaim/${pvc.name}`);
  }

  // 1. Check for K8s service DNS pattern
  const svcMatch = hint.match(SVC_DNS_RE);
  if (svcMatch) {
    const [, svcName, nsName] = svcMatch;
    const svc = resources.find(
      r => r.kind === 'Service' && r.name === svcName && r.namespace === nsName
    );
    if (svc) {
      return makeEdge(candidate, svc.uid, 'Service' as K8sKind, svc.name, svc.namespace, 'Confirmed',
        `Exact match: service DNS ${hint} → Service/${svc.name} in ${nsName}`);
    }
    // Service DNS but no match found
    return makeEdge(candidate, null, 'External' as K8sKind, hint, null, 'Possible',
      `Service DNS pattern ${hint} but no matching service found`);
  }

  // 2. Check for direct resource name match (ConfigMap, Secret, PVC)
  const configResources = resources.filter(r =>
    ['ConfigMap', 'Secret', 'PersistentVolumeClaim'].includes(r.kind) &&
    r.name === hint &&
    (r.namespace === candidate.sourceNamespace || r.namespace === null)
  );
  if (configResources.length > 0) {
    const target = configResources[0];
    return makeEdge(candidate, target.uid, target.kind as K8sKind, target.name, target.namespace, 'Confirmed',
      `Direct reference: ${hint} matches ${target.kind}/${target.name}`);
  }

  // 3. Check for service name match in same namespace
  const svcSameNs = resources.find(
    r => r.kind === 'Service' && r.name === hint && r.namespace === candidate.sourceNamespace
  );
  if (svcSameNs) {
    return makeEdge(candidate, svcSameNs.uid, 'Service' as K8sKind, svcSameNs.name, svcSameNs.namespace, 'Confirmed',
      `Service name match: ${hint} → Service/${svcSameNs.name}`);
  }

  // 4. Check for workload name match (Deployment, StatefulSet, etc.)
  const workload = resources.find(
    r => ['Deployment', 'StatefulSet', 'DaemonSet'].includes(r.kind) &&
    r.name === hint &&
    r.namespace === candidate.sourceNamespace
  );
  if (workload) {
    return makeEdge(candidate, workload.uid, workload.kind as K8sKind, workload.name, workload.namespace, 'Confirmed',
      `Workload name match: ${hint} → ${workload.kind}/${workload.name}`);
  }

  // 5. Check for IP match
  const byIP = resources.find(r => r.clusterIP === hint || r.podIP === hint);
  if (byIP) {
    return makeEdge(candidate, byIP.uid, byIP.kind as K8sKind, byIP.name, byIP.namespace, 'Probable',
      `IP match: ${hint} → ${byIP.kind}/${byIP.name}`);
  }

  // 6. Check for cross-namespace service match
  const svcAnyNs = resources.find(
    r => r.kind === 'Service' && r.name === hint
  );
  if (svcAnyNs) {
    return makeEdge(candidate, svcAnyNs.uid, 'Service' as K8sKind, svcAnyNs.name, svcAnyNs.namespace, 'Probable',
      `Cross-namespace service match: ${hint} → Service/${svcAnyNs.name} in ${svcAnyNs.namespace}`);
  }

  // 7. Check if it looks external
  if (EXTERNAL_DOMAINS.test(hint) || hint.includes('.') && !hint.includes('.svc')) {
    return makeEdge(candidate, null, 'External' as K8sKind, hint, null, 'Unknown-External',
      `External domain: ${hint}`);
  }

  // 8. Partial name match (fuzzy)
  const partial = resources.find(
    r => r.name.includes(hint) || hint.includes(r.name)
  );
  if (partial) {
    return makeEdge(candidate, partial.uid, partial.kind as K8sKind, partial.name, partial.namespace, 'Possible',
      `Partial name match: ${hint} ~ ${partial.kind}/${partial.name}`);
  }

  // 9. Unknown
  return makeEdge(candidate, null, 'External' as K8sKind, hint, null, 'Unknown-External',
    `No matching resource found for: ${hint}`);
}

function makeEdge(
  candidate: DependencyCandidate,
  destUid: string | null,
  destKind: K8sKind,
  destName: string,
  destNs: string | null,
  confidence: ConfidenceTier,
  description: string
): ResolvedDependency {
  const evidence: EvidenceEntry = {
    detector: candidate.detector,
    rawValue: candidate.fromSecret ? '[SECRET VALUE REDACTED]' : candidate.rawEvidence,
    environmentVariable: candidate.environmentVariable,
    fromSecret: candidate.fromSecret,
    description,
  };

  return {
    id: `${candidate.sourceUid}→${destUid ?? destName}:${candidate.edgeKind}:${candidate.detector}`,
    sourceUid: candidate.sourceUid,
    sourceKind: candidate.sourceKind,
    sourceName: candidate.sourceName,
    sourceNamespace: candidate.sourceNamespace,
    destinationUid: destUid,
    destinationKind: destKind,
    destinationName: destName,
    destinationNamespace: destNs,
    connectionString: candidate.destinationHint,
    protocol: candidate.protocol ?? 'unknown',
    port: candidate.port ?? null,
    environmentVariable: candidate.environmentVariable ?? null,
    evidence: [evidence],
    confidence,
    edgeKind: candidate.edgeKind,
    networkPolicyStatus: 'unknown' as NetworkPolicyStatus,
    discoveredAt: new Date().toISOString(),
  };
}

function confidenceRank(c: ConfidenceTier): number {
  switch (c) {
    case 'Confirmed': return 0;
    case 'Probable': return 1;
    case 'Possible': return 2;
    case 'Unknown-External': return 3;
  }
}
