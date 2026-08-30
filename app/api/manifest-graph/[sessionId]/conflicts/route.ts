import { getSession } from '@/lib/manifest-graph/store';

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);
  return session ? Response.json({ conflicts: [...session.conflicts.values()].flat() }) : Response.json({ error: 'Graph session not found or expired.' }, { status: 404 });
}
