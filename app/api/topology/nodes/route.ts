import { NextResponse } from 'next/server';
import { MOCK_TOPOLOGY_NODES } from '@/lib/k8s/mock/fixtures';
import { discoverLiveNamespaces } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('topology/nodes');

type NodesRequest = Partial<ConnectionSettings>;

export async function GET(request: Request) {
  return handleNodes(request);
}

export async function POST(request: Request) {
  return handleNodes(request);
}

async function handleNodes(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedContext = url.searchParams.get('ctx') ?? undefined;
    let settings: NodesRequest | undefined;
    if (request.method === 'POST') {
      settings = await request.json().catch(() => undefined);
    }
    if (settings?.mode === 'mock') {
      return NextResponse.json({ topologyNodes: MOCK_TOPOLOGY_NODES, warnings: [], contextName: 'dev-cluster' });
    }
    if (settings?.mode !== 'live') return NextResponse.json({ error: 'A valid connection mode is required.' }, { status: 400 });

    const discovery = await discoverLiveNamespaces(requestedContext, settings);
    const nodeFailed = discovery.topologyNodes.length === 0
      && discovery.warnings.some(warning => warning.resourceType === 'Node' && warning.type !== 'info');
    return NextResponse.json({
      topologyNodes: discovery.topologyNodes,
      warnings: discovery.warnings,
      contextName: discovery.contextName,
      ...(nodeFailed ? { error: 'Kubernetes node discovery failed.' } : {}),
    }, { status: nodeFailed ? 502 : 200 });
  } catch (error) {
    logger.error('request failed', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Failed to fetch topology nodes' }, { status: 500 });
  }
}
