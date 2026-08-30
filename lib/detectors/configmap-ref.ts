import type { Detector } from './types';
import type { DependencyCandidate } from '@/lib/types';

/** Detects deps from envFrom-style whole ConfigMap imports */
export const configMapRefDetector: Detector = {
  name: 'ConfigMapRefDetector',
  detect(): DependencyCandidate[] {
    // ConfigMap/Secret key refs are handled by environmentVariableDetector
    return [];
  },
};
