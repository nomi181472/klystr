import { deleteSession, getSession } from '@/lib/manifest-graph/store';
import { fullGraph } from '@/lib/manifest-graph/serialize';

type Context = { params: Promise<{ sessionId: string }> };
export async function GET(_request: Request, context: Context) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);
  return session ? Response.json(fullGraph(session)) : Response.json({ error: 'Graph session not found or expired.' }, { status: 404 });
}
export async function DELETE(_request: Request, context: Context) {
  const { sessionId } = await context.params;
  return deleteSession(sessionId) ? new Response(null, { status: 204 }) : Response.json({ error: 'Graph session not found or expired.' }, { status: 404 });
}
