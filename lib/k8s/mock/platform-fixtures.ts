import type { K8sResource } from '@/lib/types';

const now = () => new Date().toISOString();
const base = (uid: string, kind: K8sResource['kind'], name: string, namespace: string | null, labels: Record<string, string> = {}): K8sResource => ({
  uid, kind, apiVersion: kind === 'Deployment' || kind === 'StatefulSet' || kind === 'ReplicaSet' ? 'apps/v1' : kind === 'Job' || kind === 'CronJob' ? 'batch/v1' : 'v1',
  name, namespace, labels, annotations: {}, discoveredAt: now(),
});

interface StackOptions {
  namespace: string;
  name: string;
  replicas?: number;
  port?: number;
  image: string;
  env?: { name: string; value?: string; valueFrom?: { configMapKeyRef?: { name: string; key: string }; secretKeyRef?: { name: string; key: string } }; fromSecret?: boolean }[];
  mounts?: { name: string; mountPath: string; configMapName?: string; secretName?: string; pvcName?: string }[];
  serviceType?: string;
}

function deploymentStack({ namespace, name, replicas = 3, port = 8080, image, env = [], mounts = [], serviceType }: StackOptions): K8sResource[] {
  const app = { app: name, 'platform.klystr.io/component': name, 'service-account': `${name}-sa` };
  const deployment = { ...base(`deploy-${namespace}-${name}`, 'Deployment', name, namespace, app), status: 'Available', containers: [{ name, image, ports: [{ name: 'http', port, protocol: 'TCP' }], envVars: env, volumeMounts: mounts }], raw: { spec: { template: { spec: { serviceAccountName: `${name}-sa` } } } } };
  const replicaSet = { ...base(`rs-${namespace}-${name}`, 'ReplicaSet', `${name}-7f8c9d`, namespace, app), status: 'Ready', ownerReferences: [{ kind: 'Deployment', name, uid: deployment.uid }] };
  const pods = Array.from({ length: replicas }, (_, index): K8sResource => ({
    ...base(`pod-${namespace}-${name}-${index}`, 'Pod', `${name}-7f8c9d-${index + 1}`, namespace, app), status: 'Running', podIP: `10.245.${Math.abs(namespace.length * 7) % 200}.${20 + index}`,
    nodeName: `worker-pool-${['a', 'b', 'c'][index % 3]}-01`, containers: [{ name, image, ports: [{ name: 'http', port, protocol: 'TCP' }], envVars: env, volumeMounts: mounts }],
    ownerReferences: [{ kind: 'ReplicaSet', name: replicaSet.name, uid: replicaSet.uid }], raw: { spec: { serviceAccountName: `${name}-sa` } },
  }));
  return [deployment, replicaSet, ...pods,
    { ...base(`svc-${namespace}-${name}`, 'Service', name, namespace, app), status: 'Active', clusterIP: serviceType === 'ExternalName' ? undefined : `10.97.${namespace.length}.${30 + name.length}`, serviceType, selector: { app: name }, ports: [{ name: 'http', port, targetPort: port, protocol: 'TCP' }] },
    { ...base(`sa-${namespace}-${name}`, 'ServiceAccount', `${name}-sa`, namespace, app), status: 'Active' },
    { ...base(`hpa-${namespace}-${name}`, 'HorizontalPodAutoscaler', `${name}-autoscaler`, namespace, app), apiVersion: 'autoscaling/v2', status: 'AbleToScale', raw: { spec: { scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name } } } },
    { ...base(`netpol-${namespace}-${name}`, 'NetworkPolicy', `${name}-policy`, namespace, app), apiVersion: 'networking.k8s.io/v1', status: 'Active', selector: { app: name } },
  ];
}

const namespaces = ['frontend', 'backend', 'gateway', 'ai-inference', 'computer-vision', 'data-engineering', 'cache', 'postgresql', 'streaming', 'edge-platform', 'scraping', 'model-training', 'background-jobs'];

const frontend = deploymentStack({ namespace: 'frontend', name: 'web-frontend', replicas: 4, port: 3000, image: 'ghcr.io/klystr/web-frontend:2.4.0', env: [
  { name: 'API_URL', value: 'http://api-gateway.gateway.svc.cluster.local:8080' }, { name: 'CDN_URL', value: 'https://assets.global-cdn.example.com' },
] });
const gateway = deploymentStack({ namespace: 'gateway', name: 'api-gateway', replicas: 4, port: 8080, image: 'envoyproxy/gateway:v1.2.0', serviceType: 'LoadBalancer', env: [
  { name: 'USER_API', value: 'http://user-api.backend.svc.cluster.local:8080' }, { name: 'ORDER_API', value: 'http://order-api.backend.svc.cluster.local:8080' },
  { name: 'LLM_API', value: 'http://llm-router.ai-inference.svc.cluster.local:8000' }, { name: 'CV_API', value: 'http://vision-api.computer-vision.svc.cluster.local:8000' },
] });
const backend = [
  ...deploymentStack({ namespace: 'backend', name: 'user-api', replicas: 3, image: 'ghcr.io/klystr/user-api:3.1.0', env: [{ name: 'DATABASE_URL', value: 'postgres://postgres-primary.postgresql.svc.cluster.local:5432/users' }, { name: 'CACHE_URL', value: 'redis://redis-primary.cache.svc.cluster.local:6379' }] }),
  ...deploymentStack({ namespace: 'backend', name: 'order-api', replicas: 3, image: 'ghcr.io/klystr/order-api:5.0.1', env: [{ name: 'USER_API', value: 'http://user-api.backend.svc.cluster.local:8080' }, { name: 'EVENTS', value: 'kafka://event-stream.streaming.svc.cluster.local:9092' }] }),
  ...deploymentStack({ namespace: 'backend', name: 'notification-api', replicas: 2, image: 'ghcr.io/klystr/notification-api:1.8.2', env: [{ name: 'EVENTS', value: 'kafka://event-stream.streaming.svc.cluster.local:9092' }, { name: 'PROVIDER', value: 'https://api.notifications.example.com' }] }),
];
const ai = deploymentStack({ namespace: 'ai-inference', name: 'llm-router', replicas: 3, port: 8000, image: 'ghcr.io/klystr/vllm-router:0.9.1', env: [
  { name: 'MODEL_REGISTRY', value: 'http://model-registry.model-training.svc.cluster.local:8080' }, { name: 'VECTOR_CACHE', value: 'redis://redis-replica.cache.svc.cluster.local:6379' },
], mounts: [{ name: 'model-config', mountPath: '/models/config', configMapName: 'llm-model-config' }, { name: 'model-token', mountPath: '/var/run/model', secretName: 'model-registry-token' }] });
const cv = deploymentStack({ namespace: 'computer-vision', name: 'vision-api', replicas: 4, port: 8000, image: 'ghcr.io/klystr/yolo-inference:8.3', env: [
  { name: 'FRAME_STREAM', value: 'kafka://video-events.streaming.svc.cluster.local:9092' }, { name: 'MODEL_REGISTRY', value: 'http://model-registry.model-training.svc.cluster.local:8080' },
] });
const data = [
  ...deploymentStack({ namespace: 'data-engineering', name: 'etl-orchestrator', replicas: 2, image: 'apache/airflow:2.10.4', env: [{ name: 'WAREHOUSE', value: 'postgres://postgres-replica.postgresql.svc.cluster.local:5432/warehouse' }, { name: 'EVENT_STREAM', value: 'kafka://event-stream.streaming.svc.cluster.local:9092' }] }),
  ...deploymentStack({ namespace: 'data-engineering', name: 'feature-pipeline', replicas: 3, image: 'apache/spark:3.5.3', env: [{ name: 'FEATURE_CACHE', value: 'redis://redis-primary.cache.svc.cluster.local:6379' }, { name: 'TRAINING_API', value: 'http://training-controller.model-training.svc.cluster.local:8080' }] }),
];

function statefulCluster(namespace: string, name: string, image: string, port: number, replicas: number, role: (i: number) => string): K8sResource[] {
  const labels = { app: name };
  const stateful = { ...base(`sts-${namespace}-${name}`, 'StatefulSet', name, namespace, labels), status: 'Ready', containers: [{ name, image, ports: [{ name, port, protocol: 'TCP' }], envVars: [], volumeMounts: [{ name: 'data', mountPath: '/data', pvcName: `${name}-data` }] }] };
  const pvc = { ...base(`pvc-${namespace}-${name}`, 'PersistentVolumeClaim', `${name}-data`, namespace, labels), status: 'Bound' };
  const pv = { ...base(`pv-${namespace}-${name}`, 'PersistentVolume', `pv-${name}-data`, null, { 'storage-class': 'distributed-ssd' }), status: 'Bound', raw: { spec: { storageClassName: 'distributed-ssd', claimRef: { name: pvc.name, namespace } } } };
  return [stateful,
    ...Array.from({ length: replicas }, (_, index): K8sResource => ({ ...base(`pod-${namespace}-${name}-${index}`, 'Pod', `${name}-${index}`, namespace, { ...labels, role: role(index) }), status: 'Running', nodeName: `stateful-pool-${(index % 3) + 1}`, containers: [{ name, image, ports: [{ name, port, protocol: 'TCP' }], envVars: [{ name: 'CLUSTER_ROLE', value: role(index) }], volumeMounts: [{ name: 'data', mountPath: '/data', pvcName: pvc.name }] }], ownerReferences: [{ kind: 'StatefulSet', name, uid: stateful.uid }] })),
    { ...base(`svc-${namespace}-${name}`, 'Service', name, namespace, labels), status: 'Active', clusterIP: 'None', selector: labels, ports: [{ name, port, targetPort: port, protocol: 'TCP' }] }, pvc, pv,
  ];
}

const cache = statefulCluster('cache', 'redis-primary', 'redis:7.4-alpine', 6379, 3, index => index === 0 ? 'master' : 'replica').concat(
  statefulCluster('cache', 'redis-replica', 'redis:7.4-alpine', 6379, 3, () => 'replica'),
);
const postgres = statefulCluster('postgresql', 'postgres-primary', 'bitnami/postgresql-repmgr:17', 5432, 3, index => index === 0 ? 'primary' : 'standby').concat(
  statefulCluster('postgresql', 'postgres-replica', 'bitnami/postgresql-repmgr:17', 5432, 3, () => 'read-replica'),
);
const streaming = statefulCluster('streaming', 'event-stream', 'bitnami/kafka:3.9', 9092, 3, () => 'broker').concat(
  ...deploymentStack({ namespace: 'streaming', name: 'video-events', replicas: 3, port: 9092, image: 'redpandadata/redpanda:v24.3.3' }),
);
const edge = deploymentStack({ namespace: 'edge-platform', name: 'cdn-origin', replicas: 5, port: 8080, image: 'nginx:1.27-alpine', env: [{ name: 'UPSTREAM', value: 'http://web-frontend.frontend.svc.cluster.local:3000' }, { name: 'PURGE_API', value: 'https://api.global-cdn.example.com/purge' }] });
const scraping = deploymentStack({ namespace: 'scraping', name: 'scraper-workers', replicas: 5, port: 8080, image: 'ghcr.io/klystr/scraper:2.2.0', env: [{ name: 'QUEUE', value: 'redis://redis-replica.cache.svc.cluster.local:6379' }, { name: 'RESULTS', value: 'kafka://event-stream.streaming.svc.cluster.local:9092' }, { name: 'TARGET', value: 'https://catalog.example.org' }] });
const training = [
  ...deploymentStack({ namespace: 'model-training', name: 'training-controller', replicas: 2, image: 'ghcr.io/klystr/training-controller:1.5.0', env: [{ name: 'FEATURE_PIPELINE', value: 'http://feature-pipeline.data-engineering.svc.cluster.local:8080' }, { name: 'REGISTRY', value: 'http://model-registry.model-training.svc.cluster.local:8080' }] }),
  ...deploymentStack({ namespace: 'model-training', name: 'model-registry', replicas: 2, image: 'ghcr.io/mlflow/mlflow:v2.19.0', env: [{ name: 'DATABASE_URL', value: 'postgres://postgres-primary.postgresql.svc.cluster.local:5432/mlflow' }] }),
  { ...base('job-model-retraining', 'Job', 'weekly-model-retraining-1042', 'model-training', { app: 'model-retraining' }), status: 'Running', containers: [{ name: 'trainer', image: 'ghcr.io/klystr/model-trainer:cuda12', ports: [], envVars: [{ name: 'FEATURE_PIPELINE', value: 'http://feature-pipeline.data-engineering.svc.cluster.local:8080' }, { name: 'REGISTRY', value: 'http://model-registry.model-training.svc.cluster.local:8080' }], volumeMounts: [] }], ownerReferences: [{ kind: 'CronJob', name: 'weekly-model-retraining', uid: 'cron-model-retraining' }] },
  { ...base('cron-model-retraining', 'CronJob', 'weekly-model-retraining', 'model-training', { app: 'model-retraining' }), status: 'Active', containers: [{ name: 'trainer', image: 'ghcr.io/klystr/model-trainer:cuda12', ports: [], envVars: [], volumeMounts: [] }] },
];
const jobs = [
  { ...base('deploy-background-worker', 'Deployment', 'background-worker', 'background-jobs', { app: 'background-worker' }), status: 'Available', containers: [{ name: 'worker', image: 'ghcr.io/klystr/background-worker:3.0.0', ports: [], envVars: [{ name: 'QUEUE', value: 'redis://redis-primary.cache.svc.cluster.local:6379' }, { name: 'EVENTS', value: 'kafka://event-stream.streaming.svc.cluster.local:9092' }], volumeMounts: [] }] },
  { ...base('cron-reporting', 'CronJob', 'nightly-reporting', 'background-jobs', { app: 'reporting' }), status: 'Active', containers: [{ name: 'report', image: 'ghcr.io/klystr/reporting-job:1.4.0', ports: [], envVars: [{ name: 'DATABASE_URL', value: 'postgres://postgres-replica.postgresql.svc.cluster.local:5432/analytics' }], volumeMounts: [] }] },
  { ...base('job-reporting', 'Job', 'nightly-reporting-1042', 'background-jobs', { app: 'reporting' }), status: 'Complete', containers: [{ name: 'report', image: 'ghcr.io/klystr/reporting-job:1.4.0', ports: [], envVars: [], volumeMounts: [] }], ownerReferences: [{ kind: 'CronJob', name: 'nightly-reporting', uid: 'cron-reporting' }] },
];

export const EXPANDED_PLATFORM_MOCK_RESOURCES: K8sResource[] = [
  ...namespaces.map(name => ({ ...base(`ns-${name}`, 'Namespace', name, null, { 'platform.klystr.io/domain': name }), status: 'Active' })),
  ...frontend, ...gateway, ...backend, ...ai, ...cv, ...data, ...cache, ...postgres, ...streaming, ...edge, ...scraping, ...training, ...jobs,
  { ...base('ing-gateway-platform', 'Ingress', 'platform-ingress', 'gateway', { app: 'api-gateway' }), apiVersion: 'networking.k8s.io/v1', status: 'Ready' },
  { ...base('cm-ai-model', 'ConfigMap', 'llm-model-config', 'ai-inference'), status: 'Active' },
  { ...base('secret-ai-model', 'Secret', 'model-registry-token', 'ai-inference'), status: 'Active' },
  { ...base('sc-distributed-ssd', 'StorageClass', 'distributed-ssd', null, { tier: 'fast' }), apiVersion: 'storage.k8s.io/v1', status: 'Active' },
];
