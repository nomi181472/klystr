'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Crown, Server } from 'lucide-react';

function NodeGroupComponent({ data }: NodeProps) {
  const nodeData = data as { label?: string; namespaceCount?: number; role?: string; status?: string; statusCounts?: Record<string, number> };
  const isControlPlane = nodeData.role === 'control-plane';
  const summary = Object.entries(nodeData.statusCounts ?? {}).map(([status, count]) => `${status}=${count}`).join('  ');
  return (
    <div className="pointer-events-none relative h-full w-full rounded-xl border border-border/80 bg-muted/15">
      <div className="boundary-drag-handle pointer-events-auto absolute left-4 right-4 top-0 flex min-w-0 flex-wrap cursor-grab items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-3 py-1.5 shadow-sm active:cursor-grabbing">
        {isControlPlane ? <Crown size={13} className="text-amber-500" /> : <Server size={13} className="text-primary" />}
        <span className="min-w-0 max-w-[42%] truncate text-xs font-semibold text-foreground">{nodeData.label ?? 'Kubernetes node'}</span>
        <span className="text-[10px] text-muted-foreground">{isControlPlane ? 'control plane' : 'worker'} · {nodeData.namespaceCount ?? 0} namespaces</span>
      </div>
      <div className="absolute left-4 top-8 text-[10px] text-muted-foreground">
        {nodeData.status ?? 'Unknown'}{summary && `  ·  ${summary}`}
      </div>
    </div>
  );
}

export const NodeGroup = memo(NodeGroupComponent);
