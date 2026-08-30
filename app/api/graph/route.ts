import { NextResponse } from 'next/server';
import { buildGraph } from '@/lib/graph/builder';
import { MOCK_RESOURCES, MOCK_TOPOLOGY_NODES } from '@/lib/k8s/mock/fixtures';
import { discoverLiveNamespaces, discoverLiveResources } from '@/lib/k8s/discovery';
import type { ConnectionSettings, GraphData } from '@/lib/types';
import type { K8sKind } from '@/config/resource-types';
import { applyMockLabelOverride, getMockLabelOverride } from '@/lib/k8s/mock/label-overrides';
import { createLogger } from '@/lib/logger';

const logger = createLogger('graph');

const NAMESPACED_KINDS = new Set<K8sKind>([
  'Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob',
  'Service', 'Endpoints', 'EndpointSlice', 'Ingress', 'ConfigMap', 'Secret', 'ServiceAccount',
  'PersistentVolumeClaim', 'NetworkPolicy', 'HorizontalPodAutoscaler',
]);

interface GraphRequest extends Partial<ConnectionSettings> {
  containerMetaphorDimensions?: number;
  podMetaphorDimensions?: number;
  phase?: 'namespaces' | 'namespace' | 'full';
  namespaces?: string[];
  resourceKinds?: K8sKind[];
}

export async function GET(request: Request) {
  return handleGraph(request);
}

export async function POST(request: Request) {
  return handleGraph(request);
}

async function handleGraph(request: Request) {
  try {
    const requestedContext = new URL(request.url).searchParams.get('ctx') ?? undefined;
    const settings = request.method === 'POST'
      ? await request.json() as GraphRequest
      : undefined;
    if (settings?.mode !== 'live' && settings?.mode !== 'mock') {
      return NextResponse.json({ error: 'A valid connection mode is required.' }, { status: 400 });
    }
    const live = settings.mode === 'live';
    logger.info('request received', {
      method: request.method,
      mode: live ? 'live' : 'mock',
      context: requestedContext ?? 'current',
      requestClusterConfigured: Boolean(settings?.clusterUrl),
      serverConnectionConfigured: Boolean(settings?.connectionId),
    });
    const phase = settings?.phase ?? 'full';
    if (phase === 'namespaces') {
      const discovery = live
        ? await discoverLiveNamespaces(requestedContext, settings)
        : {
            namespaces: MOCK_RESOURCES.filter(resource => resource.kind === 'Namespace').map(resource => resource.name).sort(),
          topologyNodes: MOCK_TOPOLOGY_NODES,
            warnings: [],
            contextName: requestedContext ?? 'dev-cluster',
          };
      const response: GraphData = {
        nodes: [],
        edges: [],
        namespaces: discovery.namespaces,
        topologyNodes: discovery.topologyNodes,
        namespaceStates: Object.fromEntries(discovery.namespaces.map(namespace => [namespace, { status: 'unloaded', resourceCount: 0, metricsStatus: 'off' }])),
        warnings: discovery.warnings,
        timestamp: new Date().toISOString(),
        contextName: discovery.contextName,
      };
      return NextResponse.json(response);
    }

    const namespaces = [...new Set((settings?.namespaces ?? []).map(namespace => namespace.trim()).filter(Boolean))].slice(0, 20);
    const resourceKinds = [...new Set<K8sKind>(settings?.resourceKinds ?? ['Pod', 'Service', 'Ingress'])]
      .filter((kind): kind is K8sKind => NAMESPACED_KINDS.has(kind));
    if (phase === 'namespace' && namespaces.length === 0) {
      return NextResponse.json({ error: 'At least one namespace is required.' }, { status: 400 });
    }
    const discovered = live
      ? await discoverLiveResources(requestedContext, settings, phase === 'namespace' ? { namespaces, kinds: resourceKinds } : undefined)
      : null;
    const resources = (discovered?.resources ?? MOCK_RESOURCES).filter(resource => {
      if (phase !== 'namespace') return true;
      return resource.namespace !== null && namespaces.includes(resource.namespace) && resourceKinds.includes(resource.kind);
    }).map(resource => {
      const override = getMockLabelOverride(resource.kind, resource.namespace, resource.name);
      return override ? { ...resource, labels: applyMockLabelOverride(resource.labels, override) } : resource;
    });
    const contextName = discovered?.contextName ?? requestedContext ?? 'dev-cluster';

    const graphData = buildGraph(resources, contextName, discovered?.warnings ?? [], settings?.containerMetaphorDimensions ?? settings?.podMetaphorDimensions ?? 32);
    if (phase === 'namespace') {
      graphData.namespaces = namespaces;
      graphData.namespaceStates = Object.fromEntries(namespaces.map(namespace => [namespace, {
        status: 'loaded' as const,
        resourceCount: graphData.nodes.filter(node => node.namespace === namespace).length,
        metricsStatus: 'off' as const,
      }]));
    }
    logger.info('response ready', {
      context: contextName,
      resources: graphData.nodes.length,
      edges: graphData.edges.length,
      warnings: graphData.warnings.length,
    });

    return NextResponse.json(graphData);
  } catch (error) {
    logger.error('request failed', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to build graph' },
      { status: 500 }
    );
  }
}
