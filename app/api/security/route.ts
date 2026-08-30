import { NextResponse } from 'next/server';
import { buildSecuritySnapshot, runReadOnlySecurityTests } from '@/lib/security/service';
import { buildSampleSecuritySnapshot, runSampleSecurityTests } from '@/lib/security/sample';
import type { ConnectionSettings } from '@/lib/types';

type Body = Partial<ConnectionSettings> & { action?: 'snapshot' | 'test'; testIds?: string[]; namespace?: string };

export async function POST(request: Request) {
  try {
    const context = new URL(request.url).searchParams.get('ctx') ?? undefined;
    const body = await request.json() as Body;
    if (body.mode === 'mock') return NextResponse.json(body.action === 'test' ? runSampleSecurityTests((body.testIds ?? []).slice(0, 10), body.namespace?.trim() || 'default') : buildSampleSecuritySnapshot());
    if (body.mode !== 'live') return NextResponse.json({ error: 'A valid connection mode is required.' }, { status: 400 });
    if (body.action === 'test') return NextResponse.json(await runReadOnlySecurityTests(context, (body.testIds ?? []).slice(0, 10), body.namespace?.trim() || 'default', body));
    return NextResponse.json(await buildSecuritySnapshot(context, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Security assessment failed' }, { status: 500 });
  }
}
