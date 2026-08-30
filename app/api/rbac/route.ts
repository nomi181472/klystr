import { NextResponse } from 'next/server';
import { defaultRbacNamespace, issueRbacToken, rbacInventory, saveRbacIdentity } from '@/lib/rbac/service';
import type { RbacIdentity } from '@/lib/rbac/types';
import type { ConnectionSettings } from '@/lib/types';

type RequestBody = Partial<ConnectionSettings> & {
  action?: 'inventory' | 'save' | 'token';
  namespace?: string;
  identity?: RbacIdentity;
  name?: string;
  durationSeconds?: number;
};

export async function POST(request: Request) {
  try {
    const context = new URL(request.url).searchParams.get('ctx') ?? undefined;
    const body = await request.json() as RequestBody;
    const namespace = body.namespace?.trim() || defaultRbacNamespace();
    const settings: Partial<ConnectionSettings> = body;

    if (body.action === 'save') {
      if (!body.identity) throw new Error('An RBAC identity is required.');
      await saveRbacIdentity(context, body.identity, settings);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'token') {
      if (!body.name) throw new Error('A ServiceAccount name is required.');
      return NextResponse.json(await issueRbacToken(context, namespace, body.name, body.durationSeconds ?? 600, settings));
    }
    return NextResponse.json(await rbacInventory(context, namespace, settings));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'RBAC request failed' }, { status: 500 });
  }
}
