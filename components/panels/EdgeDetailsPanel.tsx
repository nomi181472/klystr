'use client';

import { X, ArrowRight, Shield, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGraphStore } from '@/stores/graph-store';
import { getResourceConfig } from '@/config/resource-types';
import { CONFIDENCE_CONFIG } from '@/config/constants';
import type { GraphData } from '@/lib/types';

interface EdgeDetailsPanelProps {
  graphData: GraphData;
}

export function EdgeDetailsPanel({ graphData }: EdgeDetailsPanelProps) {
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId);
  const setSelectedEdge = useGraphStore(s => s.setSelectedEdge);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);

  if (!selectedEdgeId) return null;

  const edge = graphData.edges.find(e => e.id === selectedEdgeId);
  if (!edge) return null;

  const sourceNode = graphData.nodes.find(n => n.id === edge.source);
  const targetNode = graphData.nodes.find(n => n.id === edge.target);
  const confConfig = CONFIDENCE_CONFIG[edge.confidence];

  const sourceConfig = getResourceConfig(sourceNode?.kind ?? 'External');
  const targetConfig = getResourceConfig(targetNode?.kind ?? 'External');
  const SourceIcon = sourceConfig.icon;
  const TargetIcon = targetConfig.icon;

  return (
    <div className="h-full flex flex-col bg-card/95 border-l border-border/80">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <Badge variant="outline" className="text-[10px]" style={{
            borderColor: confConfig.color + '50',
            color: confConfig.color,
          }}>
            {confConfig.label}
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setSelectedEdge(null)}>
            <X size={14} />
          </Button>
        </div>

        {/* Source → Target */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 p-1.5 rounded hover:bg-accent/50 transition-colors"
            onClick={() => setSelectedNode(edge.source)}
          >
            <SourceIcon size={12} style={{ color: sourceConfig.color }} />
            <span className="text-xs text-foreground truncate max-w-[80px]">{sourceNode?.name ?? '?'}</span>
          </button>
          <ArrowRight size={14} className="text-muted-foreground flex-shrink-0" />
          <button
            className="flex items-center gap-1.5 p-1.5 rounded hover:bg-accent/50 transition-colors"
            onClick={() => setSelectedNode(edge.target)}
          >
            <TargetIcon size={12} style={{ color: targetConfig.color }} />
            <span className="text-xs text-foreground truncate max-w-[80px]">{targetNode?.name ?? '?'}</span>
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 space-y-4">
        <div className="space-y-4">
          <DetailRow label="Type">
            <Badge variant="secondary" className="text-[10px]">{edge.edgeKind}</Badge>
          </DetailRow>
          <DetailRow label="Connection">{edge.connectionString || '—'}</DetailRow>
          <DetailRow label="Protocol">{edge.protocol || '—'}</DetailRow>
          <DetailRow label="Port">{edge.port ?? '—'}</DetailRow>
          <DetailRow label="Cross-NS">{edge.isCrossNamespace ? 'Yes' : 'No'}</DetailRow>
          <DetailRow label="NetPolicy">
            <Badge variant="outline" className="text-[10px]" style={{
              borderColor: edge.networkPolicyStatus === 'likely-blocked' ? 'color-mix(in oklch, var(--destructive) 32%, transparent)' : 'var(--border)',
              color: edge.networkPolicyStatus === 'likely-blocked' ? 'var(--destructive-foreground)' : 'var(--muted-foreground)',
            }}>
              <Shield size={8} className="mr-1" />
              {edge.networkPolicyStatus}
            </Badge>
          </DetailRow>

          <Separator className="bg-accent/50" />

          {/* Evidence */}
          <div>
            <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText size={10} /> Evidence ({edge.evidence.length})
            </h5>
            <div className="space-y-2">
              {edge.evidence.map((ev, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-muted/50 border border-border/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{ev.detector}</Badge>
                    {ev.fromSecret && (
                      <Badge variant="destructive" className="text-[9px] h-4 px-1">from secret</Badge>
                    )}
                  </div>
                  {ev.environmentVariable && (
                    <div className="text-[10px] text-muted-foreground mb-1">env: {ev.environmentVariable}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground font-mono break-all">{ev.rawValue}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 italic">{ev.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[11px] text-muted-foreground min-w-[70px] pt-0.5">{label}</span>
      <div className="text-xs text-foreground flex-1">{children}</div>
    </div>
  );
}
