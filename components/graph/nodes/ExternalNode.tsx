'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Globe } from 'lucide-react';

export interface ExternalNodeData {
  name: string;
  dimmed?: boolean;
  [key: string]: unknown;
}

function ExternalNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ExternalNodeData;

  return (
    <div className="relative" style={{ minWidth: 180, opacity: nodeData.dimmed ? 0.34 : 1 }}>
      <div
        className="rounded-lg border px-3 py-2.5 transition-all duration-200"
        style={{
          background: 'color-mix(in oklch, var(--external) 5%, transparent)',
          borderColor: selected ? 'var(--external)' : 'color-mix(in oklch, var(--external) 25%, transparent)',
          borderStyle: 'dashed',
          borderWidth: selected ? 2 : 1,
          boxShadow: selected ? '0 0 15px color-mix(in oklch, var(--external) 20%, transparent)' : 'none',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Globe size={14} className="text-external" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-external">
            External
          </span>
        </div>
        <div className="text-sm font-semibold text-external truncate" title={nodeData.name}>
          {nodeData.name}
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-muted-foreground !border-muted-foreground" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-muted-foreground !border-muted-foreground" />
    </div>
  );
}

export const ExternalNode = memo(ExternalNodeComponent);
