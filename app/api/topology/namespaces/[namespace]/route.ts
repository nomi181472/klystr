import { NextResponse } from 'next/server';
import { buildGraph } from '@/lib/graph/builder';
import { MOCK_RESOURCES } from '@/lib/k8s/mock/fixtures';
import { discoverLiveResources } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';
import type { K8sKind } from '@/config/resource-types';
import { applyMockLabelOverride, getMockLabelOverride } from '@/lib/k8s/mock/label-overrides';
import { createLogger } from '@/lib/logger';

const logger = createLogger('topology/namespaces');

const NAMESPACED_KINDS = new Set<K8sKind>([
  'Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob',
  'Service', 'Endpoints', 'EndpointSlice', 'Ingress', 'ConfigMap', 'Secret', 'ServiceAccount',
  'PersistentVolumeClaim', 'NetworkPolicy', 'HorizontalPodAutoscaler',
]);

const ALIAS_MAP: Record<string, K8sKind> = {
  pod: 'Pod',
  pods: 'Pod',
  svc: 'Service',
  service: 'Service',
  services: 'Service',
  ingress: 'Ingress',
  ingresses: 'Ingress',
  ing: 'Ingress',
  deploy: 'Deployment',
  deployment: 'Deployment',
  deployments: 'Deployment',
  sts: 'StatefulSet',
  statefulset: 'StatefulSet',
  statefulsets: 'StatefulSet',
  ds: 'DaemonSet',
  daemonset: 'DaemonSet',
  daemonsets: 'DaemonSet',
  rs: 'ReplicaSet',
  replicaset: 'ReplicaSet',
  replicasets: 'ReplicaSet',
  job: 'Job',
  jobs: 'Job',
  cronjob: 'CronJob',
  cronjobs: 'CronJob',
  cm: 'ConfigMap',
  configmap: 'ConfigMap',
  configmaps: 'ConfigMap',
  secret: 'Secret',
  secrets: 'Secret',
  sa: 'ServiceAccount',
  serviceaccount: 'ServiceAccount',
  serviceaccounts: 'ServiceAccount',
  pvc: 'PersistentVolumeClaim',
  persistentvolumeclaim: 'PersistentVolumeClaim',
  persistentvolumeclaims: 'PersistentVolumeClaim',
  netpol: 'NetworkPolicy',
  networkpolicy: 'NetworkPolicy',
  networkpolicies: 'NetworkPolicy',
  hpa: 'HorizontalPodAutoscaler',
  horizontalpodautoscaler: 'HorizontalPodAutoscaler',
  horizontalpodautoscalers: 'HorizontalPodAutoscaler',
  endpoints: 'Endpoints',
  endpointslice: 'EndpointSlice',
  endpointslices: 'EndpointSlice',
};

function parseResourceKinds(input: string | string[] | undefined): K8sKind[] {
  if (!input) return ['Pod', 'Service', 'Ingress'];
  const rawList = Array.isArray(input)
    ? input
    : input.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const kinds = new Set<K8sKind>();
  for (const item of rawList) {
    const lower = item.toLowerCase();
    if (ALIAS_MAP[lower]) {
      kinds.add(ALIAS_MAP[lower]);
    } else {
      // Find matching kind case-insensitively
      for (const validKind of NAMESPACED_KINDS) {
        if (validKind.toLowerCase() === lower) {
          kinds.add(validKind);
          break;
        }
      }
    }
  }

  return kinds.size > 0 ? [...kinds] : ['Pod', 'Service', 'Ingress'];
}

interface NamespaceRequest extends Partial<ConnectionSettings> {
  resources?: string | string[];
  resourceKinds?: K8sKind[];
  containerMetaphorDimensions?: number;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ namespace: string }> }
) {
  const params = await context.params;
  return handleNamespaceResources(request, params.namespace);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ namespace: string }> }
) {
  const params = await context.params;
  return handleNamespaceResources(request, params.namespace);
}

async function handleNamespaceResources(request: Request, namespaceName: string) {
  try {
    const url = new URL(request.url);
    const requestedContext = url.searchParams.get('ctx') ?? undefined;
    const queryResources = url.searchParams.get('resources');

    let body: NamespaceRequest | undefined;
    if (request.method === 'POST') {
      body = await request.json().catch(() => undefined);
    }

    const resourceKinds = parseResourceKinds(
      queryResources ?? body?.resources ?? body?.resourceKinds
    );

    if (body?.mode !== 'live' && body?.mode !== 'mock') {
      return NextResponse.json({ error: 'A valid connection mode is required.' }, { status: 400 });
    }
    const live = body.mode === 'live';
    const discovered = live
      ? await discoverLiveResources(requestedContext, body, { namespaces: [namespaceName], kinds: resourceKinds })
      : null;
    const allRequestedKindsFailed = live && discovered?.resources.length === 0
      && resourceKinds.every(kind => discovered.warnings.some(warning => warning.resourceType === kind && warning.type !== 'info'));
    if (allRequestedKindsFailed) {
      return NextResponse.json({
        error: `Kubernetes resource discovery failed for namespace ${namespaceName}.`,
        warnings: discovered?.warnings ?? [],
      }, { status: 502 });
    }

    const resourcesToUse = live ? discovered?.resources ?? [] : MOCK_RESOURCES;

    const resources = resourcesToUse.filter(resource => {
      return (
        resource.namespace === namespaceName &&
        resourceKinds.includes(resource.kind)
      );
    }).map(resource => {
      const override = getMockLabelOverride(resource.kind, resource.namespace, resource.name);
      return override ? { ...resource, labels: applyMockLabelOverride(resource.labels, override) } : resource;
    });

    const contextName = discovered?.contextName ?? requestedContext ?? 'dev-cluster';
    const graphData = buildGraph(
      resources,
      contextName,
      discovered?.warnings ?? [],
      body?.containerMetaphorDimensions ?? 32
    );

    graphData.namespaces = [namespaceName];
    graphData.namespaceStates = {
      [namespaceName]: {
        status: 'loaded',
        resourceCount: graphData.nodes.filter(node => node.namespace === namespaceName).length,
        metricsStatus: 'off',
      },
    };

    return NextResponse.json(graphData);
  } catch (error) {
    logger.error('request failed', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: `Failed to fetch resources for namespace ${namespaceName}` }, { status: 500 });
  }
}
