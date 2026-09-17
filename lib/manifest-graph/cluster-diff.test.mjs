import test from 'node:test';
import assert from 'node:assert/strict';
import { compareObject, buildComparisonReport } from './cluster-diff.ts';

function createMockManifestNode(overrides = {}) {
  return {
    key: 'deployment:default:web-api',
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    namespace: 'default',
    name: 'web-api',
    source: {
      filePath: 'manifests/web-api.yaml',
      line: 12,
      column: 1,
      ingestOrder: 1,
    },
    raw: {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'web-api', namespace: 'default' },
      spec: {
        replicas: 3,
        template: {
          spec: {
            containers: [
              { name: 'app', image: 'myrepo/web-api:v2.0.0', ports: [{ containerPort: 8080 }] }
            ]
          }
        }
      }
    },
    literalRefs: [],
    structuralRefs: [],
    ...overrides,
  };
}

function createMockClusterResource(overrides = {}) {
  return {
    uid: 'Deployment/default/web-api',
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    name: 'web-api',
    namespace: 'default',
    labels: { app: 'web-api' },
    annotations: {},
    status: 'Running',
    discoveredAt: new Date().toISOString(),
    containers: [
      { name: 'app', image: 'myrepo/web-api:v2.0.0', ports: [{ port: 8080, protocol: 'TCP' }] }
    ],
    raw: {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'web-api', namespace: 'default' },
      spec: {
        replicas: 3,
        template: {
          spec: {
            containers: [
              { name: 'app', image: 'myrepo/web-api:v2.0.0', ports: [{ containerPort: 8080 }] }
            ]
          }
        }
      }
    },
    ...overrides,
  };
}

test('detects in-sync state when manifest and cluster match', () => {
  const manifest = createMockManifestNode();
  const cluster = createMockClusterResource();
  const result = compareObject(manifest, cluster);

  assert.equal(result.status, 'in-sync');
  assert.equal(result.diffSummary.length, 0);
  assert.equal(result.fields.some(f => f.isDifferent), false);
});

test('detects out-of-sync image drift between manifest and cluster', () => {
  const manifest = createMockManifestNode();
  const cluster = createMockClusterResource({
    containers: [{ name: 'app', image: 'myrepo/web-api:v1.9.0' }],
    raw: {
      spec: {
        replicas: 3,
        template: {
          spec: {
            containers: [{ name: 'app', image: 'myrepo/web-api:v1.9.0' }]
          }
        }
      }
    }
  });
  const result = compareObject(manifest, cluster);

  assert.equal(result.status, 'out-of-sync');
  assert.ok(result.diffSummary.some(s => s.includes('Image drift')));
  const imageField = result.fields.find(f => f.path === 'spec.containers[].image');
  assert.ok(imageField?.isDifferent);
  assert.equal(imageField?.manifestValue, 'myrepo/web-api:v2.0.0');
  assert.equal(imageField?.clusterValue, 'myrepo/web-api:v1.9.0');
});

test('detects out-of-sync replica drift', () => {
  const manifest = createMockManifestNode();
  const cluster = createMockClusterResource({
    raw: {
      spec: {
        replicas: 1,
        template: {
          spec: {
            containers: [{ name: 'app', image: 'myrepo/web-api:v2.0.0' }]
          }
        }
      }
    }
  });
  const result = compareObject(manifest, cluster);

  assert.equal(result.status, 'out-of-sync');
  assert.ok(result.diffSummary.some(s => s.includes('Replica drift')));
  const replicaField = result.fields.find(f => f.path === 'spec.replicas');
  assert.ok(replicaField?.isDifferent);
  assert.equal(replicaField?.manifestValue, '3');
  assert.equal(replicaField?.clusterValue, '1');
});

test('detects missing-in-cluster when resource exists only in manifests', () => {
  const manifest = createMockManifestNode({ name: 'unreleased-service' });
  const result = compareObject(manifest, undefined);

  assert.equal(result.status, 'missing-in-cluster');
  assert.equal(result.statusLabel, 'Missing in Cluster');
  assert.equal(result.fileName, 'manifests/web-api.yaml');
  assert.equal(result.sourceLine, 12);
});

test('detects cluster-only when resource exists only in live cluster', () => {
  const cluster = createMockClusterResource({ name: 'ad-hoc-pod' });
  const result = compareObject(undefined, cluster);

  assert.equal(result.status, 'cluster-only');
  assert.equal(result.statusLabel, 'Cluster Only');
});

test('buildComparisonReport groups by Kind with Deployment and StatefulSet prioritized', () => {
  const manifest1 = createMockManifestNode({ kind: 'Deployment', name: 'api' });
  const manifest2 = createMockManifestNode({ kind: 'StatefulSet', name: 'db' });
  const manifest3 = createMockManifestNode({ kind: 'Service', name: 'api-svc' });

  const cluster1 = createMockClusterResource({ kind: 'Deployment', name: 'api' });
  const cluster2 = createMockClusterResource({
    kind: 'StatefulSet',
    name: 'db',
    containers: [{ name: 'db', image: 'postgres:14' }],
    raw: {
      spec: {
        template: { spec: { containers: [{ name: 'db', image: 'postgres:14' }] } }
      }
    }
  });

  const report = buildComparisonReport([manifest1, manifest2, manifest3], [cluster1, cluster2]);

  assert.equal(report.summary.inSync, 1); // api Deployment
  assert.equal(report.summary.outOfSync, 1); // db StatefulSet has image drift
  assert.equal(report.summary.missingInCluster, 1); // api-svc Service missing in cluster

  const kinds = report.byKind.map(k => k.kind);
  assert.equal(kinds[0], 'Deployment');
  assert.equal(kinds[1], 'StatefulSet');
  assert.equal(kinds[2], 'Service');
});

test('respects namespace filtering in buildComparisonReport', () => {
  const manifestProd = createMockManifestNode({ namespace: 'prod', name: 'api' });
  const manifestDev = createMockManifestNode({ namespace: 'dev', name: 'api' });
  const clusterProd = createMockClusterResource({ namespace: 'prod', name: 'api' });
  const clusterDev = createMockClusterResource({ namespace: 'dev', name: 'api' });

  const report = buildComparisonReport([manifestProd, manifestDev], [clusterProd, clusterDev], ['prod']);

  assert.equal(report.totalCompared, 1);
  assert.equal(report.namespaces.includes('prod'), true);
  assert.equal(report.namespaces.includes('dev'), false);
});
