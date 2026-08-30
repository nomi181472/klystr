import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

/** Detects ServiceAccount → Pod (identity) and NetworkPolicy → Pod (policy) */
export const identityPolicyDetector: Detector = {
  name: 'IdentityPolicyDetector',
  detect(resource: K8sResource, allResources: K8sResource[]): DependencyCandidate[] {
    const candidates: DependencyCandidate[] = [];

    // 1. ServiceAccount → Pod (Identity)
    if (resource.kind === 'ServiceAccount') {
      const workloads = allResources.filter(
        r => ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet'].includes(r.kind) && r.namespace === resource.namespace
      );
      for (const w of workloads) {
        const saName = (w.raw?.spec as { serviceAccountName?: string; template?: { spec?: { serviceAccountName?: string } } })?.serviceAccountName ??
          (w.raw?.spec as { template?: { spec?: { serviceAccountName?: string } } })?.template?.spec?.serviceAccountName;
        if (saName === resource.name || w.labels?.['service-account'] === resource.name) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: w.name,
            detector: 'IdentityPolicyDetector',
            edgeKind: 'communication',
            relationshipCategory: 'identity',
            rawEvidence: `ServiceAccount ${resource.name} assigned to ${w.kind}/${w.name}`,
          });
        }
      }
    }

    // 2. NetworkPolicy → Pod (Policy)
    if (resource.kind === 'NetworkPolicy') {
      const targetWorkloads = allResources.filter(
        r => ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet'].includes(r.kind) && r.namespace === resource.namespace
      );
      for (const w of targetWorkloads) {
        if (!resource.selector) continue;
        const matches = Object.entries(resource.selector).every(
          ([k, v]) => w.labels[k] === v
        );
        if (matches) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: w.name,
            detector: 'IdentityPolicyDetector',
            edgeKind: 'communication',
            relationshipCategory: 'policy',
            rawEvidence: `NetworkPolicy ${resource.name} applies to ${w.kind}/${w.name}`,
          });
        }
      }
    }

    return candidates;
  },
};
