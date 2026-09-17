import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKubeconfigMetadata } from './kubeconfig-parser.ts';

const SAMPLE_KUBECONFIG = `
apiVersion: v1
kind: Config
current-context: dev-us-east
clusters:
  - name: dev-cluster
    cluster:
      server: https://192.168.1.100:6443
      insecure-skip-tls-verify: true
  - name: prod-cluster
    cluster:
      server: https://k8s.prod.company.internal:6443
      certificate-authority-data: Ym9ndXMtY2EtZGF0YQ==
users:
  - name: dev-admin
    user:
      token: eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ
  - name: prod-cert-user
    user:
      client-certificate-data: Ym9ndXMtY2VydA==
      client-key-data: Ym9ndXMta2V5
contexts:
  - name: dev-us-east
    context:
      cluster: dev-cluster
      user: dev-admin
      namespace: default
  - name: prod-eu-west
    context:
      cluster: prod-cluster
      user: prod-cert-user
      namespace: production
`;

test('parseKubeconfigMetadata extracts clusters, users, and contexts accurately', () => {
  const result = parseKubeconfigMetadata(SAMPLE_KUBECONFIG);

  assert.equal(result.valid, true);
  assert.equal(result.currentContext, 'dev-us-east');
  assert.equal(result.totalClusters, 2);
  assert.equal(result.totalUsers, 2);
  assert.equal(result.totalContexts, 2);

  // Cluster checks
  const devCluster = result.clusters.find(c => c.name === 'dev-cluster');
  assert.ok(devCluster);
  assert.equal(devCluster.server, 'https://192.168.1.100:6443');
  assert.equal(devCluster.skipTLSVerify, true);
  assert.equal(devCluster.hasCertificateAuthority, false);

  const prodCluster = result.clusters.find(c => c.name === 'prod-cluster');
  assert.ok(prodCluster);
  assert.equal(prodCluster.server, 'https://k8s.prod.company.internal:6443');
  assert.equal(prodCluster.skipTLSVerify, false);
  assert.equal(prodCluster.hasCertificateAuthority, true);

  // User checks
  const tokenUser = result.users.find(u => u.name === 'dev-admin');
  assert.ok(tokenUser);
  assert.equal(tokenUser.authType, 'token');
  assert.equal(tokenUser.hasToken, true);

  const certUser = result.users.find(u => u.name === 'prod-cert-user');
  assert.ok(certUser);
  assert.equal(certUser.authType, 'client-cert');
  assert.equal(certUser.hasClientCertificate, true);

  // Context checks
  const devContext = result.contexts.find(c => c.name === 'dev-us-east');
  assert.ok(devContext);
  assert.equal(devContext.isCurrent, true);
  assert.equal(devContext.server, 'https://192.168.1.100:6443');
  assert.equal(devContext.authType, 'token');
  assert.equal(devContext.namespace, 'default');

  const prodContext = result.contexts.find(c => c.name === 'prod-eu-west');
  assert.ok(prodContext);
  assert.equal(prodContext.isCurrent, false);
  assert.equal(prodContext.server, 'https://k8s.prod.company.internal:6443');
  assert.equal(prodContext.authType, 'client-cert');
  assert.equal(prodContext.namespace, 'production');
});

test('parseKubeconfigMetadata handles empty or invalid yaml gracefully', () => {
  const empty = parseKubeconfigMetadata('');
  assert.equal(empty.valid, false);
  assert.equal(empty.totalContexts, 0);
  assert.ok(empty.error);

  const corrupted = parseKubeconfigMetadata('this is not: [valid: yaml');
  assert.equal(corrupted.valid, false);
  assert.ok(corrupted.error.includes('YAML syntax error'));
});

test('parseKubeconfigMetadata generates warnings for missing references', () => {
  const partial = `
apiVersion: v1
kind: Config
contexts:
  - name: orphan-ctx
    context:
      cluster: non-existent-cluster
      user: non-existent-user
`;
  const result = parseKubeconfigMetadata(partial);
  assert.equal(result.valid, true);
  assert.equal(result.totalContexts, 1);
  assert.ok(result.warnings.some(w => w.includes('non-existent-cluster')));
  assert.ok(result.warnings.some(w => w.includes('non-existent-user')));
});
