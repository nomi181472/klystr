import { NextResponse } from 'next/server';
import { getRuntimePlugins } from '@/lib/plugins/runtime-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ plugins: await getRuntimePlugins() });
}
