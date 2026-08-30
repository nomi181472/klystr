import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

/** Detects ownership edges from ownerReferences */
export const ownerReferenceDetector: Detector = {
  name: 'OwnerReferenceDetector',
  detect(resource: K8sResource, allResources: K8sResource[]): DependencyCandidate[] {
    if (!resource.ownerReferences?.length) return [];
    const candidates: DependencyCandidate[] = [];

    for (const ref of resource.ownerReferences) {
      const owner = allResources.find(r => r.uid === ref.uid || (r.kind === ref.kind && r.name === ref.name && r.namespace === resource.namespace));
      if (owner) {
        candidates.push({
          sourceUid: owner.uid,
          sourceKind: owner.kind,
          sourceName: owner.name,
          sourceNamespace: owner.namespace,
          destinationHint: `${ref.kind}/${ref.name} → ${resource.kind}/${resource.name}`,
          detector: 'OwnerReferenceDetector',
          edgeKind: 'ownership',
          rawEvidence: `ownerReference: ${ref.kind}/${ref.name}`,
        });
      }
    }
    return candidates;
  },
};
