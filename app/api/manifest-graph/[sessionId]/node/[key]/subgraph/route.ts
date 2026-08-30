import { allEdges } from '@/lib/manifest-graph/serialize';
import { getSession } from '@/lib/manifest-graph/store';

export async function GET(request: Request, context: { params: Promise<{ sessionId: string; key: string }> }) {
  const { sessionId, key } = await context.params;
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: 'Graph session not found or expired.' }, { status: 404 });
  const root = decodeURIComponent(key);
  if (!session.nodeStore.has(root)) return Response.json({ error: 'Resource node not found.' }, { status: 404 });
  const depth = Math.min(10, Math.max(0, Number(new URL(request.url).searchParams.get('depth') ?? 1) || 1));
  const visited = new Set([root]);
  let frontier = [root];
  for (let level = 0; level < depth && frontier.length; level += 1) {
    const next = new Set<string>();
    for (const current of frontier) {
      for (const edge of session.adjacencyOut.get(current) ?? []) if (!visited.has(edge.to)) next.add(edge.to);
      for (const edge of session.adjacencyIn.get(current) ?? []) if (!visited.has(edge.to)) next.add(edge.to);
    }
    for (const item of next) visited.add(item);
    frontier = [...next];
  }
  return Response.json({ nodes: [...visited].map(id => session.nodeStore.get(id)).filter(Boolean), edges: allEdges(session).filter(edge => visited.has(edge.from) && visited.has(edge.to)) });
}
