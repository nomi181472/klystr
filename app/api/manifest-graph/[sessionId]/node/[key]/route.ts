import { nodeDetail } from '@/lib/manifest-graph/serialize';
import { getSession } from '@/lib/manifest-graph/store';

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string; key: string }> }) {
  const { sessionId, key } = await context.params;
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: 'Graph session not found or expired.' }, { status: 404 });
  const node = session.nodeStore.get(decodeURIComponent(key));
  return node ? Response.json(nodeDetail(session, node)) : Response.json({ error: 'Resource node not found.' }, { status: 404 });
}
