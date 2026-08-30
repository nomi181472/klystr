'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowUpRight, ChevronDown, Info, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InsightSeverity, ManifestInsight } from '@/lib/manifest-graph/insights';
import type { ResourceNode } from '@/lib/manifest-graph/types';

interface Props {
  nodes: ResourceNode[];
  insights: ManifestInsight[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onOpenMap: (key: string) => void;
}

const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
type FindingView = 'all' | 'reliability' | 'security' | 'relationships';

function belongsToView(insight: ManifestInsight, view: FindingView) {
  if (view === 'all') return true;
  if (view === 'security') return insight.category === 'security';
  if (view === 'relationships') return insight.category === 'relationship';
  return ['reliability', 'observability', 'metadata'].includes(insight.category);
}

function baseTitle(title: string) {
  return title.replace(/\s+[“"].*[”"]$/, '');
}

function SeverityIcon({ severity }: { severity: InsightSeverity }) {
  if (severity === 'critical') return <AlertCircle size={14} className="text-destructive-foreground"/>;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-warning-foreground"/>;
  return <Info size={14} className="text-info"/>;
}

export function ManifestFindings({ nodes, insights, selectedKey, onSelect, onOpenMap }: Props) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<FindingView>('all');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [severities, setSeverities] = useState<Set<InsightSeverity>>(new Set(['critical', 'warning']));
  const [expanded, setExpanded] = useState<string | null>(null);
  const nodeByKey = useMemo(() => new Map(nodes.map(node => [node.key, node])), [nodes]);
  const counts = useMemo(() => ({
    critical: insights.filter(insight => insight.severity === 'critical').length,
    warning: insights.filter(insight => insight.severity === 'warning').length,
    info: insights.filter(insight => insight.severity === 'info').length,
  }), [insights]);
  const groups = useMemo(() => {
    const grouped = new Map<string, { key: string; title: string; severity: InsightSeverity; category: ManifestInsight['category']; description: string; items: ManifestInsight[] }>();
    for (const insight of insights) {
      if (!belongsToView(insight, view)) continue;
      if (!severities.has(insight.severity)) continue;
      const node = nodeByKey.get(insight.nodeKey);
      const searchable = `${insight.title} ${insight.description} ${insight.category} ${node?.name ?? ''} ${node?.kind ?? ''} ${node?.namespace ?? ''}`.toLowerCase();
      if (deferredQuery && !searchable.includes(deferredQuery)) continue;
      const title = baseTitle(insight.title);
      const key = `${insight.severity}:${insight.category}:${title}`;
      const current = grouped.get(key);
      if (current) current.items.push(insight);
      else grouped.set(key, { key, title, severity: insight.severity, category: insight.category, description: insight.description, items: [insight] });
    }
    return [...grouped.values()].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.items.length - a.items.length || a.title.localeCompare(b.title));
  }, [deferredQuery, insights, nodeByKey, severities, view]);
  const toggleSeverity = (severity: InsightSeverity) => {
    const next = new Set(severities);
    if (next.has(severity)) next.delete(severity); else next.add(severity);
    setSeverities(next);
  };

  return <Card className="flex h-full min-h-0 flex-col border-border bg-card"><CardHeader className="shrink-0 pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-sm">Manifest findings</CardTitle><CardDescription className="mt-1">Prioritized, deterministic checks against uploaded desired state—not live runtime health.</CardDescription></div><Badge variant="outline">{insights.length.toLocaleString()} total</Badge></div><Tabs value={view} onValueChange={value => setView(value as FindingView)} className="mt-3"><TabsList className="grid w-full max-w-xl grid-cols-4"><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="reliability">Reliability</TabsTrigger><TabsTrigger value="security">Security posture</TabsTrigger><TabsTrigger value="relationships">Relationships</TabsTrigger></TabsList></Tabs><div className="mt-3 grid gap-2 sm:grid-cols-3">{(['critical', 'warning', 'info'] as const).map(severity => <button type="button" key={severity} aria-pressed={severities.has(severity)} onClick={() => toggleSeverity(severity)} className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors ${severities.has(severity) ? 'border-primary/35 bg-primary/10' : 'border-border bg-muted/20 opacity-65 hover:opacity-100'}`}><SeverityIcon severity={severity}/><span><span className="block text-sm font-semibold tabular-nums">{counts[severity].toLocaleString()}</span><span className="block text-[9px] capitalize text-muted-foreground">{severity}</span></span></button>)}</div><div className="relative mt-2"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search rule, resource, namespace, or category" className="h-8 pl-8 text-xs"/></div></CardHeader><CardContent className="min-h-0 flex-1 p-0"><ScrollArea className="h-full px-4 pb-4"><div className="space-y-2">{groups.map(group => { const isExpanded = expanded === group.key; const affectedNodes = new Set(group.items.map(item => item.nodeKey)).size; return <section key={group.key} className="overflow-hidden rounded-lg border border-border bg-muted/20"><button type="button" className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40" onClick={() => setExpanded(isExpanded ? null : group.key)} aria-expanded={isExpanded}><SeverityIcon severity={group.severity}/><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{group.title}</span><Badge variant="outline" className="text-[9px]">{group.category}</Badge></span><span className="mt-1 block text-[10px] text-muted-foreground">{group.description}</span></span><span className="shrink-0 text-right"><span className="block text-xs font-semibold tabular-nums">{affectedNodes.toLocaleString()}</span><span className="block text-[9px] text-muted-foreground">objects</span></span><ChevronDown size={13} className={`mt-0.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}/></button>{isExpanded && <div className="border-t border-border bg-background/40 px-3 py-2"><div className="space-y-1">{group.items.slice(0, 200).map(item => { const node = nodeByKey.get(item.nodeKey); return <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-2 py-1.5 ${selectedKey === item.nodeKey ? 'bg-primary/10' : 'hover:bg-muted/50'}`}><button type="button" className="min-w-0 text-left" onClick={() => onSelect(item.nodeKey)}><span className="block truncate text-[11px] font-medium">{node ? `${node.kind} / ${node.name}` : item.nodeKey}</span><span className="block truncate text-[9px] text-muted-foreground">{node?.namespace ?? 'cluster-scoped'}{item.containerName ? ` · ${item.containerName}` : ''}{item.fieldPath ? ` · ${item.fieldPath}` : ''}</span></button><Badge variant="outline" className="text-[9px]">{item.severity}</Badge><Button type="button" variant="ghost" size="icon-sm" onClick={() => onOpenMap(item.nodeKey)} aria-label={`Show ${node?.name ?? 'resource'} on map`}><ArrowUpRight size={11}/></Button></div>;})}</div>{group.items.length > 200 && <p className="mt-2 text-[10px] text-muted-foreground">Showing the first 200 of {group.items.length.toLocaleString()} occurrences. Narrow the search to inspect more.</p>}</div>}</section>;})}{groups.length === 0 && <div className="py-12 text-center"><p className="text-xs font-medium">No findings match this view</p><p className="mt-1 text-[10px] text-muted-foreground">Enable another severity or change the search.</p></div>}</div></ScrollArea></CardContent></Card>;
}
