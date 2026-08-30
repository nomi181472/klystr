import {
  Box,
  CircleDot,
  Cloud,
  Cog,
  Container,
  Database,
  FileKey,
  Globe,
  HardDrive,
  Layers,
  Lock,
  Network,
  Repeat,
  Server,
  Shield,
  Timer,
  type LucideIcon,
} from 'lucide-react';

export type K8sKind =
  | 'Namespace'
  | 'Pod'
  | 'Deployment'
  | 'StatefulSet'
  | 'DaemonSet'
  | 'ReplicaSet'
  | 'Job'
  | 'CronJob'
  | 'Service'
  | 'Endpoints'
  | 'EndpointSlice'
  | 'Ingress'
  | 'ConfigMap'
  | 'Secret'
  | 'ServiceAccount'
  | 'PersistentVolumeClaim'
  | 'PersistentVolume'
  | 'StorageClass'
  | 'NetworkPolicy'
  | 'HorizontalPodAutoscaler'
  | 'External';

export interface ResourceTypeConfig {
  kind: K8sKind;
  label: string;
  shortLabel: string;
  color: string;           // Primary color for the node
  bgColor: string;         // Background fill (low opacity variant)
  borderColor: string;     // Border color
  textColor: string;       // Text on the node
  icon: LucideIcon;
  shape: 'rectangle' | 'rounded' | 'diamond' | 'hexagon';
  category: 'workload' | 'network' | 'config' | 'storage' | 'security' | 'external';
  discoverable: boolean;   // Whether to discover from K8s API
  defaultVisible: boolean; // Whether to show by default in graph
}

/** Semantic graph colors resolve to the palette in app/theme.css. */
function resourceColors(token: string) {
  const color = `var(--resource-${token})`;

  return {
    color,
    bgColor: `color-mix(in oklch, ${color} 12%, transparent)`,
    borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
    textColor: `color-mix(in oklch, ${color} 65%, var(--foreground))`,
  };
}

export const RESOURCE_TYPE_CONFIG: Record<K8sKind, ResourceTypeConfig> = {
  Namespace: {
    kind: 'Namespace',
    label: 'Namespace',
    shortLabel: 'NS',
    ...resourceColors('namespace'),
    icon: Layers,
    shape: 'rectangle',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  Pod: {
    kind: 'Pod',
    label: 'Pod',
    shortLabel: 'Po',
    ...resourceColors('pod'),
    icon: Container,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: true,
  },
  Deployment: {
    kind: 'Deployment',
    label: 'Deployment',
    shortLabel: 'Deploy',
    ...resourceColors('deployment'),
    icon: Server,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  StatefulSet: {
    kind: 'StatefulSet',
    label: 'StatefulSet',
    shortLabel: 'STS',
    ...resourceColors('statefulset'),
    icon: Database,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  DaemonSet: {
    kind: 'DaemonSet',
    label: 'DaemonSet',
    shortLabel: 'DS',
    ...resourceColors('daemonset'),
    icon: CircleDot,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  ReplicaSet: {
    kind: 'ReplicaSet',
    label: 'ReplicaSet',
    shortLabel: 'RS',
    ...resourceColors('replicaset'),
    icon: Repeat,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  Job: {
    kind: 'Job',
    label: 'Job',
    shortLabel: 'Job',
    ...resourceColors('job'),
    icon: Cog,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  CronJob: {
    kind: 'CronJob',
    label: 'CronJob',
    shortLabel: 'CJ',
    ...resourceColors('cronjob'),
    icon: Timer,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  Service: {
    kind: 'Service',
    label: 'Service',
    shortLabel: 'Svc',
    ...resourceColors('service'),
    icon: Network,
    shape: 'rounded',
    category: 'network',
    discoverable: true,
    defaultVisible: true,
  },
  Endpoints: {
    kind: 'Endpoints',
    label: 'Endpoints',
    shortLabel: 'EP',
    ...resourceColors('endpoint'),
    icon: CircleDot,
    shape: 'rounded',
    category: 'network',
    discoverable: true,
    defaultVisible: false,
  },
  EndpointSlice: {
    kind: 'EndpointSlice',
    label: 'EndpointSlice',
    shortLabel: 'EPS',
    ...resourceColors('endpoint'),
    icon: CircleDot,
    shape: 'rounded',
    category: 'network',
    discoverable: true,
    defaultVisible: false,
  },
  Ingress: {
    kind: 'Ingress',
    label: 'Ingress',
    shortLabel: 'Ing',
    ...resourceColors('ingress'),
    icon: Cloud,
    shape: 'rounded',
    category: 'network',
    discoverable: true,
    defaultVisible: true,
  },
  ConfigMap: {
    kind: 'ConfigMap',
    label: 'ConfigMap',
    shortLabel: 'CM',
    ...resourceColors('configmap'),
    icon: FileKey,
    shape: 'rounded',
    category: 'config',
    discoverable: true,
    defaultVisible: false,
  },
  Secret: {
    kind: 'Secret',
    label: 'Secret',
    shortLabel: 'Sec',
    ...resourceColors('secret'),
    icon: Lock,
    shape: 'rounded',
    category: 'config',
    discoverable: true,
    defaultVisible: false,
  },
  ServiceAccount: {
    kind: 'ServiceAccount',
    label: 'ServiceAccount',
    shortLabel: 'SA',
    ...resourceColors('serviceaccount'),
    icon: Shield,
    shape: 'rounded',
    category: 'security',
    discoverable: true,
    defaultVisible: false,
  },
  PersistentVolumeClaim: {
    kind: 'PersistentVolumeClaim',
    label: 'PersistentVolumeClaim',
    shortLabel: 'PVC',
    ...resourceColors('pvc'),
    icon: HardDrive,
    shape: 'rounded',
    category: 'storage',
    discoverable: true,
    defaultVisible: false,
  },
  PersistentVolume: {
    kind: 'PersistentVolume',
    label: 'PersistentVolume',
    shortLabel: 'PV',
    ...resourceColors('pv'),
    icon: HardDrive,
    shape: 'rounded',
    category: 'storage',
    discoverable: true,
    defaultVisible: false,
  },
  StorageClass: {
    kind: 'StorageClass',
    label: 'StorageClass',
    shortLabel: 'SC',
    ...resourceColors('storageclass'),
    icon: Box,
    shape: 'rounded',
    category: 'storage',
    discoverable: true,
    defaultVisible: false,
  },
  NetworkPolicy: {
    kind: 'NetworkPolicy',
    label: 'NetworkPolicy',
    shortLabel: 'NetPol',
    ...resourceColors('networkpolicy'),
    icon: Shield,
    shape: 'diamond',
    category: 'security',
    discoverable: true,
    defaultVisible: false,
  },
  HorizontalPodAutoscaler: {
    kind: 'HorizontalPodAutoscaler',
    label: 'HorizontalPodAutoscaler',
    shortLabel: 'HPA',
    ...resourceColors('hpa'),
    icon: Cog,
    shape: 'rounded',
    category: 'workload',
    discoverable: true,
    defaultVisible: false,
  },
  External: {
    kind: 'External',
    label: 'External',
    shortLabel: 'Ext',
    ...resourceColors('external'),
    icon: Globe,
    shape: 'rounded',
    category: 'external',
    discoverable: false,
    defaultVisible: false,
  },
};

export function getResourceConfig(kind: string): ResourceTypeConfig {
  return (
    RESOURCE_TYPE_CONFIG[kind as K8sKind] ??
    RESOURCE_TYPE_CONFIG.External
  );
}

export const RESOURCE_CATEGORIES = {
  workload: { label: 'Workloads', kinds: ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'HorizontalPodAutoscaler'] },
  network: { label: 'Networking', kinds: ['Service', 'Endpoints', 'EndpointSlice', 'Ingress'] },
  config: { label: 'Configuration', kinds: ['ConfigMap', 'Secret'] },
  storage: { label: 'Storage', kinds: ['PersistentVolumeClaim', 'PersistentVolume', 'StorageClass'] },
  security: { label: 'Security', kinds: ['ServiceAccount', 'NetworkPolicy'] },
  external: { label: 'External', kinds: ['External'] },
} as const;
