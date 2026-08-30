import type { K8sResource, DependencyCandidate } from '@/lib/types';

export interface Detector {
  name: string;
  detect(resource: K8sResource, allResources: K8sResource[]): DependencyCandidate[];
}
