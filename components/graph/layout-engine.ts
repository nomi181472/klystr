import type { Node, Edge } from '@xyflow/react';
import type { NamespaceBoundaryState, TopologyNode } from '@/lib/types';

const NAMESPACE_PADDING = 32;
const NODE_WIDTH = 270;
const BASE_NODE_HEIGHT = 82;
const NODE_GAP_Y = 32;
const ATTACHMENT_WIDTH = 112;
const ATTACHMENT_DOCK_OVERLAP = 10;
const ATTACHMENT_OFFSET_X = ATTACHMENT_WIDTH - ATTACHMENT_DOCK_OVERLAP; // 102px
const ATTACHMENT_MIN_GAP = 28;

interface NamespaceLayoutOptions {
  direction: 'rows' | 'columns';
  count: number;
  namespaceStates?: Record<string, NamespaceBoundaryState>;
  onLoadNamespace?: (namespace: string) => void;
  onToggleNamespaceMetrics?: (namespace: string) => void;
  topologyNodes?: TopologyNode[];
}

function computeColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 4) return 2; // 2x2 grid is balanced and avoids horizontal crowding
  if (count <= 9) return 3;
  return 4;
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
  if (data.containers?.length) {
    height += data.containers.length * 52 + 12;
  } else if (data.podMetrics) {
    height += 36;
  }
  const attachedCount = data.attachedServiceCount ?? 0;
  if (attachedCount > 0) {
    const minHeightForAttachments = 16 + attachedCount * 36;
    if (minHeightForAttachments > height) {
      height = minHeightForAttachments;
    }
  }
  return height;
}

interface NamespaceEntry {
  id: string;
  namespace: string;
  nodeLabel: string;
  children: Node[];
  layoutChildren: Node[];
  state?: NamespaceBoundaryState;
  cols: number;
  rows: number;
  colX: number[];
  rowHeights: number[];
  rowY: number[];
  width: number;
  height: number;
}

function statusCounts(children: Node[]) {
  const uniqueChildren = [...new Map(children.map(child => [String(child.data.canonicalNodeId ?? child.id), child])).values()];
  return Object.fromEntries([...new Set(uniqueChildren.map(child => String(child.data.status ?? 'Unknown')))].map(status => [status, uniqueChildren.filter(child => String(child.data.status ?? 'Unknown') === status).length]));
}

const OUTER_PADDING = 32;
const BOUNDARY_GAP = 36;
const BOUNDARIES_PER_NODE = 2;

/** Node → namespace → resource hierarchy with stable, collision-free geometry. */
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
    const cols = computeColumns(layoutChildren.length);
    const rows = Math.ceil(layoutChildren.length / cols) || 1;

    const colHasAttachment = Array.from({ length: cols }, (_, c) =>
      layoutChildren.some((child, idx) => idx % cols === c && ((child.data.attachedServiceCount as number | undefined) ?? 0) > 0)
    );

    const colX: number[] = [];
    for (let c = 0; c < cols; c++) {
      if (c === 0) {
        colX[c] = colHasAttachment[0] ? NAMESPACE_PADDING + ATTACHMENT_OFFSET_X : NAMESPACE_PADDING;
      } else {
        const gap = colHasAttachment[c] ? ATTACHMENT_OFFSET_X + ATTACHMENT_MIN_GAP : 36;
        colX[c] = colX[c - 1] + NODE_WIDTH + gap;
      }
    }

    const rowHeights = Array.from({ length: rows }, (_, r) => {
      const rowChildren = layoutChildren.slice(r * cols, (r + 1) * cols);
      return Math.max(BASE_NODE_HEIGHT, ...rowChildren.map(estimatedNodeHeight));
    });

    const rowY: number[] = [];
    let currentY = NAMESPACE_PADDING + 46;
    for (let r = 0; r < rows; r++) {
      rowY[r] = currentY;
      currentY += rowHeights[r] + NODE_GAP_Y;
    }

    const width = Math.max((colX[cols - 1] ?? NAMESPACE_PADDING) + NODE_WIDTH + NAMESPACE_PADDING, 360);
    const height = Math.max(currentY - NODE_GAP_Y + NAMESPACE_PADDING, 180);

    return {
      id, namespace, nodeLabel, children: orderedChildren, layoutChildren,
      state: namespaceLayout.namespaceStates?.[namespace],
      cols, rows, colX, rowHeights, rowY, width, height,
    };
  });

  for (const namespace of namespaces) {
    if (representedNamespaces.has(namespace)) continue;
    namespaceEntries.push({
      id: `scope:${encodeURIComponent('Namespaces')}:${encodeURIComponent(namespace)}`,
      namespace, nodeLabel: 'Namespaces', children: [], layoutChildren: [], state: namespaceLayout.namespaceStates?.[namespace],
      cols: 1, rows: 1, colX: [NAMESPACE_PADDING], rowHeights: [BASE_NODE_HEIGHT], rowY: [NAMESPACE_PADDING + 46],
      width: 360, height: 180,
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
        x: outerColumnWidths.slice(0, outerColumn).reduce((sum, width) => sum + width + 60, 0),
        y: outerRowHeights.slice(0, outerRow).reduce((sum, height) => sum + height + 60, 0),
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

      entry.layoutChildren.forEach((child, childIndex) => {
        const childColumn = childIndex % entry.cols;
        const childRow = Math.floor(childIndex / entry.cols);
        child.position = {
          x: entry.colX[childColumn] ?? NAMESPACE_PADDING,
          y: entry.rowY[childRow] ?? (NAMESPACE_PADDING + 46),
        };
        child.zIndex = 5;
        allNodes.push(child);
      });

      const attachmentsByPod = new Map<string, number>();
      entry.children.filter(child => child.type === 'serviceAttachment').forEach(attachment => {
        const podId = String(attachment.data.attachedPodId ?? '');
        const pod = entry.layoutChildren.find(child => child.id === podId);
        if (!pod) return;
        const attachmentIndex = attachmentsByPod.get(podId) ?? 0;
        attachmentsByPod.set(podId, attachmentIndex + 1);
        attachment.position = {
          x: pod.position.x - ATTACHMENT_OFFSET_X,
          y: pod.position.y + 12 + attachmentIndex * 36,
        };
        attachment.zIndex = 10;
        allNodes.push(attachment);
      });
    });
  });

  const canvasWidth = outerColumnWidths.reduce((sum, width) => sum + width + 60, 0);
  orphans.forEach((node, i) => {
    node.position = { x: canvasWidth + i * (NODE_WIDTH + 36), y: 100 };
    allNodes.push(node);
  });

  return { nodes: allNodes, edges };
}
