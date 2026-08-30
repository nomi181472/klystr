export type ScanStatus = 'not-analyzed' | 'requested' | 'queued' | 'pulling' | 'scanning' | 'processing' | 'completed' | 'completed-with-warnings' | 'failed';
export interface ImageUsage { pod: string; namespace: string; container: string; status?: string; node?: string; imageIdentity: string }
export interface ImageInventoryItem { id: string; image: string; shortName: string; registry: string; tag: string; namespaces: string[]; usages: ImageUsage[]; status: ScanStatus }
export type ImageVerificationState = 'loading' | 'verified' | 'unverified' | 'critical' | 'error';
export interface ImageVerification { imageId: string; state: ImageVerificationState; reason?: string }
export interface Vulnerability { id: string; severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN'; packageName: string; installedVersion: string; fixedVersion?: string; packageType: string; title: string; cvss?: number; reference?: string }
export interface ImageScanStep { id: string; label: string; status: 'running'|'completed'|'failed'; detail?: string; resource?: { kind: string; name: string; namespace: string } }
export interface ImageScanResources {
  constrained: boolean;
  requests?: { cpu: string; memory: string };
  limits?: { cpu: string; memory: string };
}
export interface ImageScan { id: string; imageId: string; image: string; status: ScanStatus; requestedAt: string; completedAt?: string; scanner: string; scannerVersion: string; cached?: boolean; error?: string; message?: string; resourceConfiguration?: ImageScanResources; vulnerabilities: Vulnerability[]; steps?: ImageScanStep[] }
