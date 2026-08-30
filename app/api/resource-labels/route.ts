import { NextResponse } from 'next/server';
import { kubernetesErrorStatus, patchResourceLabels, reviewLabelPermission } from '@/lib/k8s/discovery';
import type { ConnectionSettings, LabelPermissionResponse } from '@/lib/types';
import { setMockLabelOverride } from '@/lib/k8s/mock/label-overrides';

interface LabelRequest extends Partial<ConnectionSettings> {
  kind: string;
  name: string;
  namespace: string | null;
  labels?: Record<string, string | null>;
}

function safeMessage(status: number | undefined, fallback: string) {
  if (status === 401) return 'Kubernetes could not authenticate this identity. Check the token or kubeconfig credentials.';
  if (status === 403) return 'This identity is forbidden from changing labels on this resource.';
  return fallback;
}

export async function POST(request: Request) {
  const context = new URL(request.url).searchParams.get('ctx') ?? undefined;
  try {
    const body = await request.json() as LabelRequest;
    if (!body.kind || !body.name) return NextResponse.json({ error: 'Resource kind and name are required.' }, { status: 400 });
    if (body.mode === 'mock') {
      return NextResponse.json({
        allowed: true, contextName: 'mock-context', command: 'mock: permission granted', grantCommands: [],
      } satisfies LabelPermissionResponse);
    }
    const result = await reviewLabelPermission(context, body.kind, body.name, body.namespace, body);
    return NextResponse.json(result, { status: result.allowed ? 200 : 403 });
  } catch (error) {
    const status = kubernetesErrorStatus(error);
    const responseStatus = status === 401 ? 401 : status === 403 ? 403 : 500;
    return NextResponse.json({
      allowed: false, contextName: context ?? 'current', command: '', grantCommands: [], status: responseStatus,
      error: safeMessage(status, error instanceof Error ? error.message : 'Unable to check label permission'),
    } satisfies LabelPermissionResponse, { status: responseStatus });
  }
}

export async function PATCH(request: Request) {
  const context = new URL(request.url).searchParams.get('ctx') ?? undefined;
  try {
    const body = await request.json() as LabelRequest;
    if (!body.kind || !body.name || !body.labels) return NextResponse.json({ error: 'Resource and labels are required.' }, { status: 400 });
    if (body.mode === 'mock') setMockLabelOverride(body.kind, body.namespace, body.name, body.labels);
    else await patchResourceLabels(context, body.kind, body.name, body.namespace, body.labels, body);
    return NextResponse.json({ updated: true });
  } catch (error) {
    const status = kubernetesErrorStatus(error);
    const responseStatus = status === 401 ? 401 : status === 403 ? 403 : 500;
    return NextResponse.json({ error: safeMessage(status, error instanceof Error ? error.message : 'Unable to update labels'), status: responseStatus }, { status: responseStatus });
  }
}
