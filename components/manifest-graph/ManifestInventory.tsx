'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowUpRight, Boxes, Layers3, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ManifestInsight } from '@/lib/manifest-graph/insights';
import type { GraphEdgeRecord, ResourceNode } from '@/lib/manifest-graph/types';

interface Props {
  nodes: ResourceNode[];
  edges: GraphEdgeRecord[];
  insights: ManifestInsight[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onOpenMap: (key: string) => void;
}

const ROW_HEIGHT = 54;
const WINDOW_ROWS = 42;
const OVERSCAN = 6;

function applicationName(node: ResourceNode) {
  const labels = node.raw.metadata?.labels;
  const labeled = labels?.['app.kubernetes.io/part-of']
    ?? labels?.['app.kubernetes.io/instance']
    ?? labels?.['app.kubernetes.io/name'];
  if (typeof labeled === 'string' && labeled) return labeled;
  if (node.source.chartName) return node.source.chartName;
  return node.source.filePath.replaceAll('\\', '/').split('/').slice(0, -1).join('/') || '<ungrouped>';
}

function InventoryFilter({ label, values, selected, onChange }: { label: string; values: string[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  return <Popover><PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 max-w-48"/>}><Layers3 size={13}/><span className="truncate">{selected.size ? `${label} (${selected.size})` : `All ${label.toLowerCase()}`}</span></PopoverTrigger><PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto"><div className="mb-1 flex items-center justify-between"><p className="text-xs font-medium">{label}</p>{selected.size > 0 && <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onChange(new Set())}>Clear</Button>}</div>{values.map(value => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-muted"><Checkbox checked={selected.has(value)} onCheckedChange={checked => { const next = new Set(selected); if (checked === true) next.add(value); else next.delete(value); onChange(next); }}/><span className="truncate">{value}</span></label>)}</PopoverContent></Popover>;
}

export function ManifestInventory({ nodes, edges, insights, selectedKey, onSelect, onOpenMap }: Props) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const namespaces = useMemo(() => [...new Set(nodes.map(node => node.namespace ?? '<cluster-scoped>'))].sort(), [nodes]);
  const kinds = useMemo(() => [...new Set(nodes.map(node => node.kind))].sort(), [nodes]);
  const applications = useMemo(() => [...new Set(nodes.map(applicationName))].sort(), [nodes]);
  const findingCounts = useMemo(() => {
    const counts = new Map<string, { total: number; critical: number; warning: number }>();
    for (const insight of insights) {
      const current = counts.get(insight.nodeKey) ?? { total: 0, critical: 0, warning: 0 };
      current.total += 1;
      if (insight.severity === 'critical') current.critical += 1;
      if (insight.severity === 'warning') current.warning += 1;
      counts.set(insight.nodeKey, current);
    }
    return counts;
  }, [insights]);
  const relationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of edges) { counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1); counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1); }
    return counts;
  }, [edges]);
  const filtered = useMemo(() => nodes.filter(node => {
    const namespace = node.namespace ?? '<cluster-scoped>';
    const application = applicationName(node);
    return (!selectedNamespaces.size || selectedNamespaces.has(namespace))
      && (!selectedKinds.size || selectedKinds.has(node.kind))
      && (!selectedApplications.size || selectedApplications.has(application))
      && (!deferredQuery || `${node.name} ${node.kind} ${namespace} ${application} ${node.source.filePath}`.toLowerCase().includes(deferredQuery));
  }).sort((a, b) => {
    const findingDelta = (findingCounts.get(b.key)?.critical ?? 0) - (findingCounts.get(a.key)?.critical ?? 0)
      || (findingCounts.get(b.key)?.warning ?? 0) - (findingCounts.get(a.key)?.warning ?? 0);
    return findingDelta || (a.namespace ?? '').localeCompare(b.namespace ?? '') || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
  }), [deferredQuery, findingCounts, nodes, selectedApplications, selectedKinds, selectedNamespaces]);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(filtered.length, start + WINDOW_ROWS + OVERSCAN * 2);
  const hasFilters = Boolean(query || selectedNamespaces.size || selectedKinds.size || selectedApplications.size);
  const clear = () => { setQuery(''); setSelectedNamespaces(new Set()); setSelectedKinds(new Set()); setSelectedApplications(new Set()); setScrollTop(0); };

  return <Card className="flex h-full min-h-0 flex-col border-border bg-card"><CardHeader className="shrink-0 pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-sm"><Boxes size={15} className="text-primary"/>Manifest inventory</CardTitle><CardDescription className="mt-1">Scan every uploaded object without rendering the entire graph.</CardDescription></div><Badge variant="outline">{filtered.length.toLocaleString()} of {nodes.length.toLocaleString()}</Badge></div><div className="mt-3 flex flex-wrap items-center gap-2"><div className="relative min-w-56 flex-1 sm:max-w-sm"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={event => { setQuery(event.target.value); setScrollTop(0); }} placeholder="Search name, kind, namespace, app, or source" className="h-8 pl-8 text-xs"/></div><InventoryFilter label="Namespaces" values={namespaces} selected={selectedNamespaces} onChange={value => { setSelectedNamespaces(value); setScrollTop(0); }}/><InventoryFilter label="Kinds" values={kinds} selected={selectedKinds} onChange={value => { setSelectedKinds(value); setScrollTop(0); }}/><InventoryFilter label="Applications" values={applications} selected={selectedApplications} onChange={value => { setSelectedApplications(value); setScrollTop(0); }}/>{hasFilters && <Button variant="ghost" size="icon-sm" onClick={clear} aria-label="Clear inventory filters"><X size={13}/></Button>}</div></CardHeader><CardContent className="min-h-0 flex-1 p-0"><div className="h-full overflow-x-auto"><div className="flex h-full min-w-[980px] flex-col"><div className="grid h-9 shrink-0 grid-cols-[minmax(210px,1.4fr)_130px_150px_minmax(150px,1fr)_90px_80px_90px] items-center gap-3 border-y border-border bg-muted/35 px-3 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Object</span><span>Kind</span><span>Namespace</span><span>Application</span><span>Findings</span><span>Relations</span><span className="text-right">Action</span></div><div className="min-h-0 flex-1 overflow-y-auto" onScroll={event => setScrollTop(event.currentTarget.scrollTop)}><div className="relative" style={{ height: filtered.length * ROW_HEIGHT }}>{filtered.slice(start, end).map((node, offset) => { const counts = findingCounts.get(node.key); return <div key={node.key} className={`absolute left-0 right-0 grid h-[50px] grid-cols-[minmax(210px,1.4fr)_130px_150px_minmax(150px,1fr)_90px_80px_90px] items-center gap-3 border-b border-border/60 px-3 text-xs ${selectedKey === node.key ? 'bg-primary/10' : 'hover:bg-muted/40'}`} style={{ top: (start + offset) * ROW_HEIGHT }}><button type="button" className="min-w-0 text-left" onClick={() => onSelect(node.key)}><span className="block truncate font-medium">{node.name}</span><span className="block truncate font-mono text-[9px] text-muted-foreground">{node.source.filePath}</span></button><Badge variant="outline" className="w-fit max-w-full truncate text-[9px]">{node.kind}</Badge><span className="truncate text-[10px] text-muted-foreground">{node.namespace ?? 'cluster-scoped'}</span><span className="truncate text-[10px] text-muted-foreground">{applicationName(node)}</span><span className={counts?.critical ? 'text-[10px] font-medium text-destructive-foreground' : counts?.warning ? 'text-[10px] font-medium text-warning-foreground' : 'text-[10px] text-muted-foreground'}>{counts?.total ?? 0}</span><span className="text-[10px] tabular-nums text-muted-foreground">{relationCounts.get(node.key) ?? 0}</span><Button type="button" variant="ghost" size="sm" className="ml-auto h-7 text-[10px]" onClick={() => onOpenMap(node.key)}>Map <ArrowUpRight size={11}/></Button></div>;})}</div>{filtered.length === 0 && <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No objects match the current filters.</div>}</div></div></div></CardContent></Card>;
}
