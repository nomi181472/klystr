import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

/** Detects StorageClass → PV (storage-association) and PV ↔ PVC (storage-binding) */
export const storageDetector: Detector = {
  name: 'StorageDetector',
  detect(resource: K8sResource, allResources: K8sResource[]): DependencyCandidate[] {
    const candidates: DependencyCandidate[] = [];

    // 1. StorageClass → PV (Storage Association)
    if (resource.kind === 'StorageClass') {
      const pvs = allResources.filter(r => r.kind === 'PersistentVolume');
      for (const pv of pvs) {
        const scName = (pv.raw?.spec as { storageClassName?: string })?.storageClassName ?? pv.annotations?.['volume.beta.kubernetes.io/storage-class'];
        if (scName === resource.name || pv.labels?.['storage-class'] === resource.name) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: pv.name,
            detector: 'StorageDetector',
            edgeKind: 'communication',
            relationshipCategory: 'storage-association',
            rawEvidence: `StorageClass ${resource.name} associated with PV ${pv.name}`,
          });
        }
      }
    }

    // 2. PV ↔ PVC (Storage Binding)
    if (resource.kind === 'PersistentVolume') {
      const claimRef = (resource.raw?.spec as { claimRef?: { name: string; namespace?: string } })?.claimRef;
      if (claimRef) {
        const pvc = allResources.find(
          r => r.kind === 'PersistentVolumeClaim' && r.name === claimRef.name && (r.namespace === claimRef.namespace || !claimRef.namespace)
        );
        if (pvc) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: pvc.name,
            detector: 'StorageDetector',
            edgeKind: 'communication',
            relationshipCategory: 'storage-binding',
            rawEvidence: `PV ${resource.name} bound to PVC ${pvc.name}`,
          });
        }
      }
    }

    return candidates;
  },
};
