import { NextResponse } from 'next/server';
import { readAllPodMetrics } from '@/lib/k8s/discovery';
import { MOCK_POD_METRICS } from '@/lib/k8s/mock/fixtures';
import type { ConnectionSettings } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const context = params.get('ctx') ?? undefined;
    const namespace = params.get('namespace')?.trim() || undefined;
    const settings = await request.json() as Partial<ConnectionSettings>;

    if (settings.mode === 'mock') {
      return NextResponse.json(namespace ? {
        ...MOCK_POD_METRICS,
        metrics: Object.fromEntries(Object.entries(MOCK_POD_METRICS.metrics).filter(([key]) => key.startsWith(`${namespace}/`))),
      } : MOCK_POD_METRICS);
    }

    const result = await readAllPodMetrics(context, settings, namespace);
    return NextResponse.json(result, { status: result.available ? 200 : 403 });
  } catch (error) {
    return NextResponse.json({
      available: false,
      metrics: {},
      error: error instanceof Error ? error.message : 'Unable to check Pod metrics permission',
    }, { status: 500 });
  }
}
