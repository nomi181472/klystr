import { NextResponse } from 'next/server';
import { discoverLiveNamespaces, discoverLiveResources } from '@/lib/k8s/discovery';
import { fetchTargetClusterObjects, type ObjectTarget } from '@/lib/k8s/targeted-fetch';
import { MOCK_RESOURCES } from '@/lib/k8s/mock/fixtures';
import type { ConnectionSettings, K8sResource } from '@/lib/types';
import type { K8sKind } from '@/config/resource-types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('manifest-graph/compare');

const ALL_COMPARE_KINDS: K8sKind[] = [
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Service',
  'ConfigMap',
  'Secret',
  'Ingress',
  'PersistentVolumeClaim',
  'HorizontalPodAutoscaler',
  'Job',
  'CronJob',
  'NetworkPolicy',
  'ServiceAccount',
  'Pod',
];

interface CompareRequestBody extends Partial<ConnectionSettings> {
  namespaces?: string[];
  targets?: ObjectTarget[];
}

export async function POST(request: Request) {
  try {
    const requestedContext = new URL(request.url).searchParams.get('ctx') ?? undefined;
    const body = (await request.json().catch(() => ({}))) as CompareRequestBody;

    const settings: ConnectionSettings = {
      mode: body.mode ?? 'mock',
      clusterUrl: body.clusterUrl ?? '',
      token: body.token ?? '',
      skipTlsVerify: body.skipTlsVerify ?? false,
      environment: body.environment,
      kubeconfigPath: body.kubeconfigPath,
      kubeconfigContent: body.kubeconfigContent,
      kubeconfigFileName: body.kubeconfigFileName,
      contextName: body.contextName ?? requestedContext,
      connectionId: body.connectionId,
    };

    const isLive = settings.mode === 'live' || process.env.KLYSTR_DISABLE_MOCK === 'true';

    logger.info('Cluster comparison request', {
      mode: isLive ? 'live' : 'mock',
      context: requestedContext ?? settings.contextName ?? 'default',
      targetsCount: body.targets?.length ?? 0,
    });

    // Targeted comparison: query cluster specifically for the manifest objects declared
    if (body.targets && body.targets.length > 0) {
      const targetedResult = await fetchTargetClusterObjects(body.targets, settings);
      return NextResponse.json({
        accessible: true,
        contextName: targetedResult.contextName,
        namespaces: targetedResult.namespaces,
        resources: targetedResult.resources,
        fallbackToMock: targetedResult.isFallback,
      });
    }

    if (!isLive) {
      // Mock mode fallback
      const namespaces = Array.from(new Set(MOCK_RESOURCES.map(r => r.namespace || 'default'))).sort();
      return NextResponse.json({
        accessible: true,
        contextName: settings.contextName || 'demo-cluster',
        namespaces,
        resources: MOCK_RESOURCES,
      });
    }

    // Live mode: test cluster connection and retrieve resources
    try {
      const nsDiscovery = await discoverLiveNamespaces(requestedContext, settings);
      const availableNamespaces = nsDiscovery.namespaces;

      const targetNamespaces = body.namespaces && body.namespaces.length > 0 && !body.namespaces.includes('all')
        ? body.namespaces.filter(ns => availableNamespaces.includes(ns))
        : availableNamespaces;

      const discovered = await discoverLiveResources(requestedContext, settings, {
        namespaces: targetNamespaces.length > 0 ? targetNamespaces : undefined,
        kinds: ALL_COMPARE_KINDS,
      });

      const resources: K8sResource[] = discovered?.resources ?? [];
      const hasConnectionError = nsDiscovery.warnings.some(w => w.type === 'error');

      // Fallback: If cluster discovery yielded 0 resources and had connection errors, fall back to mock fixtures
      if (resources.length === 0 && (availableNamespaces.length === 0 || hasConnectionError)) {
        logger.warn('Live cluster unreachable in compare, falling back to mock fixtures', {
          warnings: nsDiscovery.warnings,
          context: requestedContext ?? settings.contextName,
        });
        const fallbackNamespaces = Array.from(new Set(MOCK_RESOURCES.map(r => r.namespace || 'default'))).sort();
        return NextResponse.json({
          accessible: true,
          fallbackToMock: true,
          contextName: `${requestedContext || settings.contextName || 'cluster'} (demo-fallback)`,
          namespaces: fallbackNamespaces,
          resources: MOCK_RESOURCES,
        });
      }

      return NextResponse.json({
        accessible: true,
        contextName: discovered?.contextName || requestedContext || 'cluster',
        namespaces: availableNamespaces,
        resources,
      });
    } catch (clusterErr) {
      logger.warn('Cluster unreachable during comparison check, falling back to mock fixtures', clusterErr);
      const fallbackNamespaces = Array.from(new Set(MOCK_RESOURCES.map(r => r.namespace || 'default'))).sort();
      return NextResponse.json({
        accessible: true,
        fallbackToMock: true,
        contextName: `${requestedContext || settings.contextName || 'cluster'} (demo-fallback)`,
        namespaces: fallbackNamespaces,
        resources: MOCK_RESOURCES,
      });
    }
  } catch (err) {
    logger.error('Unexpected error in /api/manifest-graph/compare', err);
    return NextResponse.json(
      {
        accessible: false,
        error: err instanceof Error ? err.message : 'Internal comparison server error',
        namespaces: [],
        resources: [],
      },
      { status: 500 }
    );
  }
}
