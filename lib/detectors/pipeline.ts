import type { K8sResource, DependencyCandidate } from '@/lib/types';
import type { Detector } from './types';
import { environmentVariableDetector } from './environment-variable';
import { serviceNameDetector } from './service-name';
import { urlDetector } from './url-detector';
import { ownerReferenceDetector } from './owner-reference';
import { volumeMountDetector } from './volume-mount';
import { configMapRefDetector } from './configmap-ref';
import { serviceSelectorDetector } from './service-selector';
import { ingressBackendDetector } from './ingress-backend';
import { identityPolicyDetector } from './identity-policy-detector';
import { scalingDetector } from './scaling-detector';
import { storageDetector } from './storage-detector';
import { createLogger } from '@/lib/logger';

const logger = createLogger('detectors');

const detectors: Detector[] = [
  ownerReferenceDetector,
  serviceSelectorDetector,
  ingressBackendDetector,
  identityPolicyDetector,
  scalingDetector,
  storageDetector,
  environmentVariableDetector,
  urlDetector,
  serviceNameDetector,
  volumeMountDetector,
  configMapRefDetector,
];

export function runDetectorPipeline(
  resources: K8sResource[]
): DependencyCandidate[] {
  const candidates: DependencyCandidate[] = [];

  for (const resource of resources) {
    for (const detector of detectors) {
      try {
        const found = detector.detect(resource, resources);
        candidates.push(...found);
      } catch (err) {
        logger.error(`Detector ${detector.name} failed on ${resource.kind}/${resource.name}:`, err);
      }
    }
  }

  return candidates;
}

export { detectors };
