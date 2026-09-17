import * as k8s from '@kubernetes/client-node';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectionSettings, K8sResource } from '@/lib/types';
import type { K8sKind } from '@/config/resource-types';
import { MOCK_RESOURCES } from '@/lib/k8s/mock/fixtures';
import { createLogger } from '@/lib/logger';

const logger = createLogger('targeted-fetch');

export interface ObjectTarget {
  kind: string;
  name: string;
  namespace?: string | null;
}

function resolveKubeConfig(settings?: Partial<ConnectionSettings>): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  if (settings?.kubeconfigContent) {
    kc.loadFromString(settings.kubeconfigContent);
    return kc;
  }
  const defaultPath = settings?.kubeconfigPath || join(homedir(), '.kube', 'config');
  if (existsSync(defaultPath)) {
    kc.loadFromFile(defaultPath);
    return kc;
  }
  try {
    kc.loadFromDefault();
  } catch {
    // fallback
  }
  return kc;
}

/**
 * Finds an executable kubectl binary on the system (e.g. `kubectl` in PATH or `/snap/bin/microk8s kubectl`).
 */
function findKubectlCommand(): string | null {
  try {
    execSync('which kubectl', { stdio: 'ignore' });
    return 'kubectl';
  } catch {
    if (existsSync('/snap/bin/microk8s')) {
      return '/snap/bin/microk8s kubectl';
    }
    return null;
  }
}

/**
 * Fetches a single specific Kubernetes object from cluster using kubectl CLI.
 */
function fetchViaKubectl(
  kind: string,
  name: string,
  namespace?: string | null,
  kubeconfigPath?: string
): Record<string, unknown> | null {
  const kubectl = findKubectlCommand();
  if (!kubectl) return null;

  try {
    const nsArg = namespace ? `-n ${namespace}` : '';
    const kubeconfigArg = kubeconfigPath ? `--kubeconfig "${kubeconfigPath}"` : '';
    const cmd = `${kubectl} get ${kind} ${name} ${nsArg} ${kubeconfigArg} -o json`;
    const stdout = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000, encoding: 'utf-8' });
    if (stdout && stdout.trim().startsWith('{')) {
      return JSON.parse(stdout.trim());
    }
  } catch {
    // not found or cluster offline
  }
  return null;
}

/**
 * Normalizes namespace string.
 */
function normNs(ns?: string | null): string {
  if (!ns || ns === 'null' || ns === 'undefined') return 'default';
  return ns.trim() || 'default';
}

/**
 * Fetches targeted Kubernetes objects from the cluster.
 * 1. Queries specific objects via API / kubectl.
 * 2. If cluster is unreachable or in mock mode, falls back to MOCK_RESOURCES fixture registry.
 */
export async function fetchTargetClusterObjects(
  targets: ObjectTarget[],
  settings?: Partial<ConnectionSettings>
): Promise<{
  resources: K8sResource[];
  namespaces: string[];
  isFallback: boolean;
  contextName: string;
}> {
  const isLive = settings?.mode === 'live' || process.env.KLYSTR_DISABLE_MOCK === 'true';
  const targetNsSet = new Set<string>();
  targets.forEach(t => targetNsSet.add(normNs(t.namespace)));

  if (!isLive) {
    // Mock mode lookup
    const matched = lookupInMockFixtures(targets);
    return {
      resources: matched,
      namespaces: Array.from(targetNsSet),
      isFallback: false,
      contextName: settings?.contextName || 'demo-cluster',
    };
  }

  // Live cluster lookup
  const results: K8sResource[] = [];
  let connectionSucceeded = false;
  let contextName = settings?.contextName || 'cluster';

  const kc = resolveKubeConfig(settings);
  const currentCtx = settings?.contextName || kc.getCurrentContext() || 'cluster';
  contextName = currentCtx;

  // Try direct targeted retrieval for each object
  for (const target of targets) {
    const ns = normNs(target.namespace);
    let rawObj: Record<string, unknown> | null = null;

    // 1. Try kubectl CLI first if available (handles microk8s, custom auth, and tokens natively)
    rawObj = fetchViaKubectl(target.kind, target.name, ns, settings?.kubeconfigPath);

    if (rawObj) {
      connectionSucceeded = true;
      results.push(rawToResource(target.kind, rawObj));
    }
  }

  if (connectionSucceeded && results.length > 0) {
    return {
      resources: results,
      namespaces: Array.from(targetNsSet),
      isFallback: false,
      contextName,
    };
  }

  // If live cluster is unreachable / offline, fall back to fixture registry so comparison works
  logger.warn('Targeted live cluster query unreachable or returned 0 items; falling back to fixture registry for targets');
  const fallbackMatched = lookupInMockFixtures(targets);
  return {
    resources: fallbackMatched,
    namespaces: Array.from(targetNsSet),
    isFallback: true,
    contextName: `${contextName} (demo-fallback)`,
  };
}

/**
 * Looks up specific targets in the MOCK_RESOURCES registry.
 */
function lookupInMockFixtures(targets: ObjectTarget[]): K8sResource[] {
  const found: K8sResource[] = [];
  for (const target of targets) {
    const targetNs = normNs(target.namespace);
    const match = MOCK_RESOURCES.find(r => {
      const rNs = normNs(r.namespace);
      return (
        r.kind.toLowerCase() === target.kind.toLowerCase() &&
        r.name.toLowerCase() === target.name.toLowerCase() &&
        rNs.toLowerCase() === targetNs.toLowerCase()
      );
    });

    if (match) {
      found.push(match);
    }
  }
  return found;
}

/**
 * Converts a raw Kubernetes object JSON to K8sResource.
 */
function rawToResource(kind: string, obj: Record<string, unknown>): K8sResource {
  const metadata = (obj.metadata as Record<string, unknown>) || {};
  const name = String(metadata.name || 'unknown');
  const namespace = metadata.namespace ? String(metadata.namespace) : null;
  const labels = (metadata.labels as Record<string, string>) || {};
  const annotations = (metadata.annotations as Record<string, string>) || {};

  return {
    uid: String(metadata.uid || `${kind}/${namespace || 'cluster'}/${name}`),
    kind: kind as K8sKind,
    apiVersion: String(obj.apiVersion || 'v1'),
    name,
    namespace,
    labels,
    annotations,
    status: 'Active',
    discoveredAt: new Date().toISOString(),
    raw: obj,
  };
}
