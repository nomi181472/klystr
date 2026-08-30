import type { Node, Edge } from '@xyflow/react';
import type { NamespaceBoundaryState, TopologyNode } from '@/lib/types';

const NAMESPACE_PADDING = 36;
const NODE_WIDTH = 220;
const BASE_NODE_HEIGHT = 82;
const NODE_GAP_X = 28;
const NODE_GAP_Y = 28;
const COLS_PER_NAMESPACE = 3;

interface NamespaceLayoutOptions {
  direction: 'rows' | 'columns';
  count: number;
  namespaceStates?: Record<string, NamespaceBoundaryState>;
  onLoadNamespace?: (namespace: string) => void;
  onToggleNamespaceMetrics?: (namespace: string) => void;
  topologyNodes?: TopologyNode[];
}

function estimatedNodeHeight(node: Node) {
  const data = node.data as {
    ports?: unknown[];
    podMetrics?: unknown;
    attachedServiceCount?: number;
    containers?: unknown[];
  };
  let height = BASE_NODE_HEIGHT;
  if (data.ports?.length) height += 22;
  if (data.containers?.length) height += data.containers.length * 54 + 8;
  else if (data.podMetrics) height += 35;
  if ((data.attachedServiceCount ?? 0) > 1) height += ((data.attachedServiceCount ?? 1) - 1) * 36;
  return height;
}

function heightsByRow(children: Node[], cols: number) {
  const rows = Math.ceil(children.length / cols) || 1;
  return Array.from({ length: rows }, (_, row) => Math.max(
    BASE_NODE_HEIGHT,
    ...children.slice(row * cols, (row + 1) * cols).map(estimatedNodeHeight),
  ));
}

interface NamespaceEntry {
  id: string;
  namespace: string;
  nodeLabel: string;
  children: Node[];
  state?: NamespaceBoundaryState;
  rowHeights: number[];
  width: number;
  height: number;
}

function statusCounts(children: Node[]) {
  const uniqueChildren = [...new Map(children.map(child => [String(child.data.canonicalNodeId ?? child.id), child])).values()];
  return Object.fromEntries([...new Set(uniqueChildren.map(child => String(child.data.status ?? 'Unknown')))].map(status => [status, uniqueChildren.filter(child => String(child.data.status ?? 'Unknown') === status).length]));
}

const OUTER_PADDING = 34;
const BOUNDARY_GAP = 30;
const BOUNDARIES_PER_NODE = 2;

/** Node → namespace → resource hierarchy with stable, fixed boundary identities. */
export function computeLayout(
  nodes: Node[],
  edges: Edge[],
  namespaces: string[],
  namespaceLayout: NamespaceLayoutOptions = { direction: 'rows', count: 1 }
): { nodes: Node[]; edges: Edge[] } {
  const groups = new Map<string, Node[]>();
  const orphans: Node[] = [];

  for (const node of nodes) {
    const parentId = node.parentId as string | undefined;
    if (parentId) {
      if (!groups.has(parentId)) groups.set(parentId, []);
      groups.get(parentId)!.push(node);
    } else {
      orphans.push(node);
    }
  }

  const representedNamespaces = new Set<string>();
  const namespaceEntries: NamespaceEntry[] = [...groups.entries()].map(([id, children]) => {
    const firstData = children[0]?.data as { namespace?: string; boundaryNodeName?: string } | undefined;
    const namespace = firstData?.namespace ?? 'external';
    const nodeLabel = firstData?.boundaryNodeName ?? 'Logical resources';
    if (namespace !== 'external') representedNamespaces.add(namespace);
    const orderedChildren = [...children].sort((left, right) => String(left.data.kind ?? '').localeCompare(String(right.data.kind ?? '')) || left.id.localeCompare(right.id));
    const layoutChildren = orderedChildren.filter(child => child.type !== 'serviceAttachment');
    const cols = Math.min(layoutChildren.length, COLS_PER_NAMESPACE) || 1;
    const rowHeights = heightsByRow(layoutChildren, cols);
    return {
      id, namespace, nodeLabel, children: orderedChildren,
      state: namespaceLayout.namespaceStates?.[namespace], rowHeights,
      width: Math.max(cols * (NODE_WIDTH + NODE_GAP_X) + NAMESPACE_PADDING * 2, 360),
      height: rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * NODE_GAP_Y + NAMESPACE_PADDING * 2 + 56,
    };
  });
  for (const namespace of namespaces) {
    if (representedNamespaces.has(namespace)) continue;
    namespaceEntries.push({
      id: `scope:${encodeURIComponent('Namespaces')}:${encodeURIComponent(namespace)}`,
      namespace, nodeLabel: 'Namespaces', children: [], state: namespaceLayout.namespaceStates?.[namespace],
      rowHeights: [BASE_NODE_HEIGHT], width: 360, height: 180,
    });
  }
  namespaceEntries.sort((left, right) => left.nodeLabel.localeCompare(right.nodeLabel) || left.namespace.localeCompare(right.namespace));

  const byNode = new Map<string, NamespaceEntry[]>();
  for (const node of namespaceLayout.topologyNodes ?? []) byNode.set(node.name, []);
  for (const entry of namespaceEntries) byNode.set(entry.nodeLabel, [...(byNode.get(entry.nodeLabel) ?? []), entry]);
  const nodeEntries = [...byNode.entries()].map(([label, boundaries]) => {
    const columns = Math.min(BOUNDARIES_PER_NODE, boundaries.length) || 1;
    const rows = Math.ceil(boundaries.length / columns);
    const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...boundaries.filter((_, index) => index % columns === column).map(entry => entry.width), 360));
    const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...boundaries.filter((_, index) => Math.floor(index / columns) === row).map(entry => entry.height), 180));
    return {
      label, boundaries, columns, columnWidths, rowHeights,
      width: columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * BOUNDARY_GAP + OUTER_PADDING * 2,
      height: rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * BOUNDARY_GAP + OUTER_PADDING * 2 + 20,
    };
  });

  const outerCount = Math.max(1, Math.min(namespaceLayout.count, nodeEntries.length));
  const outerColumns = namespaceLayout.direction === 'rows' ? Math.ceil(nodeEntries.length / outerCount) : outerCount;
  const outerRows = Math.ceil(nodeEntries.length / outerColumns);
  const outerColumnWidths = Array.from({ length: outerColumns }, (_, column) => Math.max(...nodeEntries.filter((_, index) => index % outerColumns === column).map(entry => entry.width), 0));
  const outerRowHeights = Array.from({ length: outerRows }, (_, row) => Math.max(...nodeEntries.filter((_, index) => Math.floor(index / outerColumns) === row).map(entry => entry.height), 0));

  const allNodes: Node[] = [];
  nodeEntries.forEach((nodeEntry, nodeIndex) => {
    const outerRow = Math.floor(nodeIndex / outerColumns);
    const outerColumn = nodeIndex % outerColumns;
    const nodeId = `node-boundary:${encodeURIComponent(nodeEntry.label)}`;
    allNodes.push({
      id: nodeId, type: 'nodeGroup',
      position: {
        x: outerColumnWidths.slice(0, outerColumn).reduce((sum, width) => sum + width + 50, 0),
        y: outerRowHeights.slice(0, outerRow).reduce((sum, height) => sum + height + 50, 0),
      },
      data: {
        label: nodeEntry.label,
        namespaceCount: nodeEntry.boundaries.length,
        role: namespaceLayout.topologyNodes?.find(node => node.name === nodeEntry.label)?.role ?? 'unknown',
        status: namespaceLayout.topologyNodes?.find(node => node.name === nodeEntry.label)?.status,
        statusCounts: statusCounts(nodeEntry.boundaries.flatMap(boundary => boundary.children)),
        layoutSignature: nodeEntry.boundaries.map(boundary => `${boundary.id}:${boundary.width}x${boundary.height}`).join('|'),
      },
      style: { width: nodeEntry.width, height: nodeEntry.height }, zIndex: 0, draggable: true, dragHandle: '.boundary-drag-handle', selectable: false,
    });
    nodeEntry.boundaries.forEach((entry, boundaryIndex) => {
      const column = boundaryIndex % nodeEntry.columns;
      const row = Math.floor(boundaryIndex / nodeEntry.columns);
      const uniqueChildren = [...new Map(entry.children.map(child => [String(child.data.canonicalNodeId ?? child.id), child])).values()];
      const kindCounts = Object.fromEntries([...new Set(uniqueChildren.map(child => String(child.data.kind ?? 'Resource')))].map(kind => [kind, uniqueChildren.filter(child => child.data.kind === kind).length]));
      allNodes.push({
        id: entry.id, type: 'namespaceGroup', parentId: nodeId, extent: 'parent',
        position: {
          x: OUTER_PADDING + nodeEntry.columnWidths.slice(0, column).reduce((sum, width) => sum + width + BOUNDARY_GAP, 0),
          y: OUTER_PADDING + 20 + nodeEntry.rowHeights.slice(0, row).reduce((sum, height) => sum + height + BOUNDARY_GAP, 0),
        },
        data: {
          label: entry.namespace, resourceCount: uniqueChildren.length,
          status: entry.state?.status ?? (entry.children.length ? 'loaded' : 'unloaded'), error: entry.state?.error,
          metricsStatus: entry.state?.metricsStatus ?? 'off', metricsError: entry.state?.metricsError,
          kindCounts, statusCounts: statusCounts(entry.children),
          onLoad: entry.namespace === 'external' ? undefined : () => namespaceLayout.onLoadNamespace?.(entry.namespace),
          onToggleMetrics: entry.namespace === 'external' ? undefined : () => namespaceLayout.onToggleNamespaceMetrics?.(entry.namespace),
        },
        style: { width: entry.width, height: entry.height }, zIndex: 0, draggable: true, dragHandle: '.boundary-drag-handle', selectable: false,
      });
      const layoutChildren = entry.children.filter(child => child.type !== 'serviceAttachment');
      const cols = Math.min(layoutChildren.length, COLS_PER_NAMESPACE) || 1;
      layoutChildren.forEach((child, childIndex) => {
        const childColumn = childIndex % cols;
        const childRow = Math.floor(childIndex / cols);
        child.position = {
          x: NAMESPACE_PADDING + childColumn * (NODE_WIDTH + NODE_GAP_X),
          y: NAMESPACE_PADDING + 54 + entry.rowHeights.slice(0, childRow).reduce((sum, height) => sum + height + NODE_GAP_Y, 0),
        };
        child.zIndex = 5;
        allNodes.push(child);
      });
      const attachmentsByPod = new Map<string, number>();
      entry.children.filter(child => child.type === 'serviceAttachment').forEach(attachment => {
        const podId = String(attachment.data.attachedPodId ?? '');
        const pod = layoutChildren.find(child => child.id === podId);
        if (!pod) return;
        const attachmentIndex = attachmentsByPod.get(podId) ?? 0;
        attachmentsByPod.set(podId, attachmentIndex + 1);
        attachment.position = {
          x: pod.position.x - 24,
          y: pod.position.y + 35 + attachmentIndex * 36,
        };
        attachment.zIndex = 7;
        allNodes.push(attachment);
      });
    });
  });

  const canvasWidth = outerColumnWidths.reduce((sum, width) => sum + width + 60, 0);
  orphans.forEach((node, i) => {
    node.position = { x: canvasWidth + i * (NODE_WIDTH + NODE_GAP_X), y: 100 };
    allNodes.push(node);
  });

  return { nodes: allNodes, edges };
}
