import { NextResponse } from 'next/server';
import { MOCK_CONTEXTS } from '@/lib/k8s/mock/fixtures';
import { availableContexts, createKubeConfig, currentContextName } from '@/lib/k8s/discovery';
import { parseKubeconfigMetadata } from '@/lib/k8s/kubeconfig-parser';
import type { ConnectionSettings } from '@/lib/types';
import { existsSync, readFileSync } from 'node:fs';

export async function POST(request: Request) {
  const settings = (await request.json().catch(() => ({}))) as Partial<ConnectionSettings>;
  if (settings.mode === 'mock' && process.env.KLYSTR_DISABLE_MOCK !== 'true') {
    return NextResponse.json({
      contexts: MOCK_CONTEXTS,
      currentContext: MOCK_CONTEXTS.find(c => c.isActive)?.name || 'default',
      clusters: [{ name: 'demo-cluster', server: 'https://demo-cluster.local:6443' }],
    });
  }

  try {
    let metadata: ReturnType<typeof parseKubeconfigMetadata> | undefined;

    if (settings.kubeconfigContent) {
      metadata = parseKubeconfigMetadata(settings.kubeconfigContent);
    } else if (settings.kubeconfigPath && existsSync(settings.kubeconfigPath)) {
      try {
        const content = readFileSync(settings.kubeconfigPath, 'utf-8');
        metadata = parseKubeconfigMetadata(content);
      } catch {
        // Fall back to kubernetes-client loading
      }
    }

    const kc = createKubeConfig(settings);
    const active = currentContextName(settings) || metadata?.currentContext || '';
    const rawContexts = availableContexts(settings);
    const rawClusters = kc.getClusters();

    const contexts = rawContexts.map(context => {
      const matchedCluster = rawClusters.find(c => c.name === context.cluster);
      const metaCtx = metadata?.contexts.find(c => c.name === context.name);
      return {
        name: context.name,
        cluster: context.cluster,
        user: context.user,
        namespace: context.namespace,
        isActive: context.name === active,
        server: matchedCluster?.server || metaCtx?.server,
        authType: metaCtx?.authType,
      };
    });

    const clusters = rawClusters.map(c => ({
      name: c.name,
      server: c.server,
      skipTLSVerify: Boolean(c.skipTLSVerify),
    }));

    return NextResponse.json({
      contexts,
      clusters,
      currentContext: active,
      metadata,
    });
  } catch (err: any) {
    return NextResponse.json(
      { contexts: [], clusters: [], error: err?.message || 'Unable to load kubeconfig contexts' },
      { status: 503 }
    );
  }
}
