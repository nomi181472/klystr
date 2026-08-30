/** Undirected N-hop neighborhood from a node, using graph edges as adjacency. */
export function getNeighborhood(
  centerId: string,
  edges: { id: string; source: string; target: string }[],
  hops: number,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const adj = new Map<string, { node: string; edgeId: string }[]>();
  for (const edge of edges) {
    const from = adj.get(edge.source) ?? [];
    from.push({ node: edge.target, edgeId: edge.id });
    adj.set(edge.source, from);
    const to = adj.get(edge.target) ?? [];
    to.push({ node: edge.source, edgeId: edge.id });
    adj.set(edge.target, to);
  }

  const nodeIds = new Set<string>([centerId]);
  const edgeIds = new Set<string>();
  let frontier = [centerId];

  for (let hop = 0; hop < hops; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const { node, edgeId } of adj.get(id) ?? []) {
        edgeIds.add(edgeId);
        if (!nodeIds.has(node)) {
          nodeIds.add(node);
          next.push(node);
        }
      }
    }
    frontier = next;
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeIds.add(edge.id);
    }
  }

  return { nodeIds, edgeIds };
}

/** Full directed reachability from a node in both dependency directions. */
export function getDirectionalNeighborhood(
  centerId: string,
  edges: { id: string; source: string; target: string }[],
): {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  incomingNodeIds: Set<string>;
  outgoingNodeIds: Set<string>;
} {
  const outgoing = new Map<string, { node: string; edgeId: string }[]>();
  const incoming = new Map<string, { node: string; edgeId: string }[]>();

  for (const edge of edges) {
    const outgoingEdges = outgoing.get(edge.source) ?? [];
    outgoingEdges.push({ node: edge.target, edgeId: edge.id });
    outgoing.set(edge.source, outgoingEdges);

    const incomingEdges = incoming.get(edge.target) ?? [];
    incomingEdges.push({ node: edge.source, edgeId: edge.id });
    incoming.set(edge.target, incomingEdges);
  }

  const walk = (adjacency: Map<string, { node: string; edgeId: string }[]>) => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const frontier = [centerId];

    while (frontier.length > 0) {
      const current = frontier.shift()!;
      for (const { node, edgeId } of adjacency.get(current) ?? []) {
        edgeIds.add(edgeId);
        if (node === centerId || nodeIds.has(node)) continue;
        nodeIds.add(node);
        frontier.push(node);
      }
    }

    return { nodeIds, edgeIds };
  };

  const incomingResult = walk(incoming);
  const outgoingResult = walk(outgoing);
  const nodeIds = new Set([centerId, ...incomingResult.nodeIds, ...outgoingResult.nodeIds]);
  const edgeIds = new Set([...incomingResult.edgeIds, ...outgoingResult.edgeIds]);

  // Include edges between nodes reached through opposite directions.
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) edgeIds.add(edge.id);
  }

  return {
    nodeIds,
    edgeIds,
    incomingNodeIds: incomingResult.nodeIds,
    outgoingNodeIds: outgoingResult.nodeIds,
  };
}

export function searchGraphNodes<T extends {
  id: string;
  name: string;
  kind: string;
  namespace: string | null;
  metadata?: { ip?: string; labels?: Record<string, string> };
}>(nodes: T[], query: string, limit = 80): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  }

  const scored: { node: T; score: number }[] = [];
  for (const node of nodes) {
    const name = node.name.toLowerCase();
    const ns = (node.namespace ?? '').toLowerCase();
    const kind = node.kind.toLowerCase();
    const ip = (node.metadata?.ip ?? '').toLowerCase();
    const labels = Object.entries(node.metadata?.labels ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
      .toLowerCase();

    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 50;
    if (ns.includes(q)) score += 20;
    if (kind.includes(q)) score += 15;
    if (ip.includes(q)) score += 25;
    if (labels.includes(q)) score += 10;
    if (node.id.toLowerCase().includes(q)) score += 5;

    if (score > 0) scored.push({ node, score });
  }

  scored.sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name));
  return scored.slice(0, limit).map(item => item.node);
}
