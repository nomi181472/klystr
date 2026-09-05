import React, { useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type NodeProps,
  type EdgeProps,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box } from 'lucide-react';
import type { PodNodeData, MetricEdgeData, TelemetryMetricType } from '@/lib/telemetry/mock-data';
import type { AggregationMethod, EdgeMetricsState } from './TelemetryWorkspace';

// --- Custom Node ---
export type PodNodeType = Node<PodNodeData, 'podNode'>;

function PodNetworkNode({ data }: NodeProps<PodNodeType>) {
  return (
    <div className="relative flex flex-col items-center justify-center rounded-md border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Box className="h-4 w-4 text-neutral-500" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{data.label}</span>
          <span className="text-[10px] text-neutral-500">{data.namespace}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
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
      <span className="text-[8px] text-neutral-400">last {history.length}s</span>
    </div>
  );
}

// --- Custom Edge Data ---
export type CanvasEdgeData = MetricEdgeData & {
  selectedMetric: TelemetryMetricType;
  aggregator: AggregationMethod;
  edgeState: EdgeMetricsState;
  isTrendOpen: boolean;
  onToggleTrend: (id: string) => void;
};

export type MetricEdgeType = Edge<CanvasEdgeData, 'metricEdge'>;
export type MetricEdgeProps = EdgeProps<MetricEdgeType>;

function MetricEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: MetricEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const edgeState = data?.edgeState;
  const selectedMetric = data?.selectedMetric ?? 'throughput';
  const aggregator = data?.aggregator ?? 'instantaneous';
  const isTrendOpen = data?.isTrendOpen ?? false;
  const onToggleTrend = data?.onToggleTrend;

  if (!data?.metrics || !edgeState) return <BaseEdge path={edgePath} />;

  // Compute aggregated value
  let val = 0;
  switch (aggregator) {
    case 'instantaneous': val = edgeState.latest; break;
    case 'sum':           val = edgeState.sum; break;
    case 'average':       val = edgeState.count > 0 ? edgeState.sum / edgeState.count : 0; break;
    case 'max':           val = edgeState.max; break;
  }

  let valueText = '';
  let color = '#a3a3a3';
  let strokeWidth = 2;
  let isWarning = false;
  let isDanger = false;

  switch (selectedMetric) {
    case 'throughput':
      if (aggregator === 'sum') {
        valueText = val > 1e9 ? `${(val / 1e9).toFixed(2)} GB` : val > 1e6 ? `${(val / 1e6).toFixed(1)} MB` : `${(val / 1e3).toFixed(1)} KB`;
      } else {
        valueText = val > 1e6 ? `${(val / 1e6).toFixed(1)} MB/s` : `${(val / 1e3).toFixed(1)} KB/s`;
      }
      strokeWidth = val > 10000 ? 4 : 2;
      color = '#3b82f6';
      break;
    case 'packetRate':
      valueText = aggregator === 'sum' ? `${Math.round(val)} pkts` : `${Math.round(val)} pps`;
      strokeWidth = val > 1000 ? 3 : 2;
      color = '#8b5cf6';
      break;
    case 'activeConnections':
      valueText = `${Math.round(val)} conn`;
      strokeWidth = val > 50 ? 4 : 2;
      color = '#10b981';
      break;
    case 'tcpRetransmission':
      valueText = `${val.toFixed(1)}%`;
      isWarning = val > 2; isDanger = val > 10;
      color = isDanger ? '#ef4444' : isWarning ? '#f59e0b' : '#a3a3a3';
      strokeWidth = isDanger || isWarning ? 3 : 2;
      break;
    case 'tcpRtt':
      valueText = `${Math.round(val)} ms`;
      isWarning = val > 50; isDanger = val > 200;
      color = isDanger ? '#ef4444' : isWarning ? '#f59e0b' : '#a3a3a3';
      strokeWidth = isDanger || isWarning ? 3 : 2;
      break;
  }

  const borderCls = isDanger
    ? 'border-red-500 text-red-600 dark:border-red-500/50 dark:text-red-400'
    : isWarning
      ? 'border-amber-500 text-amber-600 dark:border-amber-500/50 dark:text-amber-400'
      : 'border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400';

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{ stroke: color, strokeWidth, transition: 'stroke 0.3s ease, stroke-width 0.3s ease' }}
      />
      <EdgeLabelRenderer>
        {/* Wrapper — never changes size, never shifts the pill */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          {/* The pill stays always the same */}
          <div
            onClick={(e) => { e.stopPropagation(); onToggleTrend?.(id); }}
            className={`flex cursor-pointer items-center justify-center rounded-full border bg-white px-2 py-0.5 text-[10px] font-medium shadow-sm transition-transform hover:scale-105 active:scale-95 dark:bg-neutral-900 ${borderCls}`}
          >
            {valueText}
          </div>

          {/* Popover floats below the pill — absolutely positioned, won't affect pill layout */}
          {isTrendOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 rounded-lg border bg-white p-2 shadow-xl dark:bg-neutral-900 ${borderCls}`}
              style={{ minWidth: SPARKLINE_W + 16, zIndex: 1000 }}
            >
              <TrendSparkline history={edgeState.history ?? []} color={color} />
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Static references — never recreated — prevents edge unmounting
const edgeTypes = { metricEdge: MetricEdge };
const nodeTypes = { podNode: PodNetworkNode };

export function NetworkGraphCanvas({
  nodes,
  edges,
  selectedMetric,
  aggregator,
  edgeStates,
}: {
  nodes: Node<PodNodeData, 'podNode'>[];
  edges: Edge<MetricEdgeData, 'metricEdge'>[];
  selectedMetric: TelemetryMetricType;
  aggregator: AggregationMethod;
  edgeStates: Record<string, EdgeMetricsState>;
}) {
  // Stable open/close state lives HERE — survives every data tick
  const [activeTrendEdgeId, setActiveTrendEdgeId] = useState<string | null>(null);

  const toggleTrend = useCallback((id: string) => {
    setActiveTrendEdgeId(prev => (prev === id ? null : id));
  }, []);

  const closeTrend = useCallback(() => setActiveTrendEdgeId(null), []);

  const flowEdges = React.useMemo(() =>
    edges.map(e => ({
      ...e,
      type: 'metricEdge',
      data: {
        ...e.data,
        selectedMetric,
        aggregator,
        edgeState: edgeStates[e.id],
        isTrendOpen: activeTrendEdgeId === e.id,
        onToggleTrend: toggleTrend,
      },
    })),
    [edges, selectedMetric, aggregator, edgeStates, activeTrendEdgeId, toggleTrend]
  );

  const flowNodes = React.useMemo(() => nodes.map(n => ({ ...n, type: 'podNode' })), [nodes]);

  return (
    <div className="h-full w-full bg-neutral-50/50 dark:bg-neutral-950/50">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onPaneClick={closeTrend}
      >
        <Background gap={24} size={2} color="currentColor" className="text-neutral-200 dark:text-neutral-800" />
        <Controls showInteractive={false} className="border-neutral-200 bg-white fill-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:fill-neutral-400" />
      </ReactFlow>
    </div>
  );
}
