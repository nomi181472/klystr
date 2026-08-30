import { NextResponse } from 'next/server';
import { removeConnection } from '@/lib/k8s/connection-registry';

export async function DELETE(request: Request) {
  const connectionId = new URL(request.url).searchParams.get('connectionId')?.trim();
  if (!connectionId) return NextResponse.json({ error: 'Connection ID is required.' }, { status: 400 });
  removeConnection(connectionId);
  return new Response(null, { status: 204 });
}
