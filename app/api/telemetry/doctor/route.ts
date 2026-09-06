import { NextResponse } from 'next/server';
import { detectNetworkStack } from '@/lib/telemetry/hubble';

export async function POST(request: Request) {
  try {
    const settings = await request.json().catch(() => undefined);
    const status = await detectNetworkStack(settings);
    return NextResponse.json(status);
  } catch (error: unknown) {
    console.error('Failed to run telemetry doctor checks', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
