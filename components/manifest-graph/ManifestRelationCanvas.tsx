'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, Panel,
  ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Focus, Layers3, Maximize2, Network, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ManifestInsight } from '@/lib/manifest-graph/insights';
import type { GraphEdgeRecord, ResourceNode } from '@/lib/manifest-graph/types';

interface ManifestGraph { nodes: ResourceNode[]; edges: GraphEdgeRecord[] }
interface Props {
  graph: ManifestGraph;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  insights: ManifestInsight[];
}

const elk = new ELK();
const NODE_WIDTH = 190;
const NODE_HEIGHT = 58;
const ELK_NODE_LIMIT = 800;
const MAX_FOCUS_NEIGHBORS = 160;

const KIND_COLORS: Record<string, string> = {
  Pod: 'var(--resource-pod)', Service: 'var(--resource-service)', Deployment: 'var(--resource-deployment)',
  StatefulSet: 'var(--resource-statefulset)', DaemonSet: 'var(--resource-daemonset)',
  ConfigMap: 'var(--warning)', Secret: 'var(--destructive)', Ingress: 'var(--info)',
};

function edgeStyle(type: string) {
  if (type.includes('bySelector')) return { stroke: 'var(--info)', strokeDasharray: '6 4' };
  if (type.includes('literal')) return { stroke: 'var(--warning)', strokeDasharray: '3 3' };
  return { stroke: 'var(--muted-foreground)' };
}

function relationTypeLabel(type: string) {
  if (type === 'structural:bySelector') return 'Selector matches';
  if (type === 'structural:byName') return 'Declared references';
  if (type === 'structural:byKindMatch') return 'Kind matches';
  if (type === 'literal:name') return 'Inferred name mentions';
  return type;
}

function preferredRelationTypes(edges: GraphEdgeRecord[]) {
  const all = [...new Set(edges.map(edge => edge.type))];
  const declared = all.filter(type => type !== 'literal:name');
  return new Set(declared.length ? declared : all);
}

function applicationName(node: ResourceNode) {
  const labels = node.raw.metadata?.labels;
  const labeled = labels?.['app.kubernetes.io/part-of']
    ?? labels?.['app.kubernetes.io/instance']
    ?? labels?.['app.kubernetes.io/name'];
  if (typeof labeled === 'string' && labeled) return labeled;
  if (node.source.chartName) return node.source.chartName;
  const directory = node.source.filePath.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
  return directory || '<ungrouped>';
}

function fastGridLayout(nodes: ResourceNode[]) {
  const ordered = [...nodes].sort((a, b) => (a.namespace ?? '').localeCompare(b.namespace ?? '') || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const columns = Math.max(8, Math.ceil(Math.sqrt(ordered.length * 1.8)));
  return new Map(ordered.map((node, index) => [node.key, {
    x: (index % columns) * (NODE_WIDTH + 34),
    y: Math.floor(index / columns) * (NODE_HEIGHT + 42),
  }]));
}

async function computePositions(nodes: ResourceNode[], edges: GraphEdgeRecord[]) {
  if (nodes.length > ELK_NODE_LIMIT) return fastGridLayout(nodes);
  const keys = new Set(nodes.map(node => node.key));
  const layout = await elk.layout({
    id: 'manifest-root',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '34', 'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.edgeRouting': 'POLYLINE', 'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: nodes.map(node => ({ id: node.key, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: edges.filter(edge => keys.has(edge.from) && keys.has(edge.to)).map((edge, index) => ({ id: `layout-${index}`, sources: [edge.from], targets: [edge.to] })),
  });
  return new Map((layout.children ?? []).map(node => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
}

function MultiFilter({ label, values, selected, onChange, formatValue = value => value }: {
  label: string; values: string[]; selected: Set<string>; onChange: (next: Set<string>) => void; formatValue?: (value: string) => string;
}) {
  const toggle = (value: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(value); else next.delete(value);
    onChange(next);
  };
  return <Popover><PopoverTrigger render={<Button variant="outline" size="sm" className="h-7 max-w-44"/>}><Layers3 size={13}/><span className="truncate">{selected.size ? `${selected.size} ${label.toLowerCase()}` : `All ${label.toLowerCase()}`}</span></PopoverTrigger><PopoverContent align="start" className="max-h-72 w-60 overflow-y-auto"><div className="flex items-center justify-between"><span className="text-xs font-medium">{label}</span>{selected.size > 0 && <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onChange(new Set())}>All</Button>}</div>{values.map(value => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-muted"><Checkbox checked={selected.has(value)} onCheckedChange={checked => toggle(value, checked === true)}/><span className="truncate">{formatValue(value)}</span></label>)}</PopoverContent></Popover>;
}

function Canvas({ graph, selectedKey, onSelect, insights }: Props) {
  const { fitView } = useReactFlow();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set());
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<Set<string>>(() => preferredRelationTypes(graph.edges));
  const [focusMode, setFocusMode] = useState(graph.nodes.length > 250);
  const [layoutResult, setLayoutResult] = useState<{ key: string; positions: Map<string, { x: number; y: number }> }>({ key: '', positions: new Map() });
  const initialFitDone = useRef(false);

  const kinds = useMemo(() => [...new Set(graph.nodes.map(node => node.kind))].sort(), [graph.nodes]);
  const namespaces = useMemo(() => [...new Set(graph.nodes.map(node => node.namespace ?? '<cluster-scoped>'))].sort(), [graph.nodes]);
  const applications = useMemo(() => [...new Set(graph.nodes.map(applicationName))].sort(), [graph.nodes]);
  const relationTypes = useMemo(() => [...new Set(graph.edges.map(edge => edge.type))].sort(), [graph.edges]);
  const defaultRelationTypes = useMemo(() => preferredRelationTypes(graph.edges), [graph.edges]);
  const degreeByNode = useMemo(() => {
    const degrees = new Map<string, number>();
    for (const edge of graph.edges) {
      degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
    }
    return degrees;
  }, [graph.edges]);
  const kindByNode = useMemo(() => new Map(graph.nodes.map(node => [node.key, node.kind])), [graph.nodes]);
  const issuesByNode = useMemo(() => {
    const grouped = new Map<string, ManifestInsight[]>();
    for (const insight of insights) grouped.set(insight.nodeKey, [...(grouped.get(insight.nodeKey) ?? []), insight]);
    return grouped;
  }, [insights]);
  const neighborhood = useMemo(() => {
    if (!selectedKey || !focusMode) return null;
    const neighbors = new Set<string>();
    for (const edge of graph.edges) if (edge.from === selectedKey) neighbors.add(edge.to); else if (edge.to === selectedKey) neighbors.add(edge.from);
    const ordered = [...neighbors].sort((a, b) => {
      const priority = (key: string) => (issuesByNode.get(key) ?? []).reduce((highest, insight) => Math.max(highest, insight.severity === 'critical' ? 3 : insight.severity === 'warning' ? 2 : 1), 0);
      return priority(b) - priority(a) || (degreeByNode.get(b) ?? 0) - (degreeByNode.get(a) ?? 0) || a.localeCompare(b);
    });
    return { keys: new Set([selectedKey, ...ordered.slice(0, MAX_FOCUS_NEIGHBORS)]), hidden: Math.max(0, ordered.length - MAX_FOCUS_NEIGHBORS) };
  }, [degreeByNode, focusMode, graph.edges, issuesByNode, selectedKey]);

  const filteredNodes = useMemo(() => graph.nodes.filter(node => {
    const normalized = deferredQuery.trim().toLowerCase();
    return (!selectedKinds.size || selectedKinds.has(node.kind))
      && (!selectedNamespaces.size || selectedNamespaces.has(node.namespace ?? '<cluster-scoped>'))
      && (!selectedApplications.size || selectedApplications.has(applicationName(node)))
      && (!normalized || node.name.toLowerCase().includes(normalized) || node.kind.toLowerCase().includes(normalized) || node.source.filePath.toLowerCase().includes(normalized))
      && (!neighborhood || neighborhood.keys.has(node.key));
  }), [deferredQuery, graph.nodes, neighborhood, selectedApplications, selectedKinds, selectedNamespaces]);
  const visibleKeys = useMemo(() => new Set(filteredNodes.map(node => node.key)), [filteredNodes]);
  const filteredEdges = useMemo(() => graph.edges.filter(edge => visibleKeys.has(edge.from) && visibleKeys.has(edge.to) && (!selectedRelationTypes.size || selectedRelationTypes.has(edge.type))), [graph.edges, selectedRelationTypes, visibleKeys]);
  const bundledEdges = useMemo(() => {
    const grouped = new Map<string, GraphEdgeRecord & { count: number }>();
    for (const edge of filteredEdges) {
      const key = `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
      const existing = grouped.get(key);
      if (existing) existing.count += 1;
      else grouped.set(key, { ...edge, count: 1 });
    }
    return [...grouped.values()];
  }, [filteredEdges]);
  const layoutKey = useMemo(() => `${filteredNodes.map(node => node.key).join('\u0001')}\u0002${bundledEdges.map(edge => `${edge.from}>${edge.to}:${edge.type}`).join('\u0001')}`, [bundledEdges, filteredNodes]);
  const layoutPending = layoutResult.key !== layoutKey;
  const positions = layoutResult.positions;

  useEffect(() => {
    let cancelled = false;
    computePositions(filteredNodes, bundledEdges).then(result => {
      if (cancelled) return;
      setLayoutResult({ key: layoutKey, positions: result });
      if (!initialFitDone.current) {
        initialFitDone.current = true;
        window.setTimeout(() => fitView({ padding: 0.12, duration: 250 }), 0);
      }
    }).catch(() => {
      if (!cancelled) setLayoutResult({ key: layoutKey, positions: fastGridLayout(filteredNodes) });
    });
    return () => { cancelled = true; };
  }, [bundledEdges, filteredNodes, fitView, layoutKey]);

  const flowNodes = useMemo<Node[]>(() => filteredNodes.map(node => {
    const selected = node.key === selectedKey;
    const connections = degreeByNode.get(node.key) ?? 0;
    const nodeInsights = issuesByNode.get(node.key) ?? [];
    const issueSeverity = nodeInsights.some(insight => insight.severity === 'critical') ? 'critical' : nodeInsights.some(insight => insight.severity === 'warning') ? 'warning' : nodeInsights.length ? 'info' : null;
    const issueColor = issueSeverity === 'critical' ? 'var(--destructive)' : issueSeverity === 'warning' ? 'var(--warning)' : issueSeverity === 'info' ? 'var(--info)' : null;
    return {
      id: node.key, position: positions.get(node.key) ?? { x: 0, y: 0 },
      data: { label: <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold">{node.name}</span>{nodeInsights.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[9px]" aria-label={`${nodeInsights.length} manifest insights`}>{nodeInsights.length}</span>}<span className="ml-auto text-[9px] text-muted-foreground">{connections}</span></div><div className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground"><span className="truncate">{node.kind}</span><span>·</span><span className="truncate">{node.namespace ?? 'cluster'}</span></div></div> },
      style: {
        width: NODE_WIDTH, minHeight: NODE_HEIGHT, borderRadius: 8,
        border: selected ? '2px solid var(--primary)' : `1px solid ${issueColor ?? KIND_COLORS[node.kind] ?? 'var(--border)'}`,
        background: selected ? 'color-mix(in oklch, var(--primary) 12%, var(--card))' : 'var(--card)',
        color: 'var(--foreground)', padding: '10px 12px', boxShadow: selected ? '0 0 0 3px color-mix(in oklch, var(--primary) 14%, transparent)' : 'none',
      },
    };
  }), [degreeByNode, filteredNodes, issuesByNode, positions, selectedKey]);
  const flowEdges = useMemo<Edge[]>(() => bundledEdges.map((edge, index) => ({
    id: `${edge.from}->${edge.to}:${index}`, source: edge.from, target: edge.to,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { ...edgeStyle(edge.type), strokeWidth: edge.from === selectedKey || edge.to === selectedKey ? 2.2 : 1.1, opacity: selectedKey && edge.from !== selectedKey && edge.to !== selectedKey ? 0.2 : 0.75 },
    data: edge.meta,
    label: edge.count > 1 ? edge.count : undefined,
    labelStyle: { fill: 'var(--foreground)', fontSize: 10 },
    labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
  })), [bundledEdges, selectedKey]);

  const relationFilterIsDefault = selectedRelationTypes.size === defaultRelationTypes.size
    && [...selectedRelationTypes].every(type => defaultRelationTypes.has(type));
  const clearFilters = () => { setQuery(''); setSelectedKinds(new Set()); setSelectedNamespaces(new Set()); setSelectedApplications(new Set()); setSelectedRelationTypes(new Set(defaultRelationTypes)); setFocusMode(graph.nodes.length > 250); };
  const toggleFocus = () => {
    if (focusMode && graph.nodes.length > 2_000 && !window.confirm(`Show all ${graph.nodes.length.toLocaleString()} objects? This can take longer to render.`)) return;
    setFocusMode(value => !value);
  };
  return <div className="relative h-full min-h-[480px] overflow-hidden rounded-lg border border-border bg-background">
    <ReactFlow nodes={flowNodes} edges={flowEdges} onNodeClick={(_, node) => onSelect(node.id)} nodesDraggable={!layoutPending} nodesConnectable={false} elementsSelectable fitView minZoom={0.03} maxZoom={2.5} onlyRenderVisibleElements proOptions={{ hideAttribution: true }} aria-label="Kubernetes manifest relationship map">
      <Background variant={BackgroundVariant.Dots} gap={18} size={1}/><Controls showInteractive={false}/>{filteredNodes.length > 1 && <MiniMap position="bottom-right" pannable zoomable className="!hidden !h-32 !w-48 !border !border-border !bg-card md:!block" maskColor="color-mix(in oklch, var(--background) 65%, transparent)" nodeColor={node => KIND_COLORS[kindByNode.get(node.id) ?? ''] ?? 'var(--muted-foreground)'}/>}
      <Panel position="top-left" className="m-3 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-sm backdrop-blur">
        <div className="relative w-52"><Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={13}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find name, kind, or file" className="h-7 pl-7 text-xs"/></div>
        <MultiFilter label="Namespaces" values={namespaces} selected={selectedNamespaces} onChange={setSelectedNamespaces}/>
        <MultiFilter label="Kinds" values={kinds} selected={selectedKinds} onChange={setSelectedKinds}/>
        {applications.length > 0 && <MultiFilter label="Applications" values={applications} selected={selectedApplications} onChange={setSelectedApplications}/>}
        <MultiFilter label="Relations" values={relationTypes} selected={selectedRelationTypes} onChange={setSelectedRelationTypes} formatValue={relationTypeLabel}/>
        <Button size="sm" variant={focusMode ? 'default' : 'outline'} className="h-7" disabled={!selectedKey} onClick={toggleFocus}><Focus size={13}/>{focusMode ? `Show all (${graph.nodes.length.toLocaleString()})` : 'Neighbors'}</Button>
        <Button size="icon-sm" variant="ghost" onClick={() => void fitView({ padding: 0.12, duration: 250 })} aria-label="Fit graph"><Maximize2 size={13}/></Button>
        {(query || selectedKinds.size > 0 || selectedNamespaces.size > 0 || selectedApplications.size > 0 || !relationFilterIsDefault || focusMode !== (graph.nodes.length > 250)) && <Button size="icon-sm" variant="ghost" onClick={clearFilters} aria-label="Reset graph filters"><X size={13}/></Button>}
      </Panel>
      <Panel position="top-right" className="m-3 mt-16 flex items-center gap-2 rounded-md border border-border bg-card/95 px-2 py-1.5 text-[10px] text-muted-foreground"><Network size={12}/><span>{filteredNodes.length.toLocaleString()} objects</span><span>·</span><span>{filteredEdges.length.toLocaleString()} relations</span>{neighborhood?.hidden ? <Badge variant="outline" className="text-[9px]">+{neighborhood.hidden.toLocaleString()} neighbors hidden</Badge> : null}{filteredNodes.length > ELK_NODE_LIMIT && <Badge variant="outline" className="text-[9px]">fast layout</Badge>}</Panel>
    </ReactFlow>
    {!layoutPending && filteredNodes.length === 0 && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><div className="rounded-lg border border-border bg-card/95 px-4 py-3 text-center shadow-sm"><p className="text-xs font-medium">No objects match this scope</p><p className="mt-1 text-[10px] text-muted-foreground">Clear a filter or search for another resource.</p></div></div>}
    {layoutPending && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/65 backdrop-blur-sm"><LoadingIndicator size="sm" label={`Laying out ${filteredNodes.length.toLocaleString()} objects…`}/></div>}
  </div>;
}

export function ManifestRelationCanvas(props: Props) {
  return <ReactFlowProvider><Canvas {...props}/></ReactFlowProvider>;
}
