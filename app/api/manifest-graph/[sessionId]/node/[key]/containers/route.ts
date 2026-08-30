import { getSession } from '@/lib/manifest-graph/store';

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string; key: string }> }) {
  const { sessionId, key } = await context.params;
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: 'Graph session not found or expired.' }, { status: 404 });
  const node = session.nodeStore.get(decodeURIComponent(key));
  if (!node) return Response.json({ error: 'Resource node not found.' }, { status: 404 });
  return Response.json({
    workloadRefs: { structuralRefs: node.structuralRefs.filter(ref => !ref.containerName), literalRefs: node.literalRefs.filter(ref => !ref.containerName) },
    containers: node.containers.map(container => ({
      ...container,
      structuralRefs: node.structuralRefs.filter(ref => ref.containerName === container.name && ref.containerRole === container.role),
      literalRefs: node.literalRefs.filter(ref => ref.containerName === container.name && ref.containerRole === container.role),
    })),
  });
}
