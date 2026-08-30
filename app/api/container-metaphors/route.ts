import { NextResponse } from 'next/server';
import { MOCK_RESOURCES } from '@/lib/k8s/mock/fixtures';
import { discoverLiveResources } from '@/lib/k8s/discovery';
import { detectContainerMetaphor } from '@/lib/graph/pod-metaphor';
import type { ConnectionSettings } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('container-metaphors');

export async function POST(request: Request) {
  try {
    const requestedContext = new URL(request.url).searchParams.get('ctx') ?? undefined;
    const settings = await request.json() as Partial<ConnectionSettings> & { containerMetaphorDimensions?: number; namespaces?: string[] };
    if (settings?.mode !== 'live' && settings?.mode !== 'mock') {
      return NextResponse.json({ error: 'A valid connection mode is required.' }, { status: 400 });
    }
    const live = settings.mode === 'live';
    const namespaces = [...new Set(settings.namespaces?.filter(Boolean) ?? [])].slice(0, 20);
    const resources = namespaces.length === 0
      ? []
      : live
        ? (await discoverLiveResources(requestedContext, settings, { namespaces, kinds: ['Pod'] })).resources
        : MOCK_RESOURCES.filter(resource => resource.kind === 'Pod' && resource.namespace && namespaces.includes(resource.namespace));
    const dimensions = settings.containerMetaphorDimensions ?? 32;
    const metaphors = Object.fromEntries(resources
      .filter(resource => resource.kind === 'Pod')
      .map(resource => [resource.uid, Object.fromEntries((resource.containers ?? [])
        .map(container => [container.name, detectContainerMetaphor(container, dimensions) ?? null]))]));
    return NextResponse.json({ metaphors });
  } catch (error) {
    logger.error('request failed', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Failed to classify container metaphors' }, { status: 500 });
  }
}
