'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, Copy, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGraphStore } from '@/stores/graph-store';
import { getResourceConfig } from '@/config/resource-types';
import { CONFIDENCE_CONFIG } from '@/config/constants';
import { getDirectionalNeighborhood } from '@/lib/graph/neighborhood';
import type { ConnectionSettings, GraphData } from '@/lib/types';

interface NodeDetailsPanelProps {
  graphData: GraphData;
  connectionSettings: ConnectionSettings;
}

export function NodeDetailsPanel({ graphData, connectionSettings }: NodeDetailsPanelProps) {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);
  const setSelectedEdge = useGraphStore(s => s.setSelectedEdge);

  if (!selectedNodeId) return null;

  const node = graphData.nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  const config = getResourceConfig(node.kind);
  const Icon = config.icon;

  // Find outgoing edges (source = this node)
  const outgoing = graphData.edges.filter(e => e.source === selectedNodeId);
  // Find incoming edges (target = this node)
  const incoming = graphData.edges.filter(e => e.target === selectedNodeId);
  const neighborhood = getDirectionalNeighborhood(selectedNodeId, graphData.edges);
  const inboundNodes = graphData.nodes.filter(n => neighborhood.incomingNodeIds.has(n.id));
  const outboundNodes = graphData.nodes.filter(n => neighborhood.outgoingNodeIds.has(n.id));

  return (
    <div className="h-full flex flex-col bg-card/95 border-l border-border/80">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border/50 p-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: `${config.color}20` }}
          >
            <Icon size={20} style={{ color: config.color }} />
          </div>
          <div>
            <h3 className="max-w-[230px] truncate font-mono text-base font-semibold text-foreground" title={node.name}>{node.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1.5" style={{ borderColor: config.borderColor, color: config.textColor }}>
                {config.label}
              </Badge>
              {node.namespace && (
                <span className="text-[10px] text-muted-foreground">{node.namespace}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => void navigator.clipboard.writeText(node.name)} aria-label="Copy resource name" title="Copy resource name">
            <Copy size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setSelectedNode(null)} aria-label="Close details panel" title="Close details panel">
            <X size={15} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <Tabs defaultValue="overview" className="p-4">
          <TabsList className="bg-muted border border-border w-full">
            <TabsTrigger value="overview" className="flex-1 text-xs">Overview</TabsTrigger>
            <TabsTrigger value="deps" className="flex-1 text-xs">Dependencies</TabsTrigger>
            <TabsTrigger value="meta" className="flex-1 text-xs">Metadata</TabsTrigger>
            {node.kind === 'Pod' && <TabsTrigger value="logs" className="flex-1 text-xs"><ScrollText size={12} />Logs</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Status */}
            {node.status && (
              <DetailRow label="Status">
                <Badge variant="outline" className="text-[10px]" style={{
                  borderColor: node.status === 'Running' || node.status === 'Available' || node.status === 'Ready' || node.status === 'Active' || node.status === 'Bound' ? 'color-mix(in oklch, var(--success) 32%, transparent)' : 'color-mix(in oklch, var(--warning) 32%, transparent)',
                  color: node.status === 'Running' || node.status === 'Available' || node.status === 'Ready' || node.status === 'Active' || node.status === 'Bound' ? 'var(--success-foreground)' : 'var(--warning-foreground)',
                }}>
                  {node.status}
                </Badge>
              </DetailRow>
            )}
            {node.metadata.ip && <DetailRow label="IP">{node.metadata.ip}</DetailRow>}
            {node.metadata.ports && node.metadata.ports.length > 0 && (
              <DetailRow label="Ports">
                <div className="flex gap-1 flex-wrap">
                  {node.metadata.ports.map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {p.name ? `${p.name}:` : ''}{p.port}/{p.protocol}
                    </Badge>
                  ))}
                </div>
              </DetailRow>
            )}

            {/* Quick stats */}
            <Separator className="bg-accent/50" />
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Outgoing" value={outgoing.length} icon={<ArrowUpRight size={12} className="text-primary" />} />
              <StatCard label="Incoming" value={incoming.length} icon={<ArrowDownLeft size={12} className="text-emerald-400" />} />
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/50 p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Complete dependency surface</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-emerald-400">{inboundNodes.length} inbound nodes</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">Resources that depend on this</div>
                </div>
                <div>
                  <div className="text-primary">{outboundNodes.length} outbound nodes</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">Resources this depends on</div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="deps" className="mt-4 space-y-3">
            <NodeReachabilityList
              title="All inbound nodes"
              description="Direct and transitive dependents"
              nodes={inboundNodes}
              icon={<ArrowDownLeft size={11} className="text-emerald-400" />}
              onSelect={setSelectedNode}
            />
            <NodeReachabilityList
              title="All outbound nodes"
              description="Direct and transitive dependencies"
              nodes={outboundNodes}
              icon={<ArrowUpRight size={11} className="text-primary" />}
              onSelect={setSelectedNode}
            />
            {outgoing.length > 0 && (
              <div>
                <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Outgoing ({outgoing.length})
                </h5>
                {outgoing.map(edge => {
                  const target = graphData.nodes.find(n => n.id === edge.target);
                  const confConfig = CONFIDENCE_CONFIG[edge.confidence];
                  return (
                    <button
                      key={edge.id}
                      className="w-full text-left p-2 rounded-lg hover:bg-accent/50 transition-colors mb-1"
                      onClick={() => setSelectedEdge(edge.id)}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowUpRight size={10} style={{ color: confConfig.color }} />
                        <span className="text-xs text-foreground truncate">{target?.name ?? edge.target}</span>
                        <span className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: confConfig.color }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{edge.connectionString}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {incoming.length > 0 && (
              <div>
                <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Incoming ({incoming.length})
                </h5>
                {incoming.map(edge => {
                  const source = graphData.nodes.find(n => n.id === edge.source);
                  const confConfig = CONFIDENCE_CONFIG[edge.confidence];
                  return (
                    <button
                      key={edge.id}
                      className="w-full text-left p-2 rounded-lg hover:bg-accent/50 transition-colors mb-1"
                      onClick={() => setSelectedEdge(edge.id)}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowDownLeft size={10} style={{ color: confConfig.color }} />
                        <span className="text-xs text-foreground truncate">{source?.name ?? edge.source}</span>
                        <span className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: confConfig.color }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{edge.connectionString}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {outgoing.length === 0 && incoming.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No dependencies found</p>
            )}
          </TabsContent>

          <TabsContent value="meta" className="mt-4 space-y-3">
            {node.metadata.labels && Object.keys(node.metadata.labels).length > 0 && (
              <div>
                <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Labels</h5>
                <div className="space-y-1">
                  {Object.entries(node.metadata.labels).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground">{k}:</span>
                      <span className="text-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DetailRow label="UID">{node.resourceUid}</DetailRow>
            <DetailRow label="Kind">{node.kind}</DetailRow>
          </TabsContent>

          {node.kind === 'Pod' && (
            <TabsContent value="logs" className="mt-4">
              <PodLogs name={node.name} namespace={node.namespace} settings={connectionSettings} />
            </TabsContent>
          )}
        </Tabs>
      </ScrollArea>
    </div>
  );
}

function PodLogs({ name, namespace, settings }: { name: string; namespace: string | null; settings: ConnectionSettings }) {
  const [tailLines, setTailLines] = useState(10);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLogs([]);
      page.current = 0;
      setError(null);
      void loadLogs(10, false);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, namespace]);

  async function loadLogs(lines: number, older: boolean) {
    if (!namespace || loading || loadingOlder) return;
    if (older) setLoadingOlder(true); else setLoading(true);
    const id = ++requestId.current;
    try {
      const response = await fetch(`/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, tailLines: lines }),
      });
      const result = await response.json() as { logs?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? `Log request failed (${response.status})`);
      if (id !== requestId.current) return;
      const incoming = (result.logs ?? '').split('\n').filter(Boolean);
      setLogs(previous => older ? [...incoming.filter(line => !previous.includes(line)), ...previous] : incoming);
      if (older) page.current += 1;
      setError(null);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'Unable to load pod logs.');
    } finally {
      if (id === requestId.current) { setLoading(false); setLoadingOlder(false); }
    }
  }

  function handleScroll() {
    const element = viewport.current;
    if (element && element.scrollTop < 48 && logs.length > 0 && !loadingOlder) {
      const previousHeight = element.scrollHeight;
      void loadLogs((page.current + 2) * tailLines, true).then(() => {
        requestAnimationFrame(() => {
          if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight - previousHeight;
        });
      });
    }
  }

  function reloadTail() {
    page.current = 0;
    setLogs([]);
    void loadLogs(tailLines, false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="pod-log-tail">Last logs</label>
        <Input
          id="pod-log-tail"
          type="number"
          min={1}
          max={1000}
          value={tailLines}
          onChange={event => setTailLines(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))}
          onBlur={reloadTail}
          className="h-7 w-20 text-right font-mono text-xs bg-muted border-border"
        />
      </div>
      <div ref={viewport} onScroll={handleScroll} className="h-[min(55vh,420px)] overflow-auto rounded-xl border border-border bg-card p-3 font-mono text-xs leading-5 text-foreground">
        {loading && <LoadingIndicator size="sm" label="Loading logs…" className="justify-center" />}
        {loadingOlder && <div className="mb-2 text-center text-xs text-muted-foreground">Loading older logs…</div>}
        {!loading && !error && logs.length === 0 && <div className="text-xs text-muted-foreground">No logs returned.</div>}
        {logs.map((line, index) => <div key={`${line}-${index}`} className="whitespace-pre-wrap break-words">{line}</div>)}
      </div>
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive-foreground">{error}</div>}
      <p className="text-[11px] text-muted-foreground">Scroll to the top to request older output.</p>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[11px] text-muted-foreground min-w-[60px] pt-0.5">{label}</span>
      <div className="text-xs text-foreground flex-1">{children}</div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] text-muted-foreground">{label}</span></div>
      <span className="text-lg font-bold text-foreground">{value}</span>
    </div>
  );
}

function NodeReachabilityList({
  title,
  description,
  nodes,
  icon,
  onSelect,
}: {
  title: string;
  description: string;
  nodes: GraphData['nodes'];
  icon: React.ReactNode;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h5 className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{title} ({nodes.length})
      </h5>
      <p className="mb-2 text-[10px] text-muted-foreground">{description}</p>
      {nodes.length > 0 ? nodes.map(node => (
        <button
          key={node.id}
          className="mb-1 flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-accent/50"
          onClick={() => onSelect(node.id)}
        >
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{node.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{node.kind}</span>
        </button>
      )) : (
        <p className="py-2 text-xs text-muted-foreground">None found</p>
      )}
    </div>
  );
}
