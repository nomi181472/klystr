import { NextResponse } from 'next/server';
import { reviewCurrentPermissions } from '@/lib/k8s/discovery';
import { MATRIX_VERBS, PERMISSION_TARGETS, SENSITIVE_CHECKS } from '@/lib/k8s/permission-catalog';
import type { ConnectionSettings, PermissionCheck, PermissionsResponse } from '@/lib/types';

function mockPermissions(namespace: string): PermissionsResponse {
  const checks: Record<string, PermissionCheck> = {};
  for (const target of PERMISSION_TARGETS) {
    for (const verb of [...MATRIX_VERBS, 'update'] as const) {
      const id = `${target.id}.${verb}`;
      checks[id] = { id, allowed: true };
    }
    for (const special of target.special ?? []) checks[special.id] = { id: special.id, allowed: true };
  }
  for (const check of SENSITIVE_CHECKS) checks[check.id] = { id: check.id, allowed: true };
  return { checks, contextName: 'mock-context', namespace, checkedAt: new Date().toISOString(), source: 'mock' };
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const context = url.searchParams.get('ctx') ?? undefined;
    const namespace = url.searchParams.get('namespace')?.trim() || '*';
    const settings = await request.json() as Partial<ConnectionSettings>;
    const result = settings.mode === 'mock'
      ? mockPermissions(namespace)
      : await reviewCurrentPermissions(context, namespace, settings);
    return NextResponse.json({ ...result, source: settings.mode === 'live' ? 'live' : 'mock' });
  } catch (error) {
    return NextResponse.json({
      checks: {},
      contextName: 'unknown',
      namespace: 'default',
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unable to fetch Kubernetes permissions',
    } satisfies PermissionsResponse, { status: 500 });
  }
}
