import { NextResponse } from 'next/server';
import { MOCK_RESOURCES } from '@/lib/k8s/mock/fixtures';
import { discoverLiveNamespaces } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('topology/namespaces');

type NamespacesRequest = Partial<ConnectionSettings>;

export async function GET(request: Request) {
  return handleNamespaces(request);
}

export async function POST(request: Request) {
  return handleNamespaces(request);
}

async function handleNamespaces(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedContext = url.searchParams.get('ctx') ?? undefined;
    let settings: NamespacesRequest | undefined;
    if (request.method === 'POST') {
      settings = await request.json().catch(() => undefined);
    }
    const mockNamespaces = MOCK_RESOURCES
      .filter(resource => resource.kind === 'Namespace')
      .map(resource => resource.name)
      .sort();

    if (settings?.mode === 'mock' && process.env.KLYSTR_DISABLE_MOCK !== 'true') {
      return NextResponse.json({ namespaces: mockNamespaces, warnings: [], contextName: 'dev-cluster' });
    }
    if (settings?.mode !== 'live' && process.env.KLYSTR_DISABLE_MOCK !== 'true') return NextResponse.json({ error: 'A valid connection mode is required.' }, { status: 400 });

    const discovery = await discoverLiveNamespaces(requestedContext, settings);
    const namespaceFailed = discovery.namespaces.length === 0
      && discovery.warnings.some(warning => warning.resourceType === 'Namespace' && warning.type !== 'info');
    return NextResponse.json({
      namespaces: discovery.namespaces,
      warnings: discovery.warnings,
      contextName: discovery.contextName,
      ...(namespaceFailed ? { error: 'Kubernetes namespace discovery failed.' } : {}),
    }, { status: namespaceFailed ? 502 : 200 });
  } catch (error) {
    logger.error('request failed', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Failed to fetch namespaces' }, { status: 500 });
  }
}
