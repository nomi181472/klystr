import React, { useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type NodeProps,
  type EdgeProps,
  type Node,
  type Edge,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Layers, ArrowUpRight, ArrowDownLeft, ArrowRight } from 'lucide-react';
import type { PodNodeData, WorkloadBoundaryData, MetricEdgeData, TelemetryMetricType, HeatmapConfig } from '@/lib/telemetry/mock-data';
import { DEFAULT_HEATMAP_CONFIG, METRIC_THRESHOLD_METAS } from '@/lib/telemetry/mock-data';
import type { AggregationMethod, EdgeMetricsState } from './LiveNetworkingView';
import { HeatmapBar } from './HeatmapBar';

// --- Custom Workload Boundary Node ---
export type WorkloadBoundaryNodeType = Node<WorkloadBoundaryData, 'workloadBoundary'>;

function WorkloadBoundaryNode({ data }: NodeProps<WorkloadBoundaryNodeType>) {
  return (
    <div
      style={{ width: data.width, height: data.height }}
      className="pointer-events-none relative rounded-2xl border-2 border-dashed border-primary/25 bg-card/20 p-4 shadow-xl backdrop-blur-xs transition-all dark:border-primary/20 dark:bg-neutral-950/30"
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-primary border-2 border-background pointer-events-auto" />
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary border border-primary/25">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-wide text-foreground">
              {data.workload}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              {data.namespace}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data.role === 'source' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[9px] font-semibold text-blue-500 dark:text-blue-400">
              <ArrowUpRight className="h-2.5 w-2.5" />
              Source (Out)
            </span>
          )}
          {data.role === 'target' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 text-[9px] font-semibold text-purple-500 dark:text-purple-400">
              <ArrowDownLeft className="h-2.5 w-2.5" />
              Receiver (In)
            </span>
          )}
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{data.replicaCount} {data.replicaCount === 1 ? 'Pod' : 'Replicas'}</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-primary border-2 border-background pointer-events-auto" />
    </div>
  );
}

// --- Custom Pod Node ---
export type PodNodeType = Node<PodNodeData, 'podNode'>;

function PodNetworkNode({ data }: NodeProps<PodNodeType>) {
  const isDimmed = Boolean(data.isDimmed);
  const isHighlighted = Boolean(data.isHighlighted);
  const onHover = data.onHover;
  const id = (data.id as string) || '';

  return (
    <div
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
      className={`relative flex min-w-[210px] max-w-[245px] items-center gap-2 rounded-lg border bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur-sm transition-all dark:bg-neutral-900/95 ${
        isHighlighted
          ? 'border-primary ring-2 ring-primary/50 shadow-lg scale-[1.02] z-30'
          : isDimmed
            ? 'opacity-25 border-neutral-200 dark:border-neutral-800'
            : 'border-neutral-200 hover:border-primary/60 hover:shadow-md dark:border-neutral-800 dark:hover:border-primary/60'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-primary border-2 border-background" />
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Box className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[11px] font-semibold text-neutral-900 dark:text-neutral-100" title={data.label}>
          {data.label}
        </span>
        <span className="truncate text-[9px] font-medium text-muted-foreground font-mono" title={id}>
          {typeof data.podName === 'string' && data.podName
            ? data.podName
            : id.includes('/') ? id.split('/')[1] : data.namespace}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-primary border-2 border-background" />
    </div>
  );
}

// --- Trend Sparkline ---
const SPARKLINE_W = 100;
const SPARKLINE_H = 36;

function TrendSparkline({ history, color }: { history: number[]; color: string }) {
  if (!history || history.length < 2) {
    return (
      <div style={{ width: SPARKLINE_W, height: SPARKLINE_H }} className="flex items-center justify-center">
        <span className="text-[9px] text-neutral-400">Collecting…</span>
      </div>
    );
  }

  const max = Math.max(...history) * 1.15 || 1;
  const min = 0;
  const range = max - min || 1;

  // Build SVG polyline points from pixel coords
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * SPARKLINE_W;
    const y = SPARKLINE_H - ((v - min) / range) * SPARKLINE_H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Build area fill path
  const firstX = 0;
  const lastX = SPARKLINE_W;
  const areaPath = `M${firstX},${SPARKLINE_H} ` + 
    history.map((v, i) => {
      const x = (i / (history.length - 1)) * SPARKLINE_W;
      const y = SPARKLINE_H - ((v - min) / range) * SPARKLINE_H;
      return `L${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + 
    ` L${lastX},${SPARKLINE_H} Z`;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg
        width={SPARKLINE_W}
        height={SPARKLINE_H}
        viewBox={`0 0 ${SPARKLINE_W} ${SPARKLINE_H}`}
        className="block overflow-hidden"
      >
        {/* Area fill */}
        <path d={areaPath} fill={color} fillOpacity={0.12} />
        {/* Line */}
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {(() => {
          const last = history[history.length - 1];
          const x = SPARKLINE_W;
          const y = SPARKLINE_H - ((last - min) / range) * SPARKLINE_H;
          return <circle cx={x} cy={y} r={2.5} fill={color} />;
        })()}
      </svg>
    </div>
  );
}

// --- Custom Edge with Telemetry Label & Sparkline ---
export type MetricEdgeType = Edge<
  MetricEdgeData & {
    selectedMetric: TelemetryMetricType;
    aggregator: AggregationMethod;
    edgeState?: EdgeMetricsState;
    isTrendOpen?: boolean;
    onToggleTrend?: (id: string) => void;
    heatmapConfig?: HeatmapConfig;
  },
  'metricEdge'
>;

function formatEndpointLabel(raw?: string): string {
  if (!raw) return '';
  const s = raw.includes('/') ? raw.split('/')[1] : raw;
  if (s.startsWith('boundary-')) {
    const parts = s.split('-');
    return parts.slice(2).join('-');
  }
  const parts = s.split('-');
  if (parts.length >= 3) {
    const prefix = parts.slice(0, -2).join('-');
    const hash = parts[parts.length - 1];
    return `${prefix} (..${hash.slice(-4)})`;
  }
  return s;
}

function MetricEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<MetricEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const selectedMetric = data?.selectedMetric ?? 'throughput';
  const aggregator = data?.aggregator ?? 'instantaneous';
  const edgeState = data?.edgeState;
  const isTrendOpen = data?.isTrendOpen ?? false;
  const onToggleTrend = data?.onToggleTrend;

  // Derive metric value according to aggregator
  let val = data?.metrics?.[selectedMetric] ?? 0;
  if (edgeState) {
    switch (aggregator) {
      case 'instantaneous': val = edgeState.latest; break;
      case 'sum': val = edgeState.sum; break;
      case 'average': val = edgeState.count > 0 ? edgeState.sum / edgeState.count : 0; break;
      case 'max': val = edgeState.max; break;
    }
  }

  const heatmapConfig = data?.heatmapConfig ?? DEFAULT_HEATMAP_CONFIG;
  const meta = METRIC_THRESHOLD_METAS[selectedMetric];
  const isInverted = Boolean(heatmapConfig.isInverted);
  const minThreshold = heatmapConfig.minThresholds?.[selectedMetric] ?? meta?.defaultMinThreshold ?? 50;
  const maxThreshold = heatmapConfig.maxThresholds?.[selectedMetric] ?? heatmapConfig.thresholds[selectedMetric] ?? meta?.defaultMaxThreshold ?? 500;
  const alertColor = heatmapConfig.color;
  const baseColor = heatmapConfig.baseColor;

  let valueText = '';
  let normalizedVal = 0;

  switch (selectedMetric) {
    case 'throughput': {
      // User requirement: throughput threshold and live base is in KB bytes (KB/s)
      const valKB = val / 1024;
      normalizedVal = valKB;
      if (aggregator === 'sum') {
        valueText = val > 1e9 ? `${(val / 1e9).toFixed(2)} GB` : val > 1e6 ? `${(val / 1e6).toFixed(1)} MB` : `${valKB.toFixed(1)} KB`;
      } else {
        valueText = valKB >= 1024 ? `${(valKB / 1024).toFixed(1)} MB/s` : `${valKB.toFixed(1)} KB/s`;
      }
      break;
    }
    case 'packetRate': {
      normalizedVal = val;
      valueText = aggregator === 'sum' ? `${Math.round(val)} pkts` : `${Math.round(val)} pps`;
      break;
    }
    case 'activeConnections': {
      normalizedVal = val;
      valueText = `${Math.round(val)} conn`;
      break;
    }
    case 'tcpRetransmission': {
      normalizedVal = val;
      valueText = `${val.toFixed(1)}%`;
      break;
    }
    case 'tcpRtt': {
      normalizedVal = val;
      valueText = `${Math.round(val)} ms`;
      break;
    }
  }

  let isExceeded = false;
  let isElevated = false;

  if (isInverted) {
    // Invert mode: alert on small/low values (<= minThreshold), warning between min and max
    isExceeded = normalizedVal <= minThreshold;
    isElevated = !isExceeded && normalizedVal <= maxThreshold;
  } else {
    // Standard mode: alert on large/high values (>= maxThreshold), warning between min and max
    isExceeded = normalizedVal >= maxThreshold;
    isElevated = !isExceeded && normalizedVal >= minThreshold;
  }

  // Base color for normal traffic.
  // Warning/elevated traffic turns amber (~70% of threshold).
  // Exceeded traffic turns to user-selected heatmap alert color (e.g. Red, Orange, etc.)!
  let color = baseColor;
  let strokeWidth = 2;

  if (isExceeded) {
    color = alertColor;
    strokeWidth = 3.5;
  } else if (isElevated) {
    color = '#f59e0b';
    strokeWidth = 2.5;
  }

  const isHighlighted = Boolean(data?.isHighlighted);
  const isDimmed = Boolean(data?.isDimmed);

  let finalColor = color;
  let finalStrokeWidth = strokeWidth;
  let edgeOpacity = 1;

  if (isHighlighted) {
    finalColor = '#38bdf8';
    finalStrokeWidth = Math.max(strokeWidth + 1.5, 3.5);
    edgeOpacity = 1;
  } else if (isDimmed) {
    edgeOpacity = 0.12;
    finalColor = '#525252';
    finalStrokeWidth = 1;
  }

  let borderCls = 'border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400';
  const customBadgeStyle: React.CSSProperties = {};

  if (isExceeded) {
    borderCls = 'border-transparent';
    customBadgeStyle.borderColor = `${alertColor}90`;
    customBadgeStyle.boxShadow = `0 0 12px ${alertColor}30`;
  } else if (isElevated) {
    borderCls = 'border-amber-500 text-amber-600 dark:border-amber-500/50 dark:text-amber-400';
  } else if (isHighlighted) {
    borderCls = 'border-sky-400 text-sky-500 shadow-md ring-2 ring-sky-400/40';
  }

  const markerId = `arrow-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const srcName = formatEndpointLabel(data?.sourceLabel || data?.sourceId);
  const dstName = formatEndpointLabel(data?.targetLabel || data?.targetId);

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={finalColor} opacity={edgeOpacity} />
        </marker>
      </defs>

      {/* Base Edge with Terminal Arrowhead Marker */}
      <BaseEdge
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: finalColor,
          strokeWidth: finalStrokeWidth,
          opacity: edgeOpacity * 0.75,
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease',
        }}
      />

      {/* Animated Flowing Packets Dash Stream */}
      <path
        d={edgePath}
        fill="none"
        stroke={finalColor}
        strokeWidth={Math.max(finalStrokeWidth - 0.5, 1.75)}
        strokeDasharray={isExceeded ? '8 6' : '6 8'}
        strokeLinecap="round"
        className="pointer-events-none"
        style={{
          opacity: isDimmed ? 0.15 : isExceeded ? 0.95 : 0.85,
          animation: isExceeded
            ? 'telemetryFlowDash 0.75s linear infinite'
            : 'telemetryFlowDash 1.2s linear infinite',
        }}
      />

      {/* Source Anchor: Emitter Dot & Pulse Ring at (sourceX, sourceY) */}
      <g className="pointer-events-none" opacity={edgeOpacity}>
        <circle cx={sourceX} cy={sourceY} r={3} fill={finalColor} />
        <circle
          cx={sourceX}
          cy={sourceY}
          r={6.5}
          fill="none"
          stroke={finalColor}
          strokeWidth={1.2}
          strokeDasharray="2 2"
          opacity={0.65}
        />
      </g>

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            opacity: isDimmed ? 0.15 : 1,
            transition: 'opacity 0.2s ease',
            zIndex: isHighlighted || isTrendOpen ? 50 : 20,
          }}
        >
          {/* Enhanced Source -> Destination Interactive Badge */}
          <div
            onClick={(e) => { e.stopPropagation(); onToggleTrend?.(id); }}
            style={customBadgeStyle}
            className={`group flex cursor-pointer items-center gap-1.5 rounded-full border bg-white/95 px-2.5 py-1 text-[10px] font-medium shadow-sm backdrop-blur-xs transition-all hover:scale-105 active:scale-95 dark:bg-neutral-900/95 ${borderCls}`}
            title={`Traffic Flow: ${srcName || 'Source'} → ${dstName || 'Destination'} (${valueText})`}
          >
            {/* Source Label */}
            <div className="flex items-center gap-1 text-[9px] font-semibold text-sky-600 dark:text-sky-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
              <span className="max-w-[75px] truncate font-mono">{srcName || 'SRC'}</span>
            </div>

            {/* Direction Flow Arrow */}
            <div className="flex items-center text-muted-foreground/70 shrink-0">
              <ArrowRight
                className="h-3 w-3 animate-pulse"
                style={{ color: isExceeded ? alertColor : '#0ea5e9' }}
              />
            </div>

            {/* Destination Label */}
            <div className="flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="max-w-[75px] truncate font-mono">{dstName || 'DST'}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            </div>

            <span className="h-3 w-px bg-border/80 mx-0.5 shrink-0" />

            {/* Metric Value */}
            <span
              className="font-mono font-bold shrink-0"
              style={{ color: isExceeded ? alertColor : undefined }}
            >
              {valueText}
            </span>
          </div>

          {isTrendOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute left-1/2 top-[calc(100%+8px)] -translate-x-1/2 rounded-xl border bg-white p-3 shadow-xl backdrop-blur-md dark:bg-neutral-900 ${borderCls}`}
              style={{ minWidth: SPARKLINE_W + 36, zIndex: 1000, ...customBadgeStyle }}
            >
              {/* Popover Header with Direction Clarification */}
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 mb-2 text-[10px]">
                <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  <span className="truncate max-w-[90px]">{srcName || 'Caller'}</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span className="truncate max-w-[90px]">{dstName || 'Callee'}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
              </div>
              <TrendSparkline history={edgeState?.history ?? []} color={finalColor} />
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Static references — never recreated — prevents edge unmounting
const edgeTypes = { metricEdge: MetricEdge };
const nodeTypes = {
  podNode: PodNetworkNode,
  workloadBoundary: WorkloadBoundaryNode,
};

export function NetworkGraphCanvas({
  nodes,
  edges,
  selectedMetric,
  aggregator,
  edgeStates,
  onNodePositionChange,
  resetKey,
  heatmapConfig,
  onHeatmapConfigChange,
}: {
  nodes: Node<PodNodeData | WorkloadBoundaryData>[];
  edges: Edge<MetricEdgeData, 'metricEdge'>[];
  selectedMetric: TelemetryMetricType;
  aggregator: AggregationMethod;
  edgeStates: Record<string, EdgeMetricsState>;
  onNodePositionChange?: (id: string, position: { x: number; y: number }) => void;
  resetKey?: number;
  heatmapConfig?: HeatmapConfig;
  onHeatmapConfigChange?: (config: HeatmapConfig) => void;
}) {
  const [internalHeatmapConfig, setInternalHeatmapConfig] = useState<HeatmapConfig>(DEFAULT_HEATMAP_CONFIG);
  const activeHeatmapConfig = heatmapConfig ?? internalHeatmapConfig;
  const handleHeatmapChange = onHeatmapConfigChange ?? setInternalHeatmapConfig;

  // Stable open/close state lives HERE — survives every data tick
  const [activeTrendEdgeId, setActiveTrendEdgeId] = useState<string | null>(null);
  const [hoveredPodId, setHoveredPodId] = useState<string | null>(null);

  const toggleTrend = useCallback((id: string) => {
    setActiveTrendEdgeId(prev => (prev === id ? null : id));
  }, []);

  const closeTrend = useCallback(() => setActiveTrendEdgeId(null), []);

  // Compute connected nodes and edges for hover focus
  const { connectedPodIds, connectedEdgeIds } = React.useMemo(() => {
    if (!hoveredPodId) {
      return { connectedPodIds: new Set<string>(), connectedEdgeIds: new Set<string>() };
    }
    const edgeSet = new Set<string>();
    const podSet = new Set<string>([hoveredPodId]);
    for (const e of edges) {
      if (e.source === hoveredPodId || e.target === hoveredPodId) {
        edgeSet.add(e.id);
        podSet.add(e.source);
        podSet.add(e.target);
      }
    }
    return { connectedPodIds: podSet, connectedEdgeIds: edgeSet };
  }, [hoveredPodId, edges]);

  const flowEdges = React.useMemo(() =>
    edges.map(e => {
      const isHighlighted = hoveredPodId ? connectedEdgeIds.has(e.id) : false;
      const isDimmed = hoveredPodId ? !connectedEdgeIds.has(e.id) : false;

      return {
        ...e,
        type: 'metricEdge',
        data: {
          ...e.data,
          selectedMetric,
          aggregator,
          edgeState: edgeStates[e.id],
          isTrendOpen: activeTrendEdgeId === e.id,
          onToggleTrend: toggleTrend,
          isHighlighted,
          isDimmed,
          heatmapConfig: activeHeatmapConfig,
        },
      };
    }),
    [edges, selectedMetric, aggregator, edgeStates, activeTrendEdgeId, toggleTrend, hoveredPodId, connectedEdgeIds, activeHeatmapConfig]
  );

  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  // When resetKey changes (Auto Arrange clicked), reset dragged overrides during render
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setDraggedPositions({});
  }

  const onNodesChange: OnNodesChange<Node<PodNodeData | WorkloadBoundaryData>> = useCallback(
    changes => {
      const newPositions: Record<string, { x: number; y: number }> = {};
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position && ch.id) {
          newPositions[ch.id] = ch.position;
          onNodePositionChange?.(ch.id, ch.position);
        }
      }
      if (Object.keys(newPositions).length > 0) {
        setDraggedPositions(prev => ({ ...prev, ...newPositions }));
      }
    },
    [onNodePositionChange]
  );

  const flowNodes = React.useMemo(() => {
    return nodes.map(n => {
      const dragged = draggedPositions[n.id];
      const pos = dragged || n.position;

      if (n.type === 'workloadBoundary') {
        const bData = n.data as unknown as WorkloadBoundaryData;
        const w = bData.width || 290;
        const h = bData.height || 180;
        return {
          ...n,
          position: pos,
          width: w,
          height: h,
          style: { width: w, height: h },
          draggable: false,
          selectable: false,
          zIndex: -1,
        };
      }

      const isHighlighted = hoveredPodId ? connectedPodIds.has(n.id) : false;
      const isDimmed = hoveredPodId ? !connectedPodIds.has(n.id) : false;

      return {
        ...n,
        position: pos,
        width: 250,
        height: 48,
        style: { width: 250, height: 48 },
        data: {
          ...n.data,
          id: n.id,
          isHighlighted,
          isDimmed,
          onHover: setHoveredPodId,
        },
      };
    });
  }, [nodes, draggedPositions, hoveredPodId, connectedPodIds]);

  return (
    <div className="relative h-full w-full bg-neutral-50/50 dark:bg-neutral-950/50">
      <style>{`
        @keyframes telemetryFlowDash {
          from {
            stroke-dashoffset: 28;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>

      {/* Floating Interactive Heatmap Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[580px] max-w-[calc(100vw-32px)]">
        <HeatmapBar
          selectedMetric={selectedMetric}
          heatmapConfig={activeHeatmapConfig}
          onHeatmapConfigChange={handleHeatmapChange}
          edges={edges}
          edgeStates={edgeStates}
          aggregator={aggregator}
        />
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => {
          closeTrend();
          setHoveredPodId(null);
        }}
      >
        <Background gap={24} size={2} color="currentColor" className="text-neutral-200 dark:text-neutral-800" />
        <Controls showInteractive={false} className="border-neutral-200 bg-white fill-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:fill-neutral-400" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          className="!m-4 !h-36 !w-56 !rounded-xl !border !border-border/80 !bg-neutral-900/90 !shadow-2xl !backdrop-blur-md overflow-hidden"
          maskColor="rgba(15, 23, 42, 0.45)"
          maskStrokeColor="#38bdf8"
          maskStrokeWidth={1.5}
          nodeColor={(node) => {
            if (node.type === 'workloadBoundary') {
              const role = (node.data as WorkloadBoundaryData)?.role;
              if (role === 'source') return 'rgba(56, 189, 248, 0.2)';
              if (role === 'target') return 'rgba(168, 85, 247, 0.2)';
              return 'rgba(148, 163, 184, 0.15)';
            }
            return '#0284c7';
          }}
          nodeStrokeColor={(node) => {
            if (node.type === 'workloadBoundary') {
              const role = (node.data as WorkloadBoundaryData)?.role;
              if (role === 'source') return '#38bdf8';
              if (role === 'target') return '#c084fc';
              return '#64748b';
            }
            return '#38bdf8';
          }}
          nodeStrokeWidth={1.5}
          nodeBorderRadius={3}
        />
      </ReactFlow>
    </div>
  );
}
