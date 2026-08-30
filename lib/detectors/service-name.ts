import type { Detector } from './types';
import type { DependencyCandidate } from '@/lib/types';

/** Resolves K8s service DNS names against known services */
export const serviceNameDetector: Detector = {
  name: 'ServiceNameDetector',
  detect(): DependencyCandidate[] {
    // This detector is a no-op at the candidate level; service name resolution
    // happens in the resolver when it matches destinationHint against services.
    return [];
  },
};
