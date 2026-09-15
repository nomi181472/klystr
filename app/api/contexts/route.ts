import { NextResponse } from 'next/server';
import { MOCK_CONTEXTS } from '@/lib/k8s/mock/fixtures';
import { availableContexts, currentContextName } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';

export async function POST(request: Request) {
  const settings = (await request.json().catch(() => ({}))) as Partial<ConnectionSettings>;
  if (settings.mode === 'mock' && process.env.KLYSTR_DISABLE_MOCK !== 'true') {
    return NextResponse.json({ contexts: MOCK_CONTEXTS });
  }
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
  } catch (err: any) {
    return NextResponse.json({ contexts: [], error: err?.message || 'Unable to load kubeconfig contexts' }, { status: 503 });
  }
}
