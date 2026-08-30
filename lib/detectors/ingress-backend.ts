import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

/** Detects Ingress → Service backend relationships */
export const ingressBackendDetector: Detector = {
  name: 'IngressBackendDetector',
  detect(resource: K8sResource, allResources: K8sResource[]): DependencyCandidate[] {
    if (resource.kind !== 'Ingress') return [];
    const candidates: DependencyCandidate[] = [];

    // Find services in the same namespace that match common naming
    const services = allResources.filter(
      r => r.kind === 'Service' && r.namespace === resource.namespace
    );

    // In a real implementation, parse spec.rules[].http.paths[].backend
    // For mock data, infer from naming conventions
    for (const svc of services) {
      if (svc.name.includes('gateway') || svc.name.includes('frontend') || svc.name.includes('api')) {
        candidates.push({
          sourceUid: resource.uid,
          sourceKind: resource.kind,
          sourceName: resource.name,
          sourceNamespace: resource.namespace,
          destinationHint: svc.name,
          protocol: 'http',
          port: svc.ports?.[0]?.port,
          detector: 'IngressBackendDetector',
          edgeKind: 'communication',
          rawEvidence: `Ingress backend → Service/${svc.name}`,
        });
      }
    }

    return candidates;
  },
};
