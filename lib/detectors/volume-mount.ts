import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

/** Detects deps from volume mounts referencing ConfigMaps, Secrets, and PVCs */
export const volumeMountDetector: Detector = {
  name: 'VolumeMountDetector',
  detect(resource: K8sResource): DependencyCandidate[] {
    const candidates: DependencyCandidate[] = [];
    const containers = resource.containers ?? [];

    for (const container of containers) {
      for (const vm of container.volumeMounts) {
        if (vm.configMapName) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: vm.configMapName,
            detector: 'VolumeMountDetector',
            edgeKind: 'communication',
            rawEvidence: `volumeMount ${vm.name} → configMap: ${vm.configMapName} at ${vm.mountPath}`,
          });
        }
        if (vm.secretName) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: vm.secretName,
            detector: 'VolumeMountDetector',
            edgeKind: 'communication',
            fromSecret: true,
            rawEvidence: `volumeMount ${vm.name} → secret: ${vm.secretName} at ${vm.mountPath}`,
          });
        }
        if (vm.pvcName) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: vm.pvcName,
            detector: 'VolumeMountDetector',
            edgeKind: 'communication',
            rawEvidence: `volumeMount ${vm.name} → PVC: ${vm.pvcName} at ${vm.mountPath}`,
          });
        }
      }
    }

    return candidates;
  },
};
