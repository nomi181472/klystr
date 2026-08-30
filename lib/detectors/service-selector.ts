import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

/** Detects Service → Pod relationships via selector matching */
export const serviceSelectorDetector: Detector = {
  name: 'ServiceSelectorDetector',
  detect(resource: K8sResource, allResources: K8sResource[]): DependencyCandidate[] {
    if (resource.kind !== 'Service' || !resource.selector) return [];
    const candidates: DependencyCandidate[] = [];

    // Find workloads (Deployments, StatefulSets, DaemonSets) whose labels match
    const workloadKinds = ['Deployment', 'StatefulSet', 'DaemonSet'];
    for (const target of allResources) {
      if (!workloadKinds.includes(target.kind)) continue;
      if (target.namespace !== resource.namespace) continue;

      const matches = Object.entries(resource.selector).every(
        ([k, v]) => target.labels[k] === v
      );
      if (matches) {
        candidates.push({
          sourceUid: resource.uid,
          sourceKind: resource.kind,
          sourceName: resource.name,
          sourceNamespace: resource.namespace,
          destinationHint: target.name,
          detector: 'ServiceSelectorDetector',
          edgeKind: 'communication',
          rawEvidence: `Service selector ${JSON.stringify(resource.selector)} matches ${target.kind}/${target.name}`,
        });
      }
    }

    return candidates;
  },
};
