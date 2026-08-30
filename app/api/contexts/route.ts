import { NextResponse } from 'next/server';
import { MOCK_CONTEXTS } from '@/lib/k8s/mock/fixtures';
import { availableContexts, currentContextName } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';

export async function POST(request: Request) {
  const settings = await request.json() as Partial<ConnectionSettings>;
  if (settings.mode === 'mock') return NextResponse.json({ contexts: MOCK_CONTEXTS });
  try {
    const active = currentContextName(settings);
    const contexts = availableContexts(settings).map(context => ({
      name: context.name,
      cluster: context.cluster,
      user: context.user,
      namespace: context.namespace,
      isActive: context.name === active,
    }));
    return NextResponse.json({ contexts });
  } catch {
    return NextResponse.json({ contexts: [], error: 'Unable to load kubeconfig contexts' }, { status: 503 });
  }
}
