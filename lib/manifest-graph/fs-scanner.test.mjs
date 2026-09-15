import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDirectoryForManifests, getCurrentWorkspaceDirectory } from './fs-scanner.ts';

test('scans current directory and returns kubernetes manifests while ignoring non-k8s files', async () => {
  const result = await scanDirectoryForManifests();

  assert.ok(result.directory, 'Should return the directory path');
  assert.ok(Array.isArray(result.files), 'Should return an array of manifest files');
  assert.ok(result.files.length >= 2, 'Should find at least the deploy/ manifests in klystr');

  // Verify deploy/image-scanner-rbac.yaml is found
  const scannerFile = result.files.find(f => f.relativePath.includes('image-scanner-rbac.yaml'));
  assert.ok(scannerFile, 'Should find deploy/image-scanner-rbac.yaml');
  assert.ok(scannerFile.content.includes('apiVersion: v1'), 'Should contain apiVersion');
  assert.ok(scannerFile.content.includes('kind: Namespace'), 'Should contain kind');

  // Verify non-manifest yaml files (like docker-compose.yml) are excluded
  const dockerCompose = result.files.find(f => f.relativePath === 'docker-compose.yml');
  assert.equal(dockerCompose, undefined, 'Should not include docker-compose.yml since it lacks k8s kind');

  // Verify node_modules are excluded
  const inNodeModules = result.files.some(f => f.relativePath.includes('node_modules'));
  assert.equal(inNodeModules, false, 'Should not include files from node_modules');
});
