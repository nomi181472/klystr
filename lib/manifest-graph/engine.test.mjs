import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestFiles } from './engine.ts';
import { analyzeManifestGraph } from './insights.ts';
import { fullGraph } from './serialize.ts';

function session() {
  return { id: 'test', nodeStore: new Map(), adjacencyOut: new Map(), adjacencyIn: new Map(), conflicts: new Map(), createdAt: 0, expiresAt: Infinity };
}

test('keeps regular, init, and ephemeral container references independently attributable', () => {
  const graph = session();
  const events = [];
  ingestFiles(graph, [{ relativePath: 'multi.yaml', content: `
apiVersion: v1
kind: ConfigMap
metadata: { name: shared, namespace: demo }
data: { value: ok }
---
apiVersion: v1
kind: Pod
metadata: { name: multi, namespace: demo }
spec:
  containers:
    - name: app
      image: app:1
      env:
        - { name: TARGET, valueFrom: { configMapKeyRef: { name: shared, key: value } } }
    - name: sidecar
      image: sidecar:1
      env:
        - { name: TARGET, value: shared }
  initContainers:
    - name: setup
      image: setup:1
      envFrom:
        - { configMapRef: { name: shared } }
  ephemeralContainers:
    - name: debugger
      image: debug:1
      env:
        - { name: TARGET, value: shared }
` }], event => events.push(event));
  const pod = [...graph.nodeStore.values()].find(node => node.kind === 'Pod');
  assert.ok(pod);
  assert.deepEqual(pod.containers.map(container => [container.name, container.role, container.index]), [
    ['app', 'container', 0], ['sidecar', 'container', 1], ['setup', 'initContainer', 0], ['debugger', 'ephemeralContainer', 0],
  ]);
  assert.equal(pod.structuralRefs.filter(ref => ref.containerName === 'app').length, 1);
  assert.equal(pod.structuralRefs.filter(ref => ref.containerName === 'setup').length, 1);
  assert.equal(pod.literalRefs.filter(ref => ref.containerName === 'sidecar').flatMap(ref => ref.matchedNames).length, 1);
  assert.equal(pod.literalRefs.filter(ref => ref.containerName === 'debugger').flatMap(ref => ref.matchedNames).length, 1);
  assert.equal(graph.adjacencyOut.get(pod.key).filter(edge => edge.to.includes('::ConfigMap::demo::shared')).length, 4);
  assert.ok(events.some(event => event.type === 'done'));
});

test('keeps duplicate resources non-fatal and records the deterministic winner', () => {
  const graph = session();
  ingestFiles(graph, [
    { relativePath: 'a.yaml', lastModified: 1, content: 'apiVersion: v1\nkind: ConfigMap\nmetadata: { name: duplicate }\n' },
    { relativePath: 'b.yaml', lastModified: 2, content: 'apiVersion: v1\nkind: ConfigMap\nmetadata: { name: duplicate }\n' },
  ], () => undefined);
  assert.equal([...graph.nodeStore.values()][0].source.filePath, 'b.yaml');
  assert.equal([...graph.conflicts.values()].flat().length, 1);
});

test('recovers duplicate YAML mapping keys with a warning and last-value semantics', () => {
  const graph = session();
  const events = [];
  ingestFiles(graph, [{ relativePath: 'duplicate-keys.yaml', content: `
apiVersion: v1
kind: ConfigMap
metadata: { name: duplicate-keys }
data:
  PORT: "5000"
  PORT: "6000"
` }], event => events.push(event));
  const node = [...graph.nodeStore.values()][0];
  assert.equal(node.raw.data.PORT, '6000');
  assert.ok(events.some(event => event.type === 'file-warning'));
  assert.ok(events.some(event => event.type === 'done'));
});

test('surfaces actionable static posture findings without live-cluster assumptions', () => {
  const graph = session();
  ingestFiles(graph, [{ relativePath: 'posture.yaml', content: `
apiVersion: v1
kind: Service
metadata: { name: unmatched, namespace: demo }
spec: { selector: { app: missing }, ports: [{ port: 80 }] }
---
apiVersion: v1
kind: Pod
metadata: { name: risky, namespace: demo }
spec:
  hostNetwork: true
  containers:
    - name: app
      image: example/app:latest
      securityContext: { privileged: true }
      envFrom: [{ configMapRef: { name: absent } }]
` }], () => undefined);
  const insights = analyzeManifestGraph([...graph.nodeStore.values()], [...graph.adjacencyOut].flatMap(([from, edges]) => edges.map(edge => ({ from, ...edge }))));
  assert.ok(insights.some(insight => insight.title === 'Service has no workload targets'));
  assert.ok(insights.some(insight => insight.title.startsWith('Missing ConfigMap')));
  assert.ok(insights.some(insight => insight.title === 'Host namespace enabled'));
  assert.ok(insights.some(insight => insight.title === 'Privileged container'));
  assert.ok(insights.some(insight => insight.title === 'Health probes missing'));
});

test('keeps name and selector relations inside the effective namespace', () => {
  const graph = session();
  ingestFiles(graph, [{ relativePath: 'scope.yaml', content: `
apiVersion: v1
kind: ConfigMap
metadata: { name: shared, namespace: demo }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: shared, namespace: other }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: selected, namespace: demo }
spec: { template: { metadata: { labels: { app: api } }, spec: { containers: [{ name: app, image: app:1 }] } } }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: wrong-namespace, namespace: other }
spec: { template: { metadata: { labels: { app: api } }, spec: { containers: [{ name: app, image: app:1 }] } } }
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: demo }
spec: { selector: { app: api }, ports: [{ port: 80 }] }
---
apiVersion: v1
kind: Pod
metadata: { name: consumer, namespace: demo }
spec: { containers: [{ name: app, image: app:1, envFrom: [{ configMapRef: { name: shared } }] }] }
` }], () => undefined);
  const service = [...graph.nodeStore.values()].find(node => node.kind === 'Service');
  const pod = [...graph.nodeStore.values()].find(node => node.kind === 'Pod');
  const serviceTargets = graph.adjacencyOut.get(service.key).map(edge => graph.nodeStore.get(edge.to));
  assert.deepEqual(serviceTargets.map(node => `${node.namespace}/${node.name}`), ['demo/selected']);
  const configTargets = graph.adjacencyOut.get(pod.key).filter(edge => edge.meta?.targetKind === 'ConfigMap').map(edge => graph.nodeStore.get(edge.to));
  assert.deepEqual(configTargets.map(node => `${node.namespace}/${node.name}`), ['demo/shared']);
});

test('defaults known namespaced resources to default and redacts Secret payloads', () => {
  const graph = session();
  ingestFiles(graph, [{ relativePath: 'secret.yaml', content: `
apiVersion: v1
kind: Secret
metadata: { name: credentials }
stringData: { password: super-secret }
` }], () => undefined);
  const secret = [...graph.nodeStore.values()][0];
  assert.equal(secret.namespace, 'default');
  assert.equal(fullGraph(graph).nodes[0].raw.stringData.password, '<redacted>');
});

test('unpacks Kubernetes Lists and applies uploaded CRD scope to custom resources', () => {
  const graph = session();
  ingestFiles(graph, [{ relativePath: 'list-and-crd.yaml', content: `
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: { name: widgets.example.io }
spec:
  group: example.io
  scope: Namespaced
  names: { plural: widgets, singular: widget, kind: Widget }
  versions: [{ name: v1, served: true, storage: true, schema: { openAPIV3Schema: { type: object } } }]
---
apiVersion: v1
kind: List
items:
  - apiVersion: example.io/v1
    kind: Widget
    metadata: { name: sample }
  - apiVersion: v1
    kind: ConfigMap
    metadata: { name: listed, namespace: tools }
` }], () => undefined);
  const widget = [...graph.nodeStore.values()].find(node => node.kind === 'Widget');
  const crd = [...graph.nodeStore.values()].find(node => node.kind === 'CustomResourceDefinition');
  assert.equal(widget.namespace, 'default');
  assert.ok(crd.structuralRefs.some(ref => ref.mode === 'byKindMatch' && ref.candidateNodeKeys.includes(widget.key)));
  assert.ok([...graph.nodeStore.values()].some(node => node.kind === 'ConfigMap' && node.namespace === 'tools'));
  assert.ok(![...graph.nodeStore.values()].some(node => node.kind === 'List'));
});

test('resolves ServiceAccount subjects using their declared binding namespace', () => {
  const graph = session();
  ingestFiles(graph, [{ relativePath: 'rbac.yaml', content: `
apiVersion: v1
kind: ServiceAccount
metadata: { name: deployer, namespace: tools }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata: { name: deployer-role }
rules: []
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: deployer-binding }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: deployer-role }
subjects: [{ kind: ServiceAccount, name: deployer, namespace: tools }]
` }], () => undefined);
  const binding = [...graph.nodeStore.values()].find(node => node.kind === 'ClusterRoleBinding');
  const targets = (graph.adjacencyOut.get(binding.key) ?? []).map(edge => graph.nodeStore.get(edge.to));
  assert.ok(targets.some(node => node?.kind === 'ServiceAccount' && node.namespace === 'tools'));
  assert.ok(targets.some(node => node?.kind === 'ClusterRole' && node.namespace === null));
});

test('keeps a mounted resource attributable to every consuming container', () => {
  const graph = session();
  ingestFiles(graph, [{ relativePath: 'mounted.yaml', content: `
apiVersion: v1
kind: ConfigMap
metadata: { name: shared, namespace: demo }
---
apiVersion: v1
kind: Pod
metadata: { name: multi-mount, namespace: demo }
spec:
  volumes: [{ name: settings, configMap: { name: shared } }]
  containers:
    - { name: app, image: app:1, volumeMounts: [{ name: settings, mountPath: /app/config }] }
    - { name: sidecar, image: sidecar:1, volumeMounts: [{ name: settings, mountPath: /sidecar/config }] }
  initContainers:
    - { name: setup, image: setup:1, volumeMounts: [{ name: settings, mountPath: /setup/config }] }
` }], () => undefined);
  const pod = [...graph.nodeStore.values()].find(node => node.kind === 'Pod');
  const configEdges = (graph.adjacencyOut.get(pod.key) ?? []).filter(edge => edge.meta?.targetKind === 'ConfigMap');
  assert.equal(configEdges.length, 3);
  assert.deepEqual(new Set(configEdges.map(edge => edge.meta?.containerName)), new Set(['app', 'sidecar', 'setup']));
});

test('extracts scheduling, policy, and webhook selector references', () => {
  const graph = session();
  ingestFiles(graph, [{ relativePath: 'registry.yaml', content: `
apiVersion: v1
kind: Node
metadata: { name: node-a, labels: { topology.kubernetes.io/zone: east } }
---
apiVersion: v1
kind: Namespace
metadata: { name: demo, labels: { tenant: blue } }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: demo }
spec:
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      nodeSelector: { topology.kubernetes.io/zone: east }
      containers: [{ name: app, image: app:1 }]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-blue, namespace: demo }
spec:
  podSelector: {}
  ingress: [{ from: [{ namespaceSelector: { matchLabels: { tenant: blue } } }] }]
---
apiVersion: v1
kind: Service
metadata: { name: webhook, namespace: tools }
spec: { ports: [{ port: 443 }] }
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata: { name: validator }
webhooks:
  - name: validator.example.io
    clientConfig: { service: { name: webhook, namespace: tools } }
    rules: []
    admissionReviewVersions: [v1]
    sideEffects: None
` }], () => undefined);
  const deployment = [...graph.nodeStore.values()].find(node => node.kind === 'Deployment');
  const policy = [...graph.nodeStore.values()].find(node => node.kind === 'NetworkPolicy');
  const webhook = [...graph.nodeStore.values()].find(node => node.kind === 'ValidatingWebhookConfiguration');
  assert.ok(deployment.structuralRefs.some(ref => ref.targetKind === 'Node' && ref.resolved));
  assert.ok(policy.structuralRefs.some(ref => ref.fieldPath === 'spec.podSelector' && ref.candidateNodeKeys.includes(deployment.key)));
  assert.ok(webhook.structuralRefs.some(ref => ref.targetKind === 'Service' && ref.resolved));
});
