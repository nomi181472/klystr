'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { ResourceNode } from '@/lib/manifest-graph/types';

const ROW_HEIGHT = 62;
const WINDOW_SIZE = 24;
const OVERSCAN = 5;

export function VirtualObjectList({ nodes, selectedKey, onSelect }: { nodes: ResourceNode[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(nodes.length, start + WINDOW_SIZE + OVERSCAN * 2);
  return <div className="h-full overflow-y-auto px-3 pb-3" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} aria-label={`${nodes.length} manifest objects`}>
    <div className="relative" style={{ height: nodes.length * ROW_HEIGHT }}>
      {nodes.slice(start, end).map((node, offset) => <button key={node.key} onClick={() => onSelect(node.key)} className={`absolute left-0 right-0 h-14 w-full rounded-md border p-2 text-left ${selectedKey === node.key ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted'}`} style={{ top: (start + offset) * ROW_HEIGHT }}><div className="flex justify-between gap-2"><span className="truncate text-xs font-medium">{node.name}</span><Badge variant="outline" className="text-[9px]">{node.kind}</Badge></div><p className="mt-1 truncate text-[10px] text-muted-foreground">{node.namespace ?? 'cluster-scoped'} · {node.source.filePath}</p></button>)}
    </div>
  </div>;
}
