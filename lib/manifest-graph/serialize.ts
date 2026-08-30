import type { ManifestGraphSession, ResourceNode } from './types';

function safeNode(node: ResourceNode): ResourceNode {
  if (node.kind !== 'Secret') return node;
  const redact = (values: unknown) => values && typeof values === 'object'
    ? Object.fromEntries(Object.keys(values as Record<string, unknown>).map(key => [key, '<redacted>']))
    : values;
  return {
    ...node,
    raw: { ...node.raw, data: redact(node.raw.data), stringData: redact(node.raw.stringData) },
    literalRefs: node.literalRefs.map(ref => ({ ...ref, rawValue: '<redacted secret value>' })),
  };
}

export function allEdges(session: ManifestGraphSession) {
  return [...session.adjacencyOut].flatMap(([from, edges]) => edges.map(edge => ({ from, ...edge })));
}

export function nodeDetail(session: ManifestGraphSession, node: ResourceNode) {
  return {
    ...safeNode(node),
    outgoingEdges: session.adjacencyOut.get(node.key) ?? [],
    incomingEdges: session.adjacencyIn.get(node.key) ?? [],
  };
}

export function fullGraph(session: ManifestGraphSession) {
  return {
    sessionId: session.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    nodes: [...session.nodeStore.values()].map(safeNode),
    edges: allEdges(session),
  };
}
