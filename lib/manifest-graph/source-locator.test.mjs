import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDocumentRanges,
  locateResourceInYaml,
  locateEdgeInYaml,
} from './source-locator.ts';

const MULTI_DOC_YAML = `apiVersion: v1
kind: ConfigMap
metadata:
  name: shared-config
data:
  PORT: "8080"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:latest
        env:
        - name: PORT
          valueFrom:
            configMapKeyRef:
              name: shared-config
              key: PORT
---
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web
  ports:
  - port: 80
`;

test('getDocumentRanges correctly segments multi-document YAML', () => {
  const ranges = getDocumentRanges(MULTI_DOC_YAML);
  assert.equal(ranges.length, 3);
  assert.equal(ranges[0].startLine, 1);
  assert.equal(ranges[1].startLine, 8);
  assert.equal(ranges[2].startLine, 32);
});

test('locateResourceInYaml finds exact kind definition lines in multi-doc YAML', () => {
  const cmLoc = locateResourceInYaml(MULTI_DOC_YAML, 'ConfigMap', 'shared-config');
  assert.equal(cmLoc.line, 2);

  const deployLoc = locateResourceInYaml(MULTI_DOC_YAML, 'Deployment', 'web-app');
  assert.equal(deployLoc.line, 9);

  const svcLoc = locateResourceInYaml(MULTI_DOC_YAML, 'Service', 'web-service');
  assert.equal(svcLoc.line, 33);
});

test('locateEdgeInYaml finds configMap reference in Deployment', () => {
  const edge = {
    type: 'structural:byName',
    meta: {
      fieldPath: 'canonicalPodSpec.containers[0].env[0].valueFrom.configMapKeyRef.name',
      targetKind: 'ConfigMap',
      targetName: 'shared-config',
    },
  };
  const sourceNode = { kind: 'Deployment', name: 'web-app' };
  const targetNode = { kind: 'ConfigMap', name: 'shared-config' };

  const loc = locateEdgeInYaml(MULTI_DOC_YAML, edge, sourceNode, targetNode);
  // line 29 is "              name: shared-config"
  assert.equal(loc.line, 29);
});

test('locateEdgeInYaml finds selector matching in Service', () => {
  const edge = {
    type: 'structural:bySelector',
    meta: {
      fieldPath: 'spec.selector',
      rawSelector: { app: 'web' },
      targetKind: 'Deployment',
    },
  };
  const sourceNode = { kind: 'Service', name: 'web-service' };
  const targetNode = { kind: 'Deployment', name: 'web-app' };

  const loc = locateEdgeInYaml(MULTI_DOC_YAML, edge, sourceNode, targetNode);
  // line 38 is "    app: web" in Service
  assert.equal(loc.line, 38);
});

test('locateEdgeInYaml falls back gracefully if target not found', () => {
  const edge = {
    type: 'literal:name',
    meta: {},
  };
  const sourceNode = { kind: 'Deployment', name: 'web-app' };

  const loc = locateEdgeInYaml(MULTI_DOC_YAML, edge, sourceNode);
  assert.equal(loc.line, 8); // start of deployment document
});
