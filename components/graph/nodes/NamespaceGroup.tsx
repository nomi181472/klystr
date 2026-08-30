'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Activity, Layers, RefreshCw, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/ui/loading-indicator';

export interface NamespaceGroupData {
  label: string;
  resourceCount?: number;
  status?: 'unloaded' | 'loading' | 'loaded' | 'error';
  error?: string;
  kindCounts?: Record<string, number>;
  nodeNames?: string[];
  metricsStatus?: 'off' | 'loading' | 'available' | 'unavailable';
  metricsError?: string;
  statusCounts?: Record<string, number>;
  onLoad?: () => void;
  onToggleMetrics?: () => void;
  [key: string]: unknown;
}

function NamespaceGroupComponent({ data }: NodeProps) {
  const nodeData = data as unknown as NamespaceGroupData;
  const statusSummary = Object.entries(nodeData.statusCounts ?? {}).map(([status, count]) => `${status}=${count}`).join('  ');

  return (
    <div className="pointer-events-none relative h-full w-full" style={{ minWidth: 300, minHeight: 180 }}>
      <div
        className="pointer-events-none absolute inset-0 rounded-lg shadow-sm"
        style={{
          background: 'var(--namespace-group-surface)',
          border: '1px solid var(--namespace-group-border)',
          borderRadius: 10,
        }}
      />
      <div
        className="pointer-events-none absolute left-4 right-4 top-0 z-10 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-1.5 shadow-sm"
        style={{
          background: 'var(--namespace-surface)',
          border: '1px solid var(--namespace-border)',
        }}
      >
        <div className="boundary-drag-handle pointer-events-auto flex min-w-0 cursor-grab flex-wrap items-center gap-x-2 gap-y-1 active:cursor-grabbing">
          <Layers size={14} style={{ color: 'var(--namespace-accent)' }} />
          <span className="min-w-0 max-w-[28%] truncate text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
            {nodeData.label}
          </span>
          {nodeData.resourceCount !== undefined && (
            <span className="ml-1 text-[11px]" style={{ color: 'var(--namespace-accent-muted)' }}>
              {nodeData.resourceCount} resources
            </span>
          )}
          {statusSummary && <span className="min-w-0 truncate text-[10px] text-muted-foreground">{statusSummary}</span>}
          {nodeData.status === 'loading' && <LoadingIndicator size="xs" label="Loading namespace…" className="ml-1" />}
          {nodeData.status === 'error' && <span className="ml-1 truncate text-[10px] text-destructive-foreground" title={nodeData.error}>Load failed</span>}
        </div>
        <div className="pointer-events-auto relative z-20 ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5">
          {nodeData.status !== 'loading' && (
            <Button
              variant="ghost"
              size="sm"
              className="nodrag nopan pointer-events-auto h-7 gap-1 px-2 text-[10px]"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); nodeData.onLoad?.(); }}
            >
              <RefreshCw size={11} />{nodeData.status === 'loaded' ? 'Refresh' : 'Load'}
            </Button>
          )}
          {nodeData.status === 'loaded' && (
            <Button
              variant={nodeData.metricsStatus === 'available' ? 'secondary' : 'ghost'}
              size="sm"
              disabled={nodeData.metricsStatus === 'loading'}
              className="nodrag nopan pointer-events-auto h-7 gap-1 px-2 text-[10px]"
              title={nodeData.metricsError ?? 'Toggle CPU and memory metrics for this namespace'}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); nodeData.onToggleMetrics?.(); }}
            >
              {nodeData.metricsStatus === 'loading' ? <LoadingIndicator size="xs" label={undefined} className="gap-0" /> : <Activity size={11} />}
              Metrics {nodeData.metricsStatus === 'available' ? 'on' : 'off'}
            </Button>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute left-4 right-4 top-10 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {nodeData.nodeNames?.slice(0, 3).map(node => <span key={node} className="flex items-center gap-1 rounded border border-border bg-card/70 px-1.5 py-0.5"><Server size={9}/>{node}</span>)}
        {(nodeData.nodeNames?.length ?? 0) > 3 && <span>+{nodeData.nodeNames!.length - 3} nodes</span>}
        {Object.entries(nodeData.kindCounts ?? {}).map(([kind, count]) => <span key={kind} className="rounded border border-border bg-card/70 px-1.5 py-0.5">{kind} {count}</span>)}
      </div>
      {nodeData.status === 'unloaded' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-8 text-xs text-muted-foreground"><Layers size={14} className="mr-2"/>Load only this namespace’s selected resource types</div>}
      {nodeData.status === 'loading' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-8"><LoadingIndicator size="sm" label={`Fetching ${nodeData.label} resources…`} /></div>}
      {nodeData.status === 'error' && <div className="pointer-events-none absolute inset-x-5 top-16 rounded border border-destructive/30 bg-destructive/10 p-2 text-[10px] text-destructive-foreground">{nodeData.error}</div>}
    </div>
  );
}

export const NamespaceGroup = memo(NamespaceGroupComponent);
