import type { K8sResource, PodMetricsResponse } from '@/lib/types';
import { EXPANDED_PLATFORM_MOCK_RESOURCES } from './platform-fixtures';

export const MOCK_TOPOLOGY_NODES = [
  { name: 'control-plane-01', role: 'control-plane' as const, status: 'Ready' },
  { name: 'worker-pool-a-01', role: 'worker' as const, status: 'Ready' },
  { name: 'worker-pool-b-01', role: 'worker' as const, status: 'Ready' },
  { name: 'worker-pool-c-01', role: 'worker' as const, status: 'Ready' },
  { name: 'stateful-pool-01', role: 'worker' as const, status: 'Ready' },
];

const ts = () => new Date().toISOString();

/** Deterministic sample output matching `kubectl top pods -A` for demo mode. */
export const MOCK_POD_METRICS = {
  available: true,
  metrics: {
    'default/api-gateway-6d8f9b7c5-abc12': {
      cpu: '42m', memory: '128Mi',
      containers: {
        'api-gateway': { cpu: '35m', memory: '101Mi' },
        'mesh-proxy': { cpu: '7m', memory: '27Mi' },
      },
    },
    'default/api-gateway-6d8f9b7c5-def34': { cpu: '38m', memory: '121Mi' },
    'default/user-service-7f4b8c9d2-xyz34': { cpu: '27m', memory: '96Mi' },
    'default/user-service-7f4b8c9d2-qwe78': { cpu: '31m', memory: '101Mi' },
    'default/order-service-69c6d75c8-r4t5y': {
      cpu: '36m', memory: '112Mi',
      containers: {
        'order-service': { cpu: '30m', memory: '84Mi' },
        'telemetry-sidecar': { cpu: '6m', memory: '28Mi' },
      },
    },
    'database/postgres-0': { cpu: '68m', memory: '256Mi' },
    'database/redis-7c8b9d6f5-x1r2d': { cpu: '11m', memory: '48Mi' },
    'database/redis-7c8b9d6f5-z9y8x': { cpu: '13m', memory: '52Mi' },
    'database/mongo-0': { cpu: '54m', memory: '238Mi' },
    'database/kafka-0': { cpu: '83m', memory: '384Mi' },
    'monitoring/prometheus-6b77d9c8f-p8q2w': {
      cpu: '76m', memory: '310Mi',
      containers: {
        prometheus: { cpu: '69m', memory: '282Mi' },
        'config-reloader': { cpu: '7m', memory: '28Mi' },
      },
    },
    'monitoring/grafana-7f6db8c56-v2m4n': { cpu: '29m', memory: '144Mi' },
    'monitoring/node-exporter-a1': { cpu: '7m', memory: '31Mi' },
    'monitoring/node-exporter-b1': { cpu: '8m', memory: '33Mi' },
    'monitoring/node-exporter-c1': { cpu: '6m', memory: '30Mi' },
    'payments/checkout-6f59bc8d7-k2p4s': {
      cpu: '45m', memory: '132Mi',
      containers: { checkout: { cpu: '45m', memory: '132Mi' } },
    },
    'payments/checkout-6f59bc8d7-m8n6q': { cpu: '41m', memory: '127Mi' },
  },
} satisfies PodMetricsResponse;

export const MOCK_RESOURCES: K8sResource[] = [
  // ─── Namespace: default ──────────────────────────────────────
  { uid: 'ns-default', kind: 'Namespace', apiVersion: 'v1', name: 'default', namespace: null, labels: {}, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'ns-database', kind: 'Namespace', apiVersion: 'v1', name: 'database', namespace: null, labels: {}, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'ns-api', kind: 'Namespace', apiVersion: 'v1', name: 'api', namespace: null, labels: {}, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'ns-monitoring', kind: 'Namespace', apiVersion: 'v1', name: 'monitoring', namespace: null, labels: {}, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'ns-payments', kind: 'Namespace', apiVersion: 'v1', name: 'payments', namespace: null, labels: { team: 'payments' }, annotations: {}, status: 'Active', discoveredAt: ts() },

  // ─── api: API Gateway & Auth ─────────────────────────────
  {
    uid: 'deploy-api-gateway-api', kind: 'Deployment', apiVersion: 'apps/v1', name: 'api-gateway', namespace: 'api',
    labels: { app: 'api-gateway', tier: 'frontend' }, annotations: {},
    status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'api-gateway', image: 'myregistry/api-gateway:v2.3.1',
      ports: [{ port: 8080, protocol: 'TCP', name: 'http' }],
      envVars: [
        { name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' },
        { name: 'POSTGRES_URL', value: 'postgres://postgres.database.svc.cluster.local:5432/users' },
      ],
      volumeMounts: [],
    }],
  },
  {
    uid: 'rs-api-gateway-api', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'api-gateway-7f8b9c', namespace: 'api',
    labels: { app: 'api-gateway' }, annotations: {},
    ownerReferences: [{ kind: 'Deployment', name: 'api-gateway', uid: 'deploy-api-gateway-api' }],
    discoveredAt: ts(),
  },
  {
    uid: 'pod-api-gateway-api-1', kind: 'Pod', apiVersion: 'v1', name: 'api-gateway-7f8b9c-abc12', namespace: 'api',
    labels: { app: 'api-gateway', language: 'javascript' }, annotations: {}, status: 'Running', podIP: '10.244.1.88', nodeName: 'worker-pool-a-01',
    envVars: [{ name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' }],
    containers: [{
      name: 'api-gateway', image: 'node:22-alpine', type: 'app', ports: [{ port: 8080, protocol: 'TCP', name: 'http' }],
      envVars: [{ name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' }], volumeMounts: [],
    }],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'api-gateway-7f8b9c', uid: 'rs-api-gateway-api' }],
    discoveredAt: ts(),
  },
  {
    uid: 'svc-api-gateway-api', kind: 'Service', apiVersion: 'v1', name: 'api-gateway', namespace: 'api',
    labels: { app: 'api-gateway' }, annotations: {},
    clusterIP: '10.96.4.10', serviceType: 'LoadBalancer', ports: [{ port: 80, protocol: 'TCP', targetPort: 8080, name: 'http' }],
    selector: { app: 'api-gateway' }, discoveredAt: ts(),
  },
  {
    uid: 'ing-api-gateway-api', kind: 'Ingress', apiVersion: 'networking.k8s.io/v1', name: 'api-ingress', namespace: 'api',
    labels: {}, annotations: { 'kubernetes.io/ingress.class': 'nginx' },
    discoveredAt: ts(),
  },
  {
    uid: 'deploy-auth-service', kind: 'Deployment', apiVersion: 'apps/v1', name: 'auth-service', namespace: 'api',
    labels: { app: 'auth-service', tier: 'auth' }, annotations: {},
    status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'auth-service', image: 'myregistry/auth-service:v1.2.0',
      ports: [{ port: 4000, protocol: 'TCP', name: 'http' }],
      envVars: [
        { name: 'POSTGRES_HOST', value: 'postgres.database.svc.cluster.local' },
      ],
      volumeMounts: [],
    }],
  },
  {
    uid: 'pod-auth-service-1', kind: 'Pod', apiVersion: 'v1', name: 'auth-service-6d5c4b-xyz89', namespace: 'api',
    labels: { app: 'auth-service', language: 'go' }, annotations: {}, status: 'Running', podIP: '10.244.2.99', nodeName: 'worker-pool-b-01',
    envVars: [{ name: 'POSTGRES_HOST', value: 'postgres.database.svc.cluster.local' }],
    containers: [{
      name: 'auth-service', image: 'golang:1.22-alpine', type: 'app', ports: [{ port: 4000, protocol: 'TCP', name: 'http' }],
      envVars: [{ name: 'POSTGRES_HOST', value: 'postgres.database.svc.cluster.local' }], volumeMounts: [],
    }],
    ownerReferences: [{ kind: 'Deployment', name: 'auth-service', uid: 'deploy-auth-service' }],
    discoveredAt: ts(),
  },
  {
    uid: 'svc-auth-service', kind: 'Service', apiVersion: 'v1', name: 'auth-service', namespace: 'api',
    labels: { app: 'auth-service' }, annotations: {},
    clusterIP: '10.96.4.20', ports: [{ port: 4000, protocol: 'TCP', targetPort: 4000, name: 'http' }],
    selector: { app: 'auth-service' }, discoveredAt: ts(),
  },

  // ─── default: API Gateway ───────────────────────────────────
  {
    uid: 'deploy-api-gateway', kind: 'Deployment', apiVersion: 'apps/v1', name: 'api-gateway', namespace: 'default',
    labels: { app: 'api-gateway', tier: 'frontend' }, annotations: {},
    status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'api-gateway', image: 'myregistry/api-gateway:v2.3.1',
      ports: [{ port: 8080, protocol: 'TCP', name: 'http' }],
      envVars: [
        { name: 'USER_SERVICE_URL', value: 'http://user-service.default.svc.cluster.local:3000' },
        { name: 'ORDER_SERVICE_URL', value: 'http://order-service.default.svc.cluster.local:3001' },
        { name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' },
        { name: 'JWT_SECRET', valueFrom: { secretKeyRef: { name: 'api-secrets', key: 'jwt-secret' } }, fromSecret: true },
        { name: 'LOG_LEVEL', valueFrom: { configMapKeyRef: { name: 'app-config', key: 'log-level' } } },
      ],
      volumeMounts: [],
    }],
  },
  {
    uid: 'rs-api-gateway', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'api-gateway-6d8f9b7c5', namespace: 'default',
    labels: { app: 'api-gateway' }, annotations: {},
    ownerReferences: [{ kind: 'Deployment', name: 'api-gateway', uid: 'deploy-api-gateway' }],
    discoveredAt: ts(),
  },
  {
    uid: 'pod-api-gateway-1', kind: 'Pod', apiVersion: 'v1', name: 'api-gateway-6d8f9b7c5-abc12', namespace: 'default',
    labels: { app: 'api-gateway', language: 'javascript' }, annotations: {}, status: 'Running', podIP: '10.244.1.15', nodeName: 'worker-pool-a-01',
    envVars: [{ name: 'RUNTIME', value: 'nodejs' }, { name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' }],
    containers: [
      {
        name: 'api-gateway', image: 'node:22-alpine', type: 'app', ports: [{ port: 8080, protocol: 'TCP', name: 'http' }],
        envVars: [{ name: 'RUNTIME', value: 'nodejs' }, { name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' }], volumeMounts: [],
      },
      {
        name: 'mesh-proxy', image: 'envoyproxy/envoy:v1.31', type: 'sidecar', ports: [{ port: 15001, protocol: 'TCP', name: 'proxy' }],
        envVars: [], volumeMounts: [],
      },
    ],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'api-gateway-6d8f9b7c5', uid: 'rs-api-gateway' }],
    discoveredAt: ts(),
  },
  {
    uid: 'pod-api-gateway-2', kind: 'Pod', apiVersion: 'v1', name: 'api-gateway-6d8f9b7c5-def34', namespace: 'default',
    labels: { app: 'api-gateway', language: 'javascript' }, annotations: {}, status: 'Running', podIP: '10.244.2.15', nodeName: 'worker-pool-b-01',
    envVars: [{ name: 'RUNTIME', value: 'nodejs' }, { name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' }],
    containers: [{ name: 'api-gateway', image: 'node:22-alpine', ports: [{ port: 8080, protocol: 'TCP', name: 'http' }], envVars: [{ name: 'RUNTIME', value: 'nodejs' }, { name: 'REDIS_URL', value: 'redis://redis.database.svc.cluster.local:6379/0' }], volumeMounts: [] }],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'api-gateway-6d8f9b7c5', uid: 'rs-api-gateway' }], discoveredAt: ts(),
  },
  {
    uid: 'pod-api-gateway-3', kind: 'Pod', apiVersion: 'v1', name: 'api-gateway-6d8f9b7c5-ghi56', namespace: 'default',
    labels: { app: 'api-gateway', language: 'javascript' }, annotations: {}, status: 'Pending',
    envVars: [{ name: 'RUNTIME', value: 'nodejs' }],
    containers: [{ name: 'api-gateway', image: 'node:22-alpine', ports: [{ port: 8080, protocol: 'TCP', name: 'http' }], envVars: [{ name: 'RUNTIME', value: 'nodejs' }], volumeMounts: [] }],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'api-gateway-6d8f9b7c5', uid: 'rs-api-gateway' }], discoveredAt: ts(),
  },
  {
    uid: 'svc-api-gateway', kind: 'Service', apiVersion: 'v1', name: 'api-gateway', namespace: 'default',
    labels: { app: 'api-gateway' }, annotations: {},
    clusterIP: '10.96.0.10', serviceType: 'LoadBalancer', ports: [{ port: 80, protocol: 'TCP', targetPort: 8080, name: 'http' }],
    selector: { app: 'api-gateway' }, discoveredAt: ts(),
  },

  // ─── default: User Service ──────────────────────────────────
  {
    uid: 'deploy-user-service', kind: 'Deployment', apiVersion: 'apps/v1', name: 'user-service', namespace: 'default',
    labels: { app: 'user-service', tier: 'backend' }, annotations: {}, status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'user-service', image: 'myregistry/user-service:v1.8.0',
      ports: [{ port: 3000, protocol: 'TCP', name: 'http' }],
      envVars: [
        { name: 'DATABASE_URL', valueFrom: { secretKeyRef: { name: 'user-db-credentials', key: 'connection-string' } }, fromSecret: true },
        { name: 'POSTGRES_HOST', value: 'postgres.database.svc.cluster.local' },
        { name: 'POSTGRES_PORT', value: '5432' },
        { name: 'REDIS_HOST', value: 'redis.database.svc.cluster.local' },
        { name: 'REDIS_PORT', value: '6379' },
        { name: 'KAFKA_BROKERS', value: 'kafka-0.kafka-headless.database.svc.cluster.local:9092,kafka-1.kafka-headless.database.svc.cluster.local:9092' },
        { name: 'STRIPE_API_KEY', valueFrom: { secretKeyRef: { name: 'payment-secrets', key: 'stripe-key' } }, fromSecret: true },
      ],
      volumeMounts: [{ name: 'config-vol', mountPath: '/etc/config', configMapName: 'app-config' }],
    }],
  },
  {
    uid: 'pod-user-service-1', kind: 'Pod', apiVersion: 'v1', name: 'user-service-7f4b8c9d2-xyz34', namespace: 'default',
    labels: { app: 'user-service' }, annotations: {}, status: 'Running', podIP: '10.244.1.20', nodeName: 'worker-pool-a-01',
    envVars: [{ name: 'LANGUAGE', value: 'python' }],
    containers: [{
      name: 'user-service', image: 'python:3.13-slim', ports: [{ port: 3000, protocol: 'TCP', name: 'http' }],
      envVars: [{ name: 'LANGUAGE', value: 'python' }], volumeMounts: [], command: ['uvicorn'],
    }],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'user-service-7f4b8c9d2', uid: 'rs-user-service' }],
    discoveredAt: ts(),
  },
  {
    uid: 'pod-user-service-2', kind: 'Pod', apiVersion: 'v1', name: 'user-service-7f4b8c9d2-qwe78', namespace: 'default',
    labels: { app: 'user-service' }, annotations: {}, status: 'Running', podIP: '10.244.2.20', nodeName: 'worker-pool-b-01',
    envVars: [{ name: 'LANGUAGE', value: 'python' }],
    containers: [{ name: 'user-service', image: 'python:3.13-slim', ports: [{ port: 3000, protocol: 'TCP', name: 'http' }], envVars: [{ name: 'LANGUAGE', value: 'python' }], volumeMounts: [], command: ['uvicorn'] }],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'user-service-7f4b8c9d2', uid: 'rs-user-service' }], discoveredAt: ts(),
  },
  {
    uid: 'svc-user-service', kind: 'Service', apiVersion: 'v1', name: 'user-service', namespace: 'default',
    labels: { app: 'user-service' }, annotations: {},
    clusterIP: '10.96.0.20', ports: [{ port: 3000, protocol: 'TCP', targetPort: 3000, name: 'http' }],
    selector: { app: 'user-service' }, discoveredAt: ts(),
  },

  // ─── default: Order Service ─────────────────────────────────
  {
    uid: 'deploy-order-service', kind: 'Deployment', apiVersion: 'apps/v1', name: 'order-service', namespace: 'default',
    labels: { app: 'order-service', tier: 'backend' }, annotations: {}, status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'order-service', image: 'myregistry/order-service:v2.1.0',
      ports: [{ port: 3001, protocol: 'TCP', name: 'http' }],
      envVars: [
        { name: 'MONGO_URI', value: 'mongodb://mongo.database.svc.cluster.local:27017/orders' },
        { name: 'KAFKA_BROKERS', value: 'kafka-0.kafka-headless.database.svc.cluster.local:9092' },
        { name: 'USER_SERVICE_URL', value: 'http://user-service.default.svc.cluster.local:3000' },
        { name: 'NOTIFICATION_URL', value: 'https://hooks.slack.com/services/T00000/B00000/XXXX' },
      ],
      volumeMounts: [],
    }],
  },
  {
    uid: 'svc-order-service', kind: 'Service', apiVersion: 'v1', name: 'order-service', namespace: 'default',
    labels: { app: 'order-service' }, annotations: {},
    clusterIP: '10.96.0.30', ports: [{ port: 3001, protocol: 'TCP', targetPort: 3001, name: 'http' }],
    selector: { app: 'order-service' }, discoveredAt: ts(),
  },

  // ─── default: Ingress ───────────────────────────────────────
  {
    uid: 'ing-main', kind: 'Ingress', apiVersion: 'networking.k8s.io/v1', name: 'main-ingress', namespace: 'default',
    labels: {}, annotations: { 'kubernetes.io/ingress.class': 'nginx' },
    discoveredAt: ts(),
  },

  // ─── default: ConfigMaps & Secrets ──────────────────────────
  {
    uid: 'cm-app-config', kind: 'ConfigMap', apiVersion: 'v1', name: 'app-config', namespace: 'default',
    labels: {}, annotations: {}, discoveredAt: ts(),
  },
  {
    uid: 'sec-api-secrets', kind: 'Secret', apiVersion: 'v1', name: 'api-secrets', namespace: 'default',
    labels: {}, annotations: {}, discoveredAt: ts(),
  },
  {
    uid: 'sec-user-db', kind: 'Secret', apiVersion: 'v1', name: 'user-db-credentials', namespace: 'default',
    labels: {}, annotations: {}, discoveredAt: ts(),
  },
  {
    uid: 'sec-payment', kind: 'Secret', apiVersion: 'v1', name: 'payment-secrets', namespace: 'default',
    labels: {}, annotations: {}, discoveredAt: ts(),
  },

  // ─── database: PostgreSQL ───────────────────────────────────
  {
    uid: 'sts-postgres', kind: 'StatefulSet', apiVersion: 'apps/v1', name: 'postgres', namespace: 'database',
    labels: { app: 'postgres' }, annotations: {}, status: 'Ready', discoveredAt: ts(),
    containers: [{
      name: 'postgres', image: 'postgres:15-alpine',
      ports: [{ port: 5432, protocol: 'TCP', name: 'postgres' }],
      envVars: [
        { name: 'POSTGRES_DB', value: 'users' },
        { name: 'POSTGRES_PASSWORD', valueFrom: { secretKeyRef: { name: 'postgres-credentials', key: 'password' } }, fromSecret: true },
      ],
      volumeMounts: [{ name: 'data', mountPath: '/var/lib/postgresql/data', pvcName: 'postgres-data' }],
    }],
  },
  {
    uid: 'pod-postgres-0', kind: 'Pod', apiVersion: 'v1', name: 'postgres-0', namespace: 'database',
    labels: { app: 'postgres', database: 'postgresql' }, annotations: {}, status: 'Running', podIP: '10.244.2.10', nodeName: 'stateful-pool-01',
    envVars: [{ name: 'DATABASE', value: 'postgresql' }],
    containers: [{
      name: 'postgres', image: 'postgres:15-alpine', ports: [{ port: 5432, protocol: 'TCP', name: 'postgres' }],
      envVars: [{ name: 'DATABASE', value: 'postgresql' }], volumeMounts: [{ name: 'data', mountPath: '/var/lib/postgresql/data', pvcName: 'postgres-data' }],
    }],
    ownerReferences: [{ kind: 'StatefulSet', name: 'postgres', uid: 'sts-postgres' }], discoveredAt: ts(),
  },
  {
    uid: 'svc-postgres', kind: 'Service', apiVersion: 'v1', name: 'postgres', namespace: 'database',
    labels: { app: 'postgres' }, annotations: {},
    clusterIP: '10.96.1.10', ports: [{ port: 5432, protocol: 'TCP', targetPort: 5432, name: 'postgres' }],
    selector: { app: 'postgres' }, discoveredAt: ts(),
  },
  {
    uid: 'pvc-postgres', kind: 'PersistentVolumeClaim', apiVersion: 'v1', name: 'postgres-data', namespace: 'database',
    labels: { app: 'postgres' }, annotations: {}, status: 'Bound', discoveredAt: ts(),
  },

  // ─── database: Redis ────────────────────────────────────────
  {
    uid: 'deploy-redis', kind: 'Deployment', apiVersion: 'apps/v1', name: 'redis', namespace: 'database',
    labels: { app: 'redis' }, annotations: {}, status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'redis', image: 'redis:7-alpine',
      ports: [{ port: 6379, protocol: 'TCP', name: 'redis' }],
      envVars: [],
      volumeMounts: [],
    }],
  },
  {
    uid: 'pod-redis-1', kind: 'Pod', apiVersion: 'v1', name: 'redis-7c8b9d6f5-x1r2d', namespace: 'database',
    labels: { app: 'redis', database: 'redis' }, annotations: {}, status: 'Running', podIP: '10.244.2.20', nodeName: 'worker-pool-b-01',
    containers: [{ name: 'redis', image: 'redis:7-alpine', ports: [{ port: 6379, protocol: 'TCP', name: 'redis' }], envVars: [], volumeMounts: [] }],
    ownerReferences: [{ kind: 'Deployment', name: 'redis', uid: 'deploy-redis' }], discoveredAt: ts(),
  },
  {
    uid: 'pod-redis-2', kind: 'Pod', apiVersion: 'v1', name: 'redis-7c8b9d6f5-z9y8x', namespace: 'database',
    labels: { app: 'redis', database: 'redis' }, annotations: {}, status: 'Running', podIP: '10.244.3.20', nodeName: 'worker-pool-c-01',
    containers: [{ name: 'redis', image: 'redis:7-alpine', ports: [{ port: 6379, protocol: 'TCP', name: 'redis' }], envVars: [], volumeMounts: [] }],
    ownerReferences: [{ kind: 'Deployment', name: 'redis', uid: 'deploy-redis' }], discoveredAt: ts(),
  },
  {
    uid: 'svc-redis', kind: 'Service', apiVersion: 'v1', name: 'redis', namespace: 'database',
    labels: { app: 'redis' }, annotations: {},
    clusterIP: '10.96.1.20', ports: [{ port: 6379, protocol: 'TCP', targetPort: 6379, name: 'redis' }],
    selector: { app: 'redis' }, discoveredAt: ts(),
  },

  // ─── database: MongoDB ──────────────────────────────────────
  {
    uid: 'sts-mongo', kind: 'StatefulSet', apiVersion: 'apps/v1', name: 'mongo', namespace: 'database',
    labels: { app: 'mongo' }, annotations: {}, status: 'Ready', discoveredAt: ts(),
    containers: [{
      name: 'mongo', image: 'mongo:7',
      ports: [{ port: 27017, protocol: 'TCP', name: 'mongodb' }],
      envVars: [],
      volumeMounts: [{ name: 'data', mountPath: '/data/db', pvcName: 'mongo-data' }],
    }],
  },
  {
    uid: 'svc-mongo', kind: 'Service', apiVersion: 'v1', name: 'mongo', namespace: 'database',
    labels: { app: 'mongo' }, annotations: {},
    clusterIP: '10.96.1.30', ports: [{ port: 27017, protocol: 'TCP', targetPort: 27017, name: 'mongodb' }],
    selector: { app: 'mongo' }, discoveredAt: ts(),
  },
  {
    uid: 'pvc-mongo', kind: 'PersistentVolumeClaim', apiVersion: 'v1', name: 'mongo-data', namespace: 'database',
    labels: { app: 'mongo' }, annotations: {}, status: 'Bound', discoveredAt: ts(),
  },

  // ─── database: Kafka ────────────────────────────────────────
  {
    uid: 'sts-kafka', kind: 'StatefulSet', apiVersion: 'apps/v1', name: 'kafka', namespace: 'database',
    labels: { app: 'kafka' }, annotations: {}, status: 'Ready', discoveredAt: ts(),
    containers: [{
      name: 'kafka', image: 'confluentinc/cp-kafka:7.5',
      ports: [{ port: 9092, protocol: 'TCP', name: 'kafka' }],
      envVars: [],
      volumeMounts: [],
    }],
  },
  {
    uid: 'svc-kafka-headless', kind: 'Service', apiVersion: 'v1', name: 'kafka-headless', namespace: 'database',
    labels: { app: 'kafka' }, annotations: {},
    clusterIP: 'None', ports: [{ port: 9092, protocol: 'TCP', targetPort: 9092, name: 'kafka' }],
    selector: { app: 'kafka' }, discoveredAt: ts(),
  },

  // ─── database: Secrets ──────────────────────────────────────
  {
    uid: 'sec-postgres-creds', kind: 'Secret', apiVersion: 'v1', name: 'postgres-credentials', namespace: 'database',
    labels: {}, annotations: {}, discoveredAt: ts(),
  },

  // ─── monitoring: Prometheus ─────────────────────────────────
  {
    uid: 'deploy-prometheus', kind: 'Deployment', apiVersion: 'apps/v1', name: 'prometheus', namespace: 'monitoring',
    labels: { app: 'prometheus' }, annotations: {}, status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'prometheus', image: 'prom/prometheus:v2.47',
      ports: [{ port: 9090, protocol: 'TCP', name: 'http' }],
      envVars: [],
      volumeMounts: [{ name: 'config', mountPath: '/etc/prometheus', configMapName: 'prometheus-config' }],
    }],
  },
  {
    uid: 'svc-prometheus', kind: 'Service', apiVersion: 'v1', name: 'prometheus', namespace: 'monitoring',
    labels: { app: 'prometheus' }, annotations: {},
    clusterIP: '10.96.2.10', ports: [{ port: 9090, protocol: 'TCP', targetPort: 9090, name: 'http' }],
    selector: { app: 'prometheus' }, discoveredAt: ts(),
  },
  {
    uid: 'cm-prometheus', kind: 'ConfigMap', apiVersion: 'v1', name: 'prometheus-config', namespace: 'monitoring',
    labels: {}, annotations: {}, discoveredAt: ts(),
  },

  // ─── monitoring: Grafana ────────────────────────────────────
  {
    uid: 'deploy-grafana', kind: 'Deployment', apiVersion: 'apps/v1', name: 'grafana', namespace: 'monitoring',
    labels: { app: 'grafana' }, annotations: {}, status: 'Available', discoveredAt: ts(),
    containers: [{
      name: 'grafana', image: 'grafana/grafana:10.1',
      ports: [{ port: 3000, protocol: 'TCP', name: 'http' }],
      envVars: [
        { name: 'GF_DATABASE_URL', value: 'postgres://postgres.database.svc.cluster.local:5432/grafana' },
        { name: 'GF_SECURITY_ADMIN_PASSWORD', valueFrom: { secretKeyRef: { name: 'grafana-secrets', key: 'admin-password' } }, fromSecret: true },
      ],
      volumeMounts: [],
    }],
  },
  {
    uid: 'svc-grafana', kind: 'Service', apiVersion: 'v1', name: 'grafana', namespace: 'monitoring',
    labels: { app: 'grafana' }, annotations: {},
    clusterIP: '10.96.2.20', serviceType: 'NodePort', ports: [{ port: 3000, protocol: 'TCP', targetPort: 3000, name: 'http' }],
    selector: { app: 'grafana' }, discoveredAt: ts(),
  },
  {
    uid: 'sec-grafana', kind: 'Secret', apiVersion: 'v1', name: 'grafana-secrets', namespace: 'monitoring',
    labels: {}, annotations: {}, discoveredAt: ts(),
  },

  // ─── default: CronJob ───────────────────────────────────────
  {
    uid: 'cj-db-backup', kind: 'CronJob', apiVersion: 'batch/v1', name: 'db-backup', namespace: 'default',
    labels: { app: 'db-backup' }, annotations: {}, discoveredAt: ts(),
    containers: [{
      name: 'backup', image: 'myregistry/db-backup:v1.0',
      ports: [],
      envVars: [
        { name: 'POSTGRES_HOST', value: 'postgres.database.svc.cluster.local' },
        { name: 'S3_BUCKET', value: 'https://s3.amazonaws.com/my-backups' },
      ],
      volumeMounts: [],
    }],
  },

  // ─── Complete workload and identity examples ───────────────
  {
    uid: 'rs-user-service', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'user-service-7f4b8c9d2', namespace: 'default',
    labels: { app: 'user-service' }, annotations: {}, status: 'Ready',
    ownerReferences: [{ kind: 'Deployment', name: 'user-service', uid: 'deploy-user-service' }], discoveredAt: ts(),
  },
  {
    uid: 'rs-order-service', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'order-service-69c6d75c8', namespace: 'default',
    labels: { app: 'order-service' }, annotations: {}, status: 'Ready',
    ownerReferences: [{ kind: 'Deployment', name: 'order-service', uid: 'deploy-order-service' }], discoveredAt: ts(),
  },
  {
    uid: 'pod-order-service', kind: 'Pod', apiVersion: 'v1', name: 'order-service-69c6d75c8-r4t5y', namespace: 'default',
    labels: { app: 'order-service', language: 'dotnet' }, annotations: {}, status: 'Running', podIP: '10.244.3.25', nodeName: 'worker-pool-c-01',
    containers: [
      { name: 'order-service', image: 'mcr.microsoft.com/dotnet/aspnet:9.0', imageId: 'sha256:1111111111111111111111111111111111111111111111111111111111111111', type: 'app', ports: [{ port: 3001, protocol: 'TCP', name: 'http' }], envVars: [{ name: 'RUNTIME', value: 'dotnet' }, { name: 'USER_SERVICE_URL', value: 'http://user-service.default.svc.cluster.local:3000' }], volumeMounts: [] },
      { name: 'telemetry-sidecar', image: 'python:3.13-slim', type: 'sidecar', ports: [{ port: 4317, protocol: 'TCP', name: 'otlp' }], envVars: [{ name: 'RUNTIME', value: 'python' }], volumeMounts: [] },
    ],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'order-service-69c6d75c8', uid: 'rs-order-service' }], discoveredAt: ts(),
  },
  {
    uid: 'job-data-migration', kind: 'Job', apiVersion: 'batch/v1', name: 'data-migration-20260826', namespace: 'default',
    labels: { app: 'data-migration' }, annotations: {}, status: 'Complete',
    containers: [{ name: 'migration', image: 'myregistry/data-migration:v4', ports: [], envVars: [{ name: 'DATABASE_URL', value: 'postgres://postgres.database.svc.cluster.local:5432/users' }], volumeMounts: [] }], discoveredAt: ts(),
  },
  { uid: 'sa-workload-api', kind: 'ServiceAccount', apiVersion: 'v1', name: 'workload-api', namespace: 'default', labels: { app: 'api-gateway' }, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'hpa-api-gateway', kind: 'HorizontalPodAutoscaler', apiVersion: 'autoscaling/v2', name: 'api-gateway', namespace: 'default', labels: { app: 'api-gateway' }, annotations: {}, status: 'AbleToScale', discoveredAt: ts() },
  { uid: 'ep-api-gateway', kind: 'Endpoints', apiVersion: 'v1', name: 'api-gateway', namespace: 'default', labels: { app: 'api-gateway' }, annotations: {}, status: 'Ready', discoveredAt: ts() },
  { uid: 'eps-api-gateway', kind: 'EndpointSlice', apiVersion: 'discovery.k8s.io/v1', name: 'api-gateway-vx8cz', namespace: 'default', labels: { 'kubernetes.io/service-name': 'api-gateway' }, annotations: {}, status: 'Ready', discoveredAt: ts() },

  {
    uid: 'rs-redis', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'redis-7c8b9d6f5', namespace: 'database',
    labels: { app: 'redis' }, annotations: {}, status: 'Ready',
    ownerReferences: [{ kind: 'Deployment', name: 'redis', uid: 'deploy-redis' }], discoveredAt: ts(),
  },
  {
    uid: 'pod-mongo-0', kind: 'Pod', apiVersion: 'v1', name: 'mongo-0', namespace: 'database',
    labels: { app: 'mongo', database: 'mongodb' }, annotations: {}, status: 'Running', podIP: '10.244.4.12', nodeName: 'stateful-pool-01',
    containers: [{ name: 'mongo', image: 'mongo:7', ports: [{ port: 27017, protocol: 'TCP', name: 'mongodb' }], envVars: [], volumeMounts: [{ name: 'data', mountPath: '/data/db', pvcName: 'mongo-data' }] }],
    ownerReferences: [{ kind: 'StatefulSet', name: 'mongo', uid: 'sts-mongo' }], discoveredAt: ts(),
  },
  {
    uid: 'pod-kafka-0', kind: 'Pod', apiVersion: 'v1', name: 'kafka-0', namespace: 'database',
    labels: { app: 'kafka' }, annotations: {}, status: 'Running', podIP: '10.244.4.18', nodeName: 'stateful-pool-01',
    containers: [{ name: 'kafka', image: 'confluentinc/cp-kafka:7.5', ports: [{ port: 9092, protocol: 'TCP', name: 'kafka' }], envVars: [], volumeMounts: [] }],
    ownerReferences: [{ kind: 'StatefulSet', name: 'kafka', uid: 'sts-kafka' }], discoveredAt: ts(),
  },
  { uid: 'sa-database-reader', kind: 'ServiceAccount', apiVersion: 'v1', name: 'database-reader', namespace: 'database', labels: { team: 'data' }, annotations: {}, status: 'Active', discoveredAt: ts() },

  {
    uid: 'rs-prometheus', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'prometheus-6b77d9c8f', namespace: 'monitoring',
    labels: { app: 'prometheus' }, annotations: {}, status: 'Ready', ownerReferences: [{ kind: 'Deployment', name: 'prometheus', uid: 'deploy-prometheus' }], discoveredAt: ts(),
  },
  {
    uid: 'pod-prometheus', kind: 'Pod', apiVersion: 'v1', name: 'prometheus-6b77d9c8f-p8q2w', namespace: 'monitoring',
    labels: { app: 'prometheus' }, annotations: {}, status: 'Running', podIP: '10.244.1.40', nodeName: 'worker-pool-a-01',
    containers: [
      { name: 'prometheus', image: 'prom/prometheus:v2.47', type: 'app', ports: [{ port: 9090, protocol: 'TCP', name: 'http' }], envVars: [], volumeMounts: [{ name: 'config', mountPath: '/etc/prometheus', configMapName: 'prometheus-config' }] },
      { name: 'config-reloader', image: 'quay.io/prometheus-operator/prometheus-config-reloader:v0.78.1', type: 'sidecar', ports: [], envVars: [{ name: 'RUNTIME', value: 'golang' }], volumeMounts: [{ name: 'config', mountPath: '/etc/prometheus', configMapName: 'prometheus-config' }] },
    ],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'prometheus-6b77d9c8f', uid: 'rs-prometheus' }], discoveredAt: ts(),
  },
  {
    uid: 'rs-grafana', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'grafana-7f6db8c56', namespace: 'monitoring',
    labels: { app: 'grafana' }, annotations: {}, status: 'Ready', ownerReferences: [{ kind: 'Deployment', name: 'grafana', uid: 'deploy-grafana' }], discoveredAt: ts(),
  },
  {
    uid: 'pod-grafana', kind: 'Pod', apiVersion: 'v1', name: 'grafana-7f6db8c56-v2m4n', namespace: 'monitoring',
    labels: { app: 'grafana' }, annotations: {}, status: 'Running', podIP: '10.244.2.42', nodeName: 'worker-pool-b-01',
    containers: [{ name: 'grafana', image: 'grafana/grafana:10.1', ports: [{ port: 3000, protocol: 'TCP', name: 'http' }], envVars: [{ name: 'PROMETHEUS_URL', value: 'http://prometheus.monitoring.svc.cluster.local:9090' }], volumeMounts: [] }],
    ownerReferences: [{ kind: 'ReplicaSet', name: 'grafana-7f6db8c56', uid: 'rs-grafana' }], discoveredAt: ts(),
  },
  {
    uid: 'ds-node-exporter', kind: 'DaemonSet', apiVersion: 'apps/v1', name: 'node-exporter', namespace: 'monitoring',
    labels: { app: 'node-exporter' }, annotations: {}, status: 'Ready', containers: [{ name: 'exporter', image: 'prom/node-exporter:v1.8.2', ports: [{ port: 9100, protocol: 'TCP', name: 'metrics' }], envVars: [], volumeMounts: [] }], discoveredAt: ts(),
  },
  ...(['a', 'b', 'c'] as const).map((suffix, index): K8sResource => ({
    uid: `pod-node-exporter-${suffix}`, kind: 'Pod', apiVersion: 'v1', name: `node-exporter-${suffix}1`, namespace: 'monitoring',
    labels: { app: 'node-exporter' }, annotations: {}, status: 'Running', podIP: `10.244.${index + 1}.50`, nodeName: `worker-pool-${suffix}-01`,
    containers: [{ name: 'exporter', image: 'prom/node-exporter:v1.8.2', ports: [{ port: 9100, protocol: 'TCP', name: 'metrics' }], envVars: [], volumeMounts: [] }],
    ownerReferences: [{ kind: 'DaemonSet', name: 'node-exporter', uid: 'ds-node-exporter' }], discoveredAt: ts(),
  })),
  { uid: 'sa-metrics-reader', kind: 'ServiceAccount', apiVersion: 'v1', name: 'metrics-reader', namespace: 'monitoring', labels: { app: 'prometheus' }, annotations: {}, status: 'Active', discoveredAt: ts() },

  // ─── payments: complete namespace boundary ─────────────────
  {
    uid: 'deploy-checkout', kind: 'Deployment', apiVersion: 'apps/v1', name: 'checkout', namespace: 'payments',
    labels: { app: 'checkout', team: 'payments' }, annotations: {}, status: 'Available',
    containers: [{ name: 'checkout', image: 'myregistry/checkout:v3.4.0', ports: [{ port: 8080, protocol: 'TCP', name: 'http' }], envVars: [{ name: 'USER_SERVICE_URL', value: 'http://user-service.default.svc.cluster.local:3000' }, { name: 'PAYMENT_CONFIG', valueFrom: { configMapKeyRef: { name: 'checkout-config', key: 'provider' } } }], volumeMounts: [] }], discoveredAt: ts(),
  },
  { uid: 'rs-checkout', kind: 'ReplicaSet', apiVersion: 'apps/v1', name: 'checkout-6f59bc8d7', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'Ready', ownerReferences: [{ kind: 'Deployment', name: 'checkout', uid: 'deploy-checkout' }], discoveredAt: ts() },
  ...(['k2p4s', 'm8n6q'] as const).map((suffix, index): K8sResource => ({
    uid: `pod-checkout-${suffix}`, kind: 'Pod', apiVersion: 'v1', name: `checkout-6f59bc8d7-${suffix}`, namespace: 'payments', labels: { app: 'checkout', language: 'typescript' }, annotations: {}, status: 'Running', podIP: `10.244.${index * 2 + 1}.60`, nodeName: index === 0 ? 'worker-pool-a-01' : 'worker-pool-c-01',
    containers: [
      ...(index === 0 ? [{ name: 'schema-check', image: 'busybox:stable', type: 'init' as const, status: 'Completed', ready: true, ports: [], envVars: [], volumeMounts: [] }] : []),
      { name: 'checkout', image: 'myregistry/checkout:v3.4.0', type: 'app', ports: [{ port: 8080, protocol: 'TCP', name: 'http' }], envVars: [{ name: 'USER_SERVICE_URL', value: 'http://user-service.default.svc.cluster.local:3000' }], volumeMounts: [] },
    ], ownerReferences: [{ kind: 'ReplicaSet', name: 'checkout-6f59bc8d7', uid: 'rs-checkout' }], discoveredAt: ts(),
  })),
  { uid: 'svc-checkout', kind: 'Service', apiVersion: 'v1', name: 'checkout', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'Active', clusterIP: '10.96.3.10', ports: [{ port: 80, protocol: 'TCP', targetPort: 8080, name: 'http' }], selector: { app: 'checkout' }, discoveredAt: ts() },
  { uid: 'svc-payment-provider', kind: 'Service', apiVersion: 'v1', name: 'payment-provider', namespace: 'payments', labels: { app: 'checkout', integration: 'external' }, annotations: {}, status: 'Active', serviceType: 'ExternalName', ports: [{ port: 443, protocol: 'TCP', targetPort: 443, name: 'https' }], discoveredAt: ts() },
  { uid: 'ep-checkout', kind: 'Endpoints', apiVersion: 'v1', name: 'checkout', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'Ready', discoveredAt: ts() },
  { uid: 'eps-checkout', kind: 'EndpointSlice', apiVersion: 'discovery.k8s.io/v1', name: 'checkout-f2k9p', namespace: 'payments', labels: { 'kubernetes.io/service-name': 'checkout' }, annotations: {}, status: 'Ready', discoveredAt: ts() },
  { uid: 'ing-checkout', kind: 'Ingress', apiVersion: 'networking.k8s.io/v1', name: 'checkout', namespace: 'payments', labels: { app: 'checkout' }, annotations: { 'kubernetes.io/ingress.class': 'nginx' }, status: 'Ready', discoveredAt: ts() },
  { uid: 'cm-checkout', kind: 'ConfigMap', apiVersion: 'v1', name: 'checkout-config', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'sec-checkout', kind: 'Secret', apiVersion: 'v1', name: 'checkout-secrets', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'sa-checkout', kind: 'ServiceAccount', apiVersion: 'v1', name: 'checkout', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'Active', discoveredAt: ts() },
  { uid: 'hpa-checkout', kind: 'HorizontalPodAutoscaler', apiVersion: 'autoscaling/v2', name: 'checkout', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'AbleToScale', discoveredAt: ts() },
  { uid: 'job-settlement', kind: 'Job', apiVersion: 'batch/v1', name: 'settlement-20260826', namespace: 'payments', labels: { app: 'settlement' }, annotations: {}, status: 'Complete', containers: [{ name: 'settlement', image: 'myregistry/settlement:v2', ports: [], envVars: [], volumeMounts: [] }], discoveredAt: ts() },
  { uid: 'netpol-checkout', kind: 'NetworkPolicy', apiVersion: 'networking.k8s.io/v1', name: 'checkout-ingress', namespace: 'payments', labels: { app: 'checkout' }, annotations: {}, status: 'Active', selector: { app: 'checkout' }, discoveredAt: ts() },

  // Cluster-scoped fixtures remain available to non-scoped views.
  { uid: 'pv-postgres', kind: 'PersistentVolume', apiVersion: 'v1', name: 'pv-postgres-data', namespace: null, labels: { storage: 'database' }, annotations: {}, status: 'Bound', discoveredAt: ts() },
  { uid: 'sc-fast', kind: 'StorageClass', apiVersion: 'storage.k8s.io/v1', name: 'fast-ssd', namespace: null, labels: { tier: 'fast' }, annotations: {}, status: 'Active', discoveredAt: ts() },

  // ─── NetworkPolicy ──────────────────────────────────────────
  {
    uid: 'netpol-db-restrict', kind: 'NetworkPolicy', apiVersion: 'networking.k8s.io/v1', name: 'restrict-database-access', namespace: 'database',
    labels: {}, annotations: {}, discoveredAt: ts(),
    selector: { app: 'postgres' },
  },
  ...EXPANDED_PLATFORM_MOCK_RESOURCES,
];

export const MOCK_CONTEXTS = [
  { name: 'dev-cluster', cluster: 'dev-cluster', user: 'developer', namespace: 'default', isActive: true },
  { name: 'staging-cluster', cluster: 'staging-cluster', user: 'deployer', namespace: 'default', isActive: false },
];
