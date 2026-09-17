import { NextResponse } from 'next/server';
import { discoverLiveNamespaces, discoverLiveResources } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';
import type { K8sKind } from '@/config/resource-types';

const COMPARE_KINDS: K8sKind[] = [
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Service',
  'Ingress',
  'ConfigMap',
  'Secret',
  'PersistentVolumeClaim',
  'HorizontalPodAutoscaler',
  'Job',
  'CronJob',
  'NetworkPolicy',
  'ServiceAccount',
  'Pod',
];

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedContext = searchParams.get('ctx') || undefined;

    const body = await request.json().catch(() => ({}));
    const settings: Partial<ConnectionSettings> = {
      mode: body.mode || 'live',
      clusterUrl: body.clusterUrl || '',
      connectionId: body.connectionId || undefined,
      token: body.token || undefined,
      skipTlsVerify: body.skipTlsVerify || false,
    };

    const targetNamespaces: string[] | undefined = Array.isArray(body.namespaces) && body.namespaces.length > 0
      ? body.namespaces
      : undefined;

    let namespaces = targetNamespaces;
    let contextName = requestedContext || 'default';

    // 1. Discover live namespaces
    try {
      const liveNs = await discoverLiveNamespaces(requestedContext, settings);
      if (!namespaces || namespaces.length === 0) {
        namespaces = liveNs.namespaces && liveNs.namespaces.length > 0 ? liveNs.namespaces : ['default'];
      }
      contextName = liveNs.contextName || contextName;
    } catch {
      if (!namespaces || namespaces.length === 0) {
        namespaces = ['default'];
      }
    }

    // 2. Query live resources
    const discovered = await discoverLiveResources(requestedContext, settings, {
      kinds: COMPARE_KINDS,
      namespaces,
    });

    return NextResponse.json({
      accessible: true,
      contextName: discovered.contextName || contextName,
      namespaces,
      resources: discovered.resources || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cluster connection error';
    return NextResponse.json(
      {
        accessible: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
