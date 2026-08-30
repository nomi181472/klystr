import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

/** Detects HPA → Deployment / HPA → StatefulSet (scaling) */
export const scalingDetector: Detector = {
  name: 'ScalingDetector',
  detect(resource: K8sResource, allResources: K8sResource[]): DependencyCandidate[] {
    if (resource.kind !== 'HorizontalPodAutoscaler') return [];
    const candidates: DependencyCandidate[] = [];

    const scaleTargetRef = (resource.raw?.spec as { scaleTargetRef?: { kind: string; name: string } })?.scaleTargetRef;
    if (scaleTargetRef) {
      const target = allResources.find(
        r => r.kind === scaleTargetRef.kind && r.name === scaleTargetRef.name && r.namespace === resource.namespace
      );
      if (target) {
        candidates.push({
          sourceUid: resource.uid,
          sourceKind: resource.kind,
          sourceName: resource.name,
          sourceNamespace: resource.namespace,
          destinationHint: target.name,
          detector: 'ScalingDetector',
          edgeKind: 'communication',
          relationshipCategory: 'scaling',
          rawEvidence: `HPA ${resource.name} controls scaling for ${target.kind}/${target.name}`,
        });
      }
    }

    return candidates;
  },
};
