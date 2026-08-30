'use client';

import { AlertCircle, Boxes, GitFork, Layers3, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ManifestInsight } from '@/lib/manifest-graph/insights';
import type { GraphEdgeRecord, ResourceNode } from '@/lib/manifest-graph/types';

interface Props { nodes: ResourceNode[]; edges: GraphEdgeRecord[]; insights: ManifestInsight[]; onOpenMap: (nodeKey?: string) => void }

function applicationName(node: ResourceNode) {
  const labeled = node.raw.metadata?.labels?.['app.kubernetes.io/part-of']
    ?? node.raw.metadata?.labels?.['app.kubernetes.io/instance']
    ?? node.raw.metadata?.labels?.['app.kubernetes.io/name'];
  if (typeof labeled === 'string' && labeled) return labeled;
  if (node.source.chartName) return node.source.chartName;
  return node.source.filePath.replaceAll('\\', '/').split('/').slice(0, -1).join('/') || '<ungrouped>';
}

export function ManifestOverview({ nodes, edges, insights, onOpenMap }: Props) {
  const namespaces = [...new Set(nodes.map(node => node.namespace ?? '<cluster-scoped>'))];
  const applications = [...new Set(nodes.map(applicationName).filter(Boolean))];
  const workloads = nodes.filter(node => node.containers.length > 0);
  const containers = workloads.flatMap(node => node.containers.filter(container => container.role === 'container'));
  const withProbes = containers.filter(container => container.spec.readinessProbe || container.spec.livenessProbe).length;
  const withResources = containers.filter(container => container.spec.resources?.requests && container.spec.resources?.limits).length;
  const withAppLabels = workloads.filter(node => node.canonicalPodLabels?.['app.kubernetes.io/name']).length;
  const critical = insights.filter(insight => insight.severity === 'critical').length;
  const warning = insights.filter(insight => insight.severity === 'warning').length;
  const namespaceByKey = new Map(nodes.map(node => [node.key, node.namespace ?? '<cluster-scoped>']));
  const namespaceStats = new Map(namespaces.map(namespace => [namespace, { namespace, count: 0, findings: 0, relations: 0 }]));
  for (const node of nodes) namespaceStats.get(node.namespace ?? '<cluster-scoped>')!.count += 1;
  for (const insight of insights) { const namespace = namespaceByKey.get(insight.nodeKey); if (namespace) namespaceStats.get(namespace)!.findings += 1; }
  for (const edge of edges) {
    const fromNamespace = namespaceByKey.get(edge.from);
    const toNamespace = namespaceByKey.get(edge.to);
    if (fromNamespace) namespaceStats.get(fromNamespace)!.relations += 1;
    if (toNamespace && toNamespace !== fromNamespace) namespaceStats.get(toNamespace)!.relations += 1;
  }
  const namespaceRows = [...namespaceStats.values()].sort((a, b) => b.findings - a.findings || b.count - a.count);
  const topFindings = insights.slice(0, 8);
  const coverage = [
    { label: 'Container probes', value: containers.length ? withProbes / containers.length : 1, detail: `${withProbes}/${containers.length}` },
    { label: 'Requests and limits', value: containers.length ? withResources / containers.length : 1, detail: `${withResources}/${containers.length}` },
    { label: 'Application labels', value: workloads.length ? withAppLabels / workloads.length : 1, detail: `${withAppLabels}/${workloads.length}` },
  ];

  return <div className="min-h-0 flex-1 overflow-y-auto pb-2">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {[{ label: 'Objects', value: nodes.length, icon: Boxes }, { label: 'Relations', value: edges.length, icon: GitFork }, { label: 'Namespaces', value: namespaces.length, icon: Layers3 }, { label: 'Applications', value: applications.length, icon: ShieldCheck }, { label: 'Needs attention', value: critical + warning, icon: AlertCircle }].map(item => <Card key={item.label} className="border-border bg-card"><CardContent className="flex items-center gap-3 p-3"><item.icon size={16} className="text-muted-foreground"/><div><p className="text-lg font-semibold tabular-nums">{item.value.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">{item.label}</p></div></CardContent></Card>)}
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr_1.2fr]">
      <Card className="border-border bg-card"><CardHeader><CardTitle className="text-sm">Declared operability coverage</CardTitle></CardHeader><CardContent className="space-y-4">{coverage.map(item => <div key={item.label}><div className="mb-1.5 flex justify-between text-xs"><span>{item.label}</span><span className="font-mono text-muted-foreground">{item.detail}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.round(item.value * 100)}%` }}/></div></div>)}<p className="text-[10px] text-muted-foreground">Coverage describes uploaded desired state, not live runtime health.</p></CardContent></Card>
      <Card className="min-h-0 border-border bg-card"><CardHeader><CardTitle className="text-sm">Namespace posture</CardTitle></CardHeader><CardContent className="space-y-1">{namespaceRows.slice(0, 12).map(row => <button key={row.namespace} onClick={() => onOpenMap(nodes.find(node => (node.namespace ?? '<cluster-scoped>') === row.namespace)?.key)} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted"><span className="truncate text-xs font-medium">{row.namespace}</span><span className="text-[10px] text-muted-foreground">{row.count} objects</span><span className={row.findings ? 'text-[10px] text-warning-foreground' : 'text-[10px] text-muted-foreground'}>{row.findings} findings</span></button>)}</CardContent></Card>
      <Card className="min-h-0 border-border bg-card"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-sm">Top findings</CardTitle><span className="text-[10px] text-muted-foreground">{critical} critical · {warning} warning</span></div></CardHeader><CardContent className="space-y-1">{topFindings.map(finding => <button key={finding.id} onClick={() => onOpenMap(finding.nodeKey)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"><span className={`mt-1 size-2 shrink-0 rounded-full ${finding.severity === 'critical' ? 'bg-destructive' : finding.severity === 'warning' ? 'bg-warning' : 'bg-info'}`}/><span className="min-w-0"><span className="block truncate text-xs font-medium">{finding.title}</span><span className="block truncate text-[10px] text-muted-foreground">{nodes.find(node => node.key === finding.nodeKey)?.name}</span></span></button>)}{!topFindings.length && <p className="text-xs text-muted-foreground">No static findings detected.</p>}</CardContent></Card>
    </div>
  </div>;
}
