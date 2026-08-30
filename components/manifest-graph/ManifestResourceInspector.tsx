'use client';

import { AlertCircle, AlertTriangle, Box, Check, CircleHelp, FileJson2, GitFork, Info, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ManifestInsight } from '@/lib/manifest-graph/insights';
import type { ContainerRef, GraphEdgeRecord, ResourceNode } from '@/lib/manifest-graph/types';

interface Props {
  selected: ResourceNode | null;
  selectedEdges: GraphEdgeRecord[];
  selectedInsights: ManifestInsight[];
  nodeByKey: Map<string, ResourceNode>;
  onSelect: (key: string) => void;
  className?: string;
}

function insightIcon(insight: ManifestInsight) {
  if (insight.severity === 'critical') return <AlertCircle size={13} className="mt-0.5 shrink-0 text-destructive-foreground"/>;
  if (insight.severity === 'warning') return <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning-foreground"/>;
  return <Info size={13} className="mt-0.5 shrink-0 text-info"/>;
}

function relationVerb(edge: GraphEdgeRecord, outgoing: boolean) {
  const path = String(edge.meta?.fieldPath ?? '');
  const targetKind = String(edge.meta?.targetKind ?? '');
  if (edge.type === 'literal:name') return outgoing ? 'May mention' : 'Mentioned by';
  if (edge.type.includes('bySelector')) return outgoing ? 'Selects' : 'Selected by';
  if (path.includes('ownerReferences')) return outgoing ? 'Owned by' : 'Owns';
  if (path.includes('backend.service')) return outgoing ? 'Routes to' : 'Receives traffic from';
  if (path.includes('scaleTargetRef')) return outgoing ? 'Scales' : 'Scaled by';
  if (path.includes('roleRef')) return outgoing ? 'Binds role' : 'Bound by';
  if (targetKind === 'ServiceAccount') return outgoing ? 'Uses identity' : 'Identity used by';
  if (targetKind === 'Secret') return outgoing ? 'Reads secret' : 'Secret used by';
  if (targetKind === 'ConfigMap') return outgoing ? 'Reads config' : 'Config used by';
  if (targetKind === 'PersistentVolumeClaim' || targetKind === 'PersistentVolume' || targetKind === 'StorageClass') return outgoing ? 'Uses storage' : 'Storage used by';
  return outgoing ? 'Depends on' : 'Used by';
}

function valueAt(record: unknown, key: string) {
  if (!record || typeof record !== 'object') return undefined;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function ProbeBadge({ label, present }: { label: string; present: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] ${present ? 'border-success/25 bg-success/10 text-success-foreground' : 'border-border bg-muted/50 text-muted-foreground'}`}>{present ? <Check size={9}/> : <CircleHelp size={9}/>} {label}</span>;
}

function ContainerCard({ container, node, insights }: { container: ContainerRef; node: ResourceNode; insights: ManifestInsight[] }) {
  const requests = container.spec.resources?.requests;
  const limits = container.spec.resources?.limits;
  const ports = Array.isArray(container.spec.ports) ? container.spec.ports : [];
  const mounts = Array.isArray(container.spec.volumeMounts) ? container.spec.volumeMounts : [];
  const refs = [
    ...node.structuralRefs.filter(ref => ref.containerName === container.name && ref.containerRole === container.role).map(ref => ({
      key: `${ref.fieldPath}:${ref.targetName ?? ref.targetKind}`,
      label: `${ref.targetKind ?? 'Resource'} / ${ref.targetName ?? 'unresolved'}`,
      detail: ref.resolved ? 'Declared reference' : 'Missing from upload',
      resolved: ref.resolved,
    })),
    ...node.literalRefs.filter(ref => ref.containerName === container.name && ref.containerRole === container.role).flatMap(ref => ref.matchedNames.map(match => ({
      key: `${ref.fieldPath}:${match.name}`,
      label: match.name,
      detail: 'Inferred name mention',
      resolved: match.candidateNodeKeys.length > 0,
    }))),
  ];
  const containerInsights = insights.filter(insight => insight.containerName === container.name);
  const security = container.spec.securityContext ?? {};
  return <div className="rounded-lg border border-border bg-muted/25 p-3">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold">{container.name}</p><p className="mt-0.5 break-all font-mono text-[9px] text-muted-foreground">{typeof container.spec.image === 'string' ? container.spec.image : 'No image declared'}</p></div><Badge variant="outline" className="shrink-0 text-[9px]">{container.role}</Badge></div>
    {container.role === 'container' && <div className="mt-3 flex flex-wrap gap-1"><ProbeBadge label="readiness" present={Boolean(container.spec.readinessProbe)}/><ProbeBadge label="liveness" present={Boolean(container.spec.livenessProbe)}/><ProbeBadge label="startup" present={Boolean(container.spec.startupProbe)}/></div>}
    {container.role !== 'ephemeralContainer' ? <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-md border border-border bg-background/60 p-2"><p className="font-medium">Requests</p><p className="mt-1 font-mono text-muted-foreground">CPU {valueAt(requests, 'cpu') ?? '—'}</p><p className="font-mono text-muted-foreground">Memory {valueAt(requests, 'memory') ?? '—'}</p></div><div className="rounded-md border border-border bg-background/60 p-2"><p className="font-medium">Limits</p><p className="mt-1 font-mono text-muted-foreground">CPU {valueAt(limits, 'cpu') ?? '—'}</p><p className="font-mono text-muted-foreground">Memory {valueAt(limits, 'memory') ?? '—'}</p></div></div> : <p className="mt-3 text-[9px] text-muted-foreground">Ephemeral containers do not declare probes, ports, or resource requirements.</p>}
    {(ports.length > 0 || mounts.length > 0) && <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2">{ports.length > 0 && <div><p className="font-medium">Ports</p><p className="mt-1 text-muted-foreground">{ports.map((port: Record<string, unknown>) => `${valueAt(port, 'name') ? `${valueAt(port, 'name')}:` : ''}${valueAt(port, 'containerPort') ?? '?'}${valueAt(port, 'protocol') ? `/${valueAt(port, 'protocol')}` : ''}`).join(', ')}</p></div>}{mounts.length > 0 && <div><p className="font-medium">Volume mounts</p><div className="mt-1 space-y-0.5 text-muted-foreground">{mounts.map((mount: Record<string, unknown>, index: number) => <p key={`${valueAt(mount, 'name')}-${index}`} className="truncate" title={`${valueAt(mount, 'name') ?? '?'} → ${valueAt(mount, 'mountPath') ?? '?'}`}>{valueAt(mount, 'name') ?? '?'} → {valueAt(mount, 'mountPath') ?? '?'}</p>)}</div></div>}</div>}
    {(security.privileged || security.allowPrivilegeEscalation === true) && <div className="mt-3 flex items-center gap-1.5 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive-foreground"><ShieldAlert size={11}/>{security.privileged ? 'Privileged container' : 'Privilege escalation allowed'}</div>}
    {refs.length > 0 && <div className="mt-3"><p className="text-[10px] font-medium">Configuration and dependencies</p><div className="mt-1 space-y-1">{refs.map(ref => <div key={ref.key} className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1 text-[9px]"><span className="truncate">{ref.label}</span><span className={ref.resolved ? 'shrink-0 text-muted-foreground' : 'shrink-0 text-warning-foreground'}>{ref.detail}</span></div>)}</div></div>}
    {containerInsights.length > 0 && <p className="mt-3 text-[9px] text-warning-foreground">{containerInsights.length} finding{containerInsights.length === 1 ? '' : 's'} attributed to this container</p>}
  </div>;
}

export function ManifestResourceInspector({ selected, selectedEdges, selectedInsights, nodeByKey, onSelect, className = '' }: Props) {
  if (!selected) return <Card className={`min-h-0 border-border bg-card ${className}`}><CardContent className="flex h-full items-center justify-center text-xs text-muted-foreground">Select an object to inspect it.</CardContent></Card>;
  const outgoing = selectedEdges.filter(edge => edge.from === selected.key).length;
  const incoming = selectedEdges.length - outgoing;
  const roleOrder: ContainerRef['role'][] = ['container', 'initContainer', 'ephemeralContainer'];
  return <Card className={`min-h-0 border-border bg-card ${className}`}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><CardTitle className="truncate text-sm">{selected.name}</CardTitle><CardDescription className="mt-0.5 truncate">{selected.kind} · {selected.namespace ?? 'cluster-scoped'}</CardDescription></div><Badge variant="outline" className="shrink-0 text-[9px]">{selected.apiVersion}</Badge></div></CardHeader><CardContent className="h-[calc(100%-72px)] p-0"><ScrollArea className="h-full px-3 pb-3"><Tabs defaultValue="overview">
    <TabsList className="w-full"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="relations">Relations</TabsTrigger><TabsTrigger value="findings">Findings</TabsTrigger><TabsTrigger value="containers">Containers</TabsTrigger><TabsTrigger value="source">Source</TabsTrigger></TabsList>
    <TabsContent value="overview" className="mt-3 space-y-3"><div className="grid grid-cols-3 gap-2">{[{ label: 'Incoming', value: incoming, icon: GitFork }, { label: 'Outgoing', value: outgoing, icon: GitFork }, { label: 'Containers', value: selected.containers.length, icon: Box }].map(item => <div key={item.label} className="rounded-md border border-border bg-muted/30 p-2"><item.icon size={12} className="text-muted-foreground"/><p className="mt-1 text-sm font-semibold tabular-nums">{item.value}</p><p className="text-[9px] text-muted-foreground">{item.label}</p></div>)}</div><dl className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-[10px]"><div><dt className="text-muted-foreground">Canonical key</dt><dd className="mt-0.5 break-all font-mono">{selected.key}</dd></div><div><dt className="text-muted-foreground">Source</dt><dd className="mt-0.5 break-all font-mono">{selected.source.filePath}</dd></div>{selected.source.chartName && <div><dt className="text-muted-foreground">Helm chart</dt><dd className="mt-0.5">{selected.source.chartName}</dd></div>}</dl><p className="text-[10px] text-muted-foreground">This inspector describes uploaded desired state. It does not claim live cluster health.</p></TabsContent>
    <TabsContent value="relations" className="mt-3">{selectedEdges.map((edge, index) => { const isOutgoing = edge.from === selected.key; const otherKey = isOutgoing ? edge.to : edge.from; const other = nodeByKey.get(otherKey); return <button key={`${edge.from}-${edge.to}-${index}`} type="button" onClick={() => onSelect(otherKey)} className="mb-2 w-full rounded-md border border-border bg-muted/30 p-2 text-left hover:bg-muted"><div className="flex justify-between gap-2"><Badge variant="outline" className="text-[9px]">{relationVerb(edge, isOutgoing)}</Badge>{edge.meta?.containerName && <span className="truncate text-[10px] text-primary">{String(edge.meta.containerName)}</span>}</div><p className="mt-2 truncate text-xs font-medium">{other ? `${other.kind} / ${other.name}` : otherKey}</p><p className="mt-0.5 truncate text-[9px] text-muted-foreground">{other?.namespace ?? 'cluster-scoped'} · {edge.type === 'literal:name' ? 'inferred evidence' : edge.type.includes('Selector') ? 'selector evidence' : 'declared field'}</p>{edge.meta?.fieldPath && <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">{String(edge.meta.fieldPath)}</p>}</button>;})}{selectedEdges.length === 0 && <p className="text-xs text-muted-foreground">No resolved relations for this object in the upload.</p>}</TabsContent>
    <TabsContent value="findings" className="mt-3">{selectedInsights.map(insight => <div key={insight.id} className="mb-2 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2">{insightIcon(insight)}<div><p className="text-[11px] font-medium">{insight.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{insight.description}</p>{insight.containerName && <p className="mt-1 font-mono text-[9px] text-primary">Container: {insight.containerName}</p>}{insight.fieldPath && <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">{insight.fieldPath}</p>}</div></div>)}{selectedInsights.length === 0 && <p className="text-xs text-muted-foreground">No static manifest findings for this object.</p>}</TabsContent>
    <TabsContent value="containers" className="mt-3 space-y-4">{roleOrder.map(role => { const containers = selected.containers.filter(container => container.role === role); if (!containers.length) return null; const label = role === 'container' ? 'Application containers' : role === 'initContainer' ? 'Init containers' : 'Ephemeral containers'; return <section key={role}><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3><Badge variant="outline" className="text-[9px]">{containers.length}</Badge></div><div className="space-y-2">{containers.map(container => <ContainerCard key={`${container.role}-${container.index}`} container={container} node={selected} insights={selectedInsights}/>)}</div></section>;})}{selected.containers.length === 0 && <p className="text-xs text-muted-foreground">This object has no Pod containers.</p>}</TabsContent>
    <TabsContent value="source" className="mt-3"><div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><FileJson2 size={12}/>Secret values are redacted before reaching this view.</div><pre className="overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[10px]">{JSON.stringify(selected.raw, null, 2)}</pre></TabsContent>
  </Tabs></ScrollArea></CardContent></Card>;
}
