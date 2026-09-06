import { NextResponse } from 'next/server';
import { fetchLiveFlows } from '@/lib/telemetry/hubble';
import type { ConnectionSettings } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = body.settings as Partial<ConnectionSettings> | undefined;
    // Support single namespace, multiple namespaces, or undefined/all
    const namespaceFilter = body.namespaceFilter as string | string[] | undefined;

    const result = await fetchLiveFlows(namespaceFilter, settings);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Failed to fetch telemetry flows', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
