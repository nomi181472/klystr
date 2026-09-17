import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComparisonReport,
  buildComparisonReportAsync,
  buildPropertyTree,
  compareObject,
  computePropertyHash,
  fnv1aHex,
  canonicalJsonStringify,
} from './cluster-diff.ts';

function createMockNode(kind, name, namespace, raw, filePath = 'manifest.yaml', line = 10) {
  return {
    id: `${kind}:${namespace}:${name}`,
    key: `${kind}:${namespace}:${name}`,
    kind,
    name,
    namespace,
    source: {
      filePath,
      line,
      column: 1,
    },
    raw,
  };
}

function createMockResource(kind, name, namespace, raw, status = 'Running') {
  return {
    uid: `uid-${kind}-${name}`,
    name,
    namespace,
    kind,
    status,
    raw,
  };
}

test('detects in-sync state when manifest and cluster match', () => {
  const manifest = createMockNode('Deployment', 'web', 'default', {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web', namespace: 'default' },
    spec: {
      replicas: 3,
      template: {
        spec: {
          containers: [{ name: 'app', image: 'nginx:1.25' }],
        },
      },
    },
  });

  const cluster = createMockResource('Deployment', 'web', 'default', {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web', namespace: 'default' },
    spec: {
      replicas: 3,
      template: {
        spec: {
          containers: [{ name: 'app', image: 'nginx:1.25' }],
        },
      },
    },
  });

  const comparison = compareObject(manifest, cluster);
  assert.equal(comparison.status, 'in-sync');
  assert.equal(comparison.statusLabel, 'In Sync');
  assert.equal(comparison.fields.every(f => !f.isDifferent), true);
});

test('detects out-of-sync image drift between manifest and cluster', () => {
  const manifest = createMockNode('Deployment', 'detector', 'prod', {
    spec: {
      replicas: 2,
      template: {
        spec: {
          containers: [{ name: 'detector', image: 'detector:v2.1' }],
        },
      },
    },
  });

  const cluster = createMockResource('Deployment', 'detector', 'prod', {
    spec: {
      replicas: 2,
      template: {
        spec: {
          containers: [{ name: 'detector', image: 'detector:v1.9' }],
        },
      },
    },
  });

  const comparison = compareObject(manifest, cluster);
  assert.equal(comparison.status, 'out-of-sync');
  const imgField = comparison.fields.find(f => f.path === 'spec.containers[].image');
  assert.ok(imgField);
  assert.equal(imgField.isDifferent, true);
  assert.equal(imgField.manifestValue, 'detector:v2.1');
  assert.equal(imgField.clusterValue, 'detector:v1.9');
});

test('detects ConfigMap partial key-value drift when 1 of 5 values changes', () => {
  const manifest = createMockNode('ConfigMap', 'app-config', 'default', {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'app-config', namespace: 'default' },
    data: {
      'database.host': 'postgres.internal',
      'database.port': '5432',
      'feature.flags': '{"newUI":true,"beta":false}',
      'app.env': 'production',
      'cache.ttl': '3600',
    },
  });

  // Cluster has 1 key's value modified ('cache.ttl': '1800') while the other 4 keys are identical
  const cluster = createMockResource('ConfigMap', 'app-config', 'default', {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'app-config', namespace: 'default' },
    data: {
      'database.host': 'postgres.internal',
      'database.port': '5432',
      'feature.flags': '{"newUI":true,"beta":false}',
      'app.env': 'production',
      'cache.ttl': '1800', // MODIFIED
    },
  });

  const comparison = compareObject(manifest, cluster);
  assert.equal(comparison.status, 'out-of-sync');

  // Verify property tree structure
  const dataBranch = comparison.propertyTree.find(p => p.key === 'data');
  assert.ok(dataBranch, 'Property tree must contain data root');
  assert.equal(dataBranch.isDifferent, true, 'data root should reflect subtree drift');
  assert.equal(dataBranch.children.length, 5, 'data root must contain all 5 key nodes');

  const unchangedKey = dataBranch.children.find(c => c.key === 'database.host');
  assert.ok(unchangedKey);
  assert.equal(unchangedKey.isDifferent, false);
  assert.equal(unchangedKey.status, 'in-sync');
  assert.equal(unchangedKey.manifestHash, unchangedKey.clusterHash);

  const changedKey = dataBranch.children.find(c => c.key === 'cache.ttl');
  assert.ok(changedKey);
  assert.equal(changedKey.isDifferent, true);
  assert.equal(changedKey.status, 'out-of-sync');
  assert.equal(changedKey.manifestValue, '3600');
  assert.equal(changedKey.clusterValue, '1800');
  assert.notEqual(changedKey.manifestHash, changedKey.clusterHash);
});

test('normalizes Secret base64 values against manifest stringData', () => {
  const manifest = createMockNode('Secret', 'db-secret', 'default', {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'db-secret', namespace: 'default' },
    stringData: {
      'password': 'super-secret-pw',
    },
  });

  // Cluster stores base64-encoded string: btoa('super-secret-pw') === 'c3VwZXItc2VjcmV0LXB3'
  const cluster = createMockResource('Secret', 'db-secret', 'default', {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'db-secret', namespace: 'default' },
    data: {
      'password': 'c3VwZXItc2VjcmV0LXB3',
    },
  });

  const comparison = compareObject(manifest, cluster);
  assert.equal(comparison.status, 'in-sync');
  const dataBranch = comparison.propertyTree.find(p => p.key === 'data');
  assert.ok(dataBranch);
  const pwNode = dataBranch.children.find(c => c.key === 'password');
  assert.ok(pwNode);
  assert.equal(pwNode.isDifferent, false);
  assert.equal(pwNode.status, 'in-sync');
});

test('detects Workload container environment variable drift in PropertyTree', () => {
  const manifest = createMockNode('Deployment', 'api', 'default', {
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'server',
              image: 'node:20',
              env: [
                { name: 'PORT', value: '8080' },
                { name: 'BASE_RPS', value: '5.0' },
              ],
            },
          ],
        },
      },
    },
  });

  const cluster = createMockResource('Deployment', 'api', 'default', {
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'server',
              image: 'node:20',
              env: [
                { name: 'PORT', value: '8080' },
                { name: 'BASE_RPS', value: '15.0' }, // DRIFT
              ],
            },
          ],
        },
      },
    },
  });

  const comparison = compareObject(manifest, cluster);
  assert.equal(comparison.status, 'out-of-sync');

  const tree = comparison.propertyTree;
  const specNode = tree.find(n => n.key === 'spec');
  assert.ok(specNode);
  const containersNode = specNode.children.find(n => n.key === 'containers');
  assert.ok(containersNode);
  const serverNode = containersNode.children.find(n => n.key === 'server');
  assert.ok(serverNode);
  const envNode = serverNode.children.find(n => n.key === 'env');
  assert.ok(envNode);
  assert.equal(envNode.isDifferent, true);

  const rpsNode = envNode.children.find(n => n.key === 'BASE_RPS');
  assert.ok(rpsNode);
  assert.equal(rpsNode.isDifferent, true);
  assert.equal(rpsNode.manifestValue, '5.0');
  assert.equal(rpsNode.clusterValue, '15.0');
});

test('deterministic hashing produces identical hashes regardless of object key order', () => {
  const obj1 = { z: 1, a: { b: 2, c: [3, 4] }, m: 'test' };
  const obj2 = { a: { c: [3, 4], b: 2 }, m: 'test', z: 1 };

  const hash1 = computePropertyHash(obj1);
  const hash2 = computePropertyHash(obj2);

  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 8);
});

test('buildComparisonReportAsync streams 5 monotonic progress steps from 0% to 100%', async () => {
  const nodes = [
    createMockNode('Deployment', 'app-1', 'default', { spec: { replicas: 1 } }),
    createMockNode('ConfigMap', 'cfg-1', 'default', { data: { k: 'v' } }),
  ];
  const resources = [
    createMockResource('Deployment', 'app-1', 'default', { spec: { replicas: 2 } }),
  ];

  const stepsReceived = [];
  const report = await buildComparisonReportAsync(nodes, resources, undefined, progress => {
    stepsReceived.push(progress);
  });

  assert.ok(report);
  assert.equal(report.totalCompared, 2);
  assert.ok(stepsReceived.length >= 5);

  // Check monotonic percentage increase
  let prevPercent = 0;
  for (const p of stepsReceived) {
    assert.ok(p.percent >= prevPercent, `Percent must increase: ${p.percent} >= ${prevPercent}`);
    prevPercent = p.percent;
  }
  assert.equal(stepsReceived[stepsReceived.length - 1].percent, 100);
});

test('detects nested property drift in embedded JSON inside ConfigMap data (state: STARTING vs RUNNING)', () => {
  const manifest = createMockNode('ConfigMap', 'traffic-control', 'klystr-bookstore', {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'traffic-control', namespace: 'klystr-bookstore' },
    data: {
      'config.json': JSON.stringify({
        state: 'STARTING',
        base_rps: 5.0,
        multiplier: 1.0,
      }),
    },
  });

  const cluster = createMockResource('ConfigMap', 'traffic-control', 'klystr-bookstore', {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'traffic-control', namespace: 'klystr-bookstore' },
    data: {
      'config.json': JSON.stringify({
        state: 'RUNNING',
        base_rps: 5.0,
        multiplier: 1.0,
      }),
    },
  });

  const comparison = compareObject(manifest, cluster);
  assert.equal(comparison.status, 'out-of-sync');

  // Verify nested property drift is captured in fields
  const stateField = comparison.fields.find(f => f.path === 'data.config.json.state');
  assert.ok(stateField, 'Expected field for data.config.json.state');
  assert.equal(stateField.manifestValue, 'STARTING');
  assert.equal(stateField.clusterValue, 'RUNNING');
  assert.equal(stateField.isDifferent, true);

  // Verify diffSummary highlights the exact drifted nested property
  const summaryMatches = comparison.diffSummary.some(s => s.includes('config.json.state drift') && s.includes('RUNNING') && s.includes('STARTING'));
  assert.ok(summaryMatches, 'Expected diffSummary to mention config.json.state drift');

  // Verify propertyTree has nested JSON children
  const dataBranch = comparison.propertyTree.find(r => r.key === 'data');
  assert.ok(dataBranch, 'Expected data branch in propertyTree');
  const configJsonNode = dataBranch.children.find(c => c.key === 'config.json');
  assert.ok(configJsonNode, 'Expected config.json node in data children');
  assert.equal(configJsonNode.type, 'object');
  assert.ok(configJsonNode.children && configJsonNode.children.length === 3);

  const stateNode = configJsonNode.children.find(c => c.key === 'state');
  assert.ok(stateNode, 'Expected state child node');
  assert.equal(stateNode.isDifferent, true);
  assert.equal(stateNode.manifestValue, 'STARTING');
  assert.equal(stateNode.clusterValue, 'RUNNING');

  const baseRpsNode = configJsonNode.children.find(c => c.key === 'base_rps');
  assert.ok(baseRpsNode, 'Expected base_rps child node');
  assert.equal(baseRpsNode.isDifferent, false);
});

