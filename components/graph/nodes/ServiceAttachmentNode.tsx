'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Network } from 'lucide-react';

interface ServiceAttachmentData {
  name: string;
  dimmed?: boolean;
  serviceType?: string;
  ip?: string;
  ports?: { port: number; protocol: string; name?: string }[];
  [key: string]: unknown;
}

function ServiceAttachmentNodeComponent({ data, selected }: NodeProps) {
  const service = data as unknown as ServiceAttachmentData;
  const ports = service.ports?.map(port => `:${port.port}`).join(', ');

  return (
    <div
      className="relative flex h-8 w-28 items-center gap-1.5 rounded-md border bg-card px-2 shadow-md"
      style={{
        opacity: service.dimmed ? 0.34 : 1,
        borderColor: selected ? 'var(--ring)' : 'color-mix(in oklch, var(--info) 48%, var(--border))',
        boxShadow: selected ? '0 0 0 2px color-mix(in oklch, var(--ring) 25%, transparent)' : undefined,
      }}
      title={`${service.serviceType ?? 'Service'} ${service.name}${service.ip ? ` · ${service.ip}` : ''}${ports ? ` · ${ports}` : ''}`}
    >
      <Network size={12} className="shrink-0 text-info" />
      <div className="min-w-0 leading-none">
        <div className="truncate text-[10px] font-semibold text-foreground">{service.name}</div>
        <div className="mt-0.5 truncate text-[8px] text-muted-foreground">{service.serviceType ?? 'Service'}</div>
      </div>
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-info !bg-info" />
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-info !bg-info" />
    </div>
  );
}

export const ServiceAttachmentNode = memo(ServiceAttachmentNodeComponent);
