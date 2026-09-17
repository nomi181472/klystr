'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, FileCode2, FolderOpen, FolderSync, GitFork, Info, Link2, RotateCw, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManifestFindings } from './ManifestFindings';
import { ManifestInventory } from './ManifestInventory';
import { ManifestOverview } from './ManifestOverview';
import { ManifestRelationCanvas } from './ManifestRelationCanvas';
import { ManifestResourceInspector } from './ManifestResourceInspector';
import { ManifestClusterCompare } from './ManifestClusterCompare';
import { VirtualObjectList } from './VirtualObjectList';
import { EmptyState } from '@/components/ui/empty-state';
import { analyzeManifestGraph, type ManifestInsight } from '@/lib/manifest-graph/insights';
import type { GraphEdgeRecord, IngestEvent, ResourceNode } from '@/lib/manifest-graph/types';

interface ManifestGraph { sessionId: string; nodes: ResourceNode[]; edges: GraphEdgeRecord[] }
type DirectoryInput = HTMLInputElement & { webkitdirectory: boolean };
type WorkspaceView = 'overview' | 'map' | 'inventory' | 'findings' | 'compare';

function insightIcon(insight: ManifestInsight) {
  if (insight.severity === 'critical') return <AlertCircle size={13} className="mt-0.5 shrink-0 text-destructive-foreground"/>;
  if (insight.severity === 'warning') return <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning-foreground"/>;
  return <Info size={13} className="mt-0.5 shrink-0 text-info"/>;
}

function eventLocation(event: Extract<IngestEvent, { type: 'file-error' | 'file-warning' | 'chart-error' | 'chart-warning' }>) {
  return event.type === 'chart-error' || event.type === 'chart-warning' ? event.chartPath : event.filePath;
}

let cachedWorkspaceGraph: ManifestGraph | null = null;
let cachedFingerprint: string = '';

export function ManifestGraphWorkspace() {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [manifestUrl, setManifestUrl] = useState('');
  const [events, setEvents] = useState<IngestEvent[]>([]);
  const [graph, setGraph] = useState<ManifestGraph | null>(() => cachedWorkspaceGraph);
  const currentGraphRef = useRef<ManifestGraph | null>(graph);
  useEffect(() => {
    currentGraphRef.current = graph;
    if (graph) cachedWorkspaceGraph = graph;
  }, [graph]);

  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('klystr_manifest_selected_key') || sessionStorage.getItem('klystr_manifest_selected_key') || null;
    }
    return null;
  });
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => {
    if (typeof window !== 'undefined') {
      const saved = (localStorage.getItem('klystr_manifest_view') || sessionStorage.getItem('klystr_manifest_view')) as WorkspaceView;
      if (saved && ['overview', 'map', 'inventory', 'findings', 'compare'].includes(saved)) {
        return saved;
      }
    }
    return 'map';
  });
  const [isInsideVsCode, setIsInsideVsCode] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ relativePath: string; content: string }>>([]);
  const [currentDirInfo, setCurrentDirInfo] = useState<{ directory: string; count: number; files: Array<{ relativePath: string; size: number }> } | null>(null);

  const handleSelectKey = (key: string | null) => {
    setSelectedKey(key);
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem('klystr_manifest_selected_key', key);
        sessionStorage.setItem('klystr_manifest_selected_key', key);
      } else {
        localStorage.removeItem('klystr_manifest_selected_key');
        sessionStorage.removeItem('klystr_manifest_selected_key');
      }
    }
  };

  const handleViewChange = (view: WorkspaceView) => {
    setWorkspaceView(view);
    if (typeof window !== 'undefined') {
      localStorage.setItem('klystr_manifest_view', view);
      sessionStorage.setItem('klystr_manifest_view', view);
    }
  };

  const eventSummary = useMemo(() => ({
    done: [...events].reverse().find((event): event is Extract<IngestEvent, { type: 'done' }> => event.type === 'done'),
    progress: [...events].reverse().find((event): event is Extract<IngestEvent, { type: 'progress' }> => event.type === 'progress'),
    conflicts: events.filter((event): event is Extract<IngestEvent, { type: 'conflict' }> => event.type === 'conflict'),
    notices: events.filter((event): event is Extract<IngestEvent, { type: 'file-error' | 'file-warning' | 'chart-error' | 'chart-warning' }> => ['file-error', 'file-warning', 'chart-error', 'chart-warning'].includes(event.type)),
  }), [events]);
  const conflictKeys = useMemo(() => new Set(eventSummary.conflicts.map(event => event.key)), [eventSummary.conflicts]);
  const insights = useMemo(() => graph ? analyzeManifestGraph(graph.nodes, graph.edges, conflictKeys) : [], [conflictKeys, graph]);
  const insightCounts = useMemo(() => ({
    critical: insights.filter(insight => insight.severity === 'critical').length,
    warning: insights.filter(insight => insight.severity === 'warning').length,
    info: insights.filter(insight => insight.severity === 'info').length,
  }), [insights]);
  const nodeByKey = useMemo(() => new Map((graph?.nodes ?? []).map(node => [node.key, node])), [graph?.nodes]);
  const selected = (selectedKey ? nodeByKey.get(selectedKey) : undefined) ?? graph?.nodes[0] ?? null;
  const selectedEdges = useMemo(() => graph?.edges.filter(edge => edge.from === selected?.key || edge.to === selected?.key) ?? [], [graph?.edges, selected?.key]);
  const selectedInsights = useMemo(() => insights.filter(insight => insight.nodeKey === selected?.key), [insights, selected?.key]);

  const choose = (list: FileList | null, preserveChartFiles = false) => {
    const selectedFiles = [...(list ?? [])];
    setFiles(preserveChartFiles ? selectedFiles : selectedFiles.filter(file => /\.(ya?ml|json)$/i.test(file.name)));
    setEvents([]);
    setGraph(null);
    handleSelectKey(null);
    setError(null);
    handleViewChange('overview');
    cachedFingerprint = '';
  };

  const ingest = async (
    source: 'files' | 'url' | 'workspace' | 'current-directory' = 'files',
    customFiles?: Array<{ relativePath: string; content: string }>
  ) => {
    if (source === 'files' || source === 'url') {
      if (currentGraphRef.current?.sessionId) void fetch(`/api/manifest-graph/${currentGraphRef.current.sessionId}`, { method: 'DELETE' }).catch(() => undefined);
      setGraph(null);
      handleSelectKey(null);
    }
    setIngesting(true);
    setEvents([]);
    setError(null);
    try {
      let endpoint = '/api/manifest-graph/ingest';
      let body: BodyInit;
      const headers: HeadersInit = {};
      if (source === 'url') {
        body = JSON.stringify({ url: manifestUrl.trim() });
        headers['Content-Type'] = 'application/json';
      } else if (source === 'workspace' && customFiles) {
        body = JSON.stringify({ files: customFiles });
        headers['Content-Type'] = 'application/json';
      } else if (source === 'current-directory') {
        endpoint = '/api/manifest-graph/current-directory';
        body = JSON.stringify({});
        headers['Content-Type'] = 'application/json';
      } else {
        const form = new FormData();
        const metadata = files.map(file => ({ relativePath: file.webkitRelativePath || file.name, lastModified: file.lastModified, size: file.size }));
        files.forEach(file => form.append('files', file, file.name));
        form.append('manifest', JSON.stringify(metadata));
        body = form;
      }
      const response = await fetch(endpoint, { method: 'POST', headers, body });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ error: 'Upload failed.' })) as { error?: string };
        throw new Error(payload.error ?? 'Upload failed.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sessionId: string | null = null;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find(item => item.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as IngestEvent;
          setEvents(current => {
            if (event.type === 'parsed') return current;
            if (event.type === 'progress') return [...current.filter(item => item.type !== 'progress'), event];
            return [...current, event].slice(-500);
          });
          if (event.type === 'done') sessionId = event.sessionId;
        }
      }
      if (!sessionId) throw new Error('Ingestion ended before completion. Review the ingest report for the failing file or Helm chart.');
      const graphResponse = await fetch(`/api/manifest-graph/${sessionId}`);
      if (!graphResponse.ok) throw new Error('The graph could not be loaded.');
      const result = await graphResponse.json() as ManifestGraph;
      const degree = new Map<string, number>();
      for (const edge of result.edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
      }
      let initialNode = result.nodes[0];
      if (result.nodes.length > 250) for (const node of result.nodes) if ((degree.get(node.key) ?? 0) > (degree.get(initialNode?.key ?? '') ?? 0)) initialNode = node;
      
      setGraph(result);
      cachedWorkspaceGraph = result;
      if (typeof window !== 'undefined') {
        localStorage.setItem('klystr_manifest_session_id', sessionId);
        sessionStorage.setItem('klystr_manifest_session_id', sessionId);
      }
      setSelectedKey(currentKey => {
        const savedKey = typeof window !== 'undefined' ? (localStorage.getItem('klystr_manifest_selected_key') || sessionStorage.getItem('klystr_manifest_selected_key')) : null;
        const candidate = currentKey || savedKey;
        if (candidate && result.nodes.some(n => n.key === candidate)) {
          return candidate;
        }
        return initialNode?.key ?? null;
      });
      // Retain the current tab view (e.g. 'map') without resetting to 'overview'
      setWorkspaceView(currentView => {
        const savedView = typeof window !== 'undefined' ? ((localStorage.getItem('klystr_manifest_view') || sessionStorage.getItem('klystr_manifest_view')) as WorkspaceView) : null;
        return currentView || (savedView && ['overview', 'map', 'inventory', 'findings', 'compare'].includes(savedView) ? savedView : 'map');
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Manifest ingestion failed.');
    } finally {
      setIngesting(false);
    }
  };

  const [isCompareRefreshing, setIsCompareRefreshing] = useState(false);

  const handleCompareRefresh = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsCompareRefreshing(true);
    window.dispatchEvent(new CustomEvent('klystr:refresh:compare'));
    window.dispatchEvent(new CustomEvent('klystr:refresh', { detail: { pluginId: 'manifests-compare' } }));
    setTimeout(() => {
      setIsCompareRefreshing(false);
    }, 700);
  };

  useEffect(() => {
    let isMounted = true;

    // Restore cached graph session on mount to eliminate re-rendering when switching tabs
    const tryRestoreSavedGraph = async () => {
      if (currentGraphRef.current) return true;
      if (typeof window === 'undefined') return false;
      const savedSessionId = localStorage.getItem('klystr_manifest_session_id') || sessionStorage.getItem('klystr_manifest_session_id');
      if (!savedSessionId) return false;
      try {
        const res = await fetch(`/api/manifest-graph/${savedSessionId}`);
        if (res.ok) {
          const cachedGraph = await res.json() as ManifestGraph;
          if (isMounted && cachedGraph?.nodes && cachedGraph.nodes.length > 0) {
            setGraph(cachedGraph);
            cachedWorkspaceGraph = cachedGraph;
            return true;
          }
        }
      } catch {
        // Fallback to fresh scan
      }
      return false;
    };

    const fetchCurrentDirManifests = async () => {
      try {
        const res = await fetch('/api/manifest-graph/current-directory');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setCurrentDirInfo(data);
            if (data.count > 0 && !currentGraphRef.current && !cachedWorkspaceGraph) {
              void ingest('current-directory');
            }
          }
        }
      } catch (err) {
        console.warn('[ManifestVisibility] Current directory scan error:', err);
      }
    };

    void (async () => {
      const restored = await tryRestoreSavedGraph();
      if (!restored && !currentGraphRef.current && !cachedWorkspaceGraph) {
        void fetchCurrentDirManifests();
      }
    })();

    // Support VS Code extension messages if running inside VS Code
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.command === 'workspaceManifestsUpdated' || data?.command === 'workspaceManifestsResponse') {
        const scan = data.data;
        if (scan?.files && Array.isArray(scan.files) && scan.files.length > 0) {
          setIsInsideVsCode(true);
          setWorkspaceFiles(scan.files);

          // Avoid re-ingesting and wiping graph if workspace files have not changed
          const fingerprint = scan.files.map((f: { relativePath: string; content?: string }) => `${f.relativePath}:${f.content?.length ?? 0}`).join('|');
          if (fingerprint === cachedFingerprint && (currentGraphRef.current || cachedWorkspaceGraph)) {
            return;
          }
          cachedFingerprint = fingerprint;
          void ingest('workspace', scan.files);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    if (typeof window !== 'undefined' && window.parent !== window) {
      setIsInsideVsCode(true);
      window.parent.postMessage({ command: 'routeChanged', path: '/manifests', url: window.location.href }, '*');
      if (!cachedWorkspaceGraph && !currentGraphRef.current) {
        window.parent.postMessage({ command: 'requestWorkspaceManifests' }, '*');
      }
    }
    return () => {
      isMounted = false;
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      if (workspaceView === 'compare') {
        handleCompareRefresh();
      } else if (files.length > 0) {
        void ingest('files');
      } else if (manifestUrl.trim()) {
        void ingest('url');
      } else if (workspaceFiles.length > 0) {
        void ingest('workspace', workspaceFiles);
      } else {
        void ingest('current-directory');
      }
    };
    window.addEventListener('klystr:refresh:manifests', handleRefresh);
    return () => window.removeEventListener('klystr:refresh:manifests', handleRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, manifestUrl, workspaceFiles, workspaceView]);

  const openMap = (nodeKey?: string) => {
    if (nodeKey) handleSelectKey(nodeKey);
    handleViewChange('map');
  };

  const handleOpenInEditor = (filePath: string, line?: number, column?: number) => {
    if (!filePath) return;
    if (typeof window !== 'undefined') {
      if (window.parent !== window) {
        // Embedded inside VS Code Webview iframe
        window.parent.postMessage({
          command: 'openFileInEditor',
          filePath,
          line: line ?? 1,
          column: column ?? 1,
        }, '*');
      } else {
        // Standalone browser: attempt vscode:// URI scheme
        const targetUrl = `vscode://file/${encodeURI(filePath)}:${line ?? 1}:${column ?? 1}`;
        window.open(targetUrl, '_blank');
      }
    }
  };

  return <div className="flex h-full min-h-0 flex-col bg-background p-3 sm:p-4"><div className="mx-auto flex h-full min-h-0 w-full max-w-[1800px] flex-col gap-4">
    <Card className="shrink-0 border-border bg-card"><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><GitFork size={17} className="text-primary"/>Manifest visibility</CardTitle><CardDescription className="mt-1">Inspect declared-state Kubernetes YAMLs and Helm charts.{currentDirInfo?.directory && <span className="block mt-0.5 text-xs text-muted-foreground">Current directory: <code className="font-mono text-primary/90 bg-muted px-1.5 py-0.5 rounded text-[11px]">{currentDirInfo.directory}</code> ({currentDirInfo.count} manifest{currentDirInfo.count === 1 ? '' : 's'} detected)</span>}</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => void ingest('current-directory')} disabled={ingesting} title={currentDirInfo?.directory ? `Scan and ingest from ${currentDirInfo.directory}` : 'Scan current working directory'}><FolderSync size={14} className="text-primary"/>Current Directory {currentDirInfo ? `(${currentDirInfo.count})` : ''}</Button>{isInsideVsCode && workspaceFiles.length > 0 && <Button variant="outline" size="sm" onClick={() => void ingest('workspace', workspaceFiles)} disabled={ingesting}><FileCode2 size={14}/>Workspace ({workspaceFiles.length})</Button>}<Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={ingesting}><FileCode2 size={14}/>Files</Button><Button variant="outline" size="sm" onClick={() => folderInput.current?.click()} disabled={ingesting}><FolderOpen size={14}/>Folder</Button><Button size="sm" onClick={() => void ingest()} disabled={!files.length || ingesting}>{ingesting ? <LoadingIndicator size="sm"/> : <Upload size={14}/>}Ingest {files.length || ''}</Button></div></div></CardHeader><CardContent className="pt-0">
      <input ref={fileInput} hidden type="file" multiple accept=".yaml,.yml,.json" onClick={event => { event.currentTarget.value = ''; }} onChange={event => choose(event.target.files)}/>
      <input ref={element => { folderInput.current = element; if (element) (element as DirectoryInput).webkitdirectory = true; }} hidden type="file" multiple onClick={event => { event.currentTarget.value = ''; }} onChange={event => choose(event.target.files, true)}/>
      <form className="mb-3 flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); void ingest('url'); }}><div className="relative min-w-0 flex-1"><Link2 size={14} className="absolute left-2.5 top-2.5 text-muted-foreground"/><Input aria-label="Manifest YAML URL" type="url" value={manifestUrl} onChange={event => setManifestUrl(event.target.value)} placeholder="https://cdn.example.com/manifest.yaml" className="pl-8" disabled={ingesting}/></div><Button type="submit" variant="outline" size="sm" disabled={!manifestUrl.trim() || ingesting}>{ingesting ? <LoadingIndicator size="sm"/> : <Link2 size={14}/>}Import URL</Button></form>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted"><div className="bg-primary transition-all" style={{ width: eventSummary.done ? '100%' : eventSummary.progress ? `${eventSummary.progress.index / eventSummary.progress.total * 100}%` : '0%' }}/></div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground"><span>{files.length ? `${files.length.toLocaleString()} file(s) selected` : currentDirInfo ? `${currentDirInfo.count} manifest(s) in current directory` : 'Choose files or a folder to begin'}</span>{eventSummary.progress && <span>{eventSummary.progress.index}/{eventSummary.progress.total} · {eventSummary.progress.filePath}</span>}{eventSummary.done && <><Badge variant="outline">{eventSummary.done.nodeCount.toLocaleString()} objects</Badge><Badge variant="outline">{eventSummary.done.edgeCount.toLocaleString()} relations</Badge><Badge variant="outline" className={insightCounts.critical ? 'border-destructive/40 text-destructive-foreground' : ''}>{insightCounts.critical} critical</Badge><Badge variant="outline" className={insightCounts.warning ? 'border-warning/40 text-warning-foreground' : ''}>{insightCounts.warning} warnings</Badge></>}{eventSummary.conflicts.length > 0 && <span className="flex items-center gap-1 text-warning-foreground"><AlertTriangle size={12}/>{eventSummary.conflicts.length} conflicts</span>}</div>
      {error && <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive-foreground">{error}</p>}
      {eventSummary.notices.length > 0 && <details className="mt-2 rounded-md border border-border bg-muted/25"><summary className="cursor-pointer px-3 py-2 text-xs font-medium">Ingest report · {eventSummary.notices.length} notice{eventSummary.notices.length === 1 ? '' : 's'}</summary><div className="max-h-36 space-y-1 overflow-y-auto border-t border-border px-3 py-2">{eventSummary.notices.map((notice, index) => <div key={`${eventLocation(notice)}-${index}`} className="flex items-start gap-2 text-[10px]"><AlertTriangle size={11} className={`mt-0.5 shrink-0 ${notice.type.endsWith('error') ? 'text-destructive-foreground' : 'text-warning-foreground'}`}/><p><span className="font-mono">{eventLocation(notice)}</span>: <span className="text-muted-foreground">{notice.message}</span></p></div>)}</div></details>}
    </CardContent></Card>
    {graph ? <Tabs value={workspaceView} onValueChange={value => handleViewChange(value as WorkspaceView)} className="flex min-h-0 flex-1 flex-col"><TabsList className="mb-3 grid w-full max-w-2xl shrink-0 grid-cols-5"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="map">Map</TabsTrigger><TabsTrigger value="inventory">Inventory</TabsTrigger><TabsTrigger value="findings">Findings {insightCounts.critical + insightCounts.warning ? `(${insightCounts.critical + insightCounts.warning})` : ''}</TabsTrigger><TabsTrigger value="compare" className="group relative flex items-center justify-center gap-1.5"><span>Cluster Compare</span><button type="button" onClick={handleCompareRefresh} title="Reload Cluster Compare data" aria-label="Reload Cluster Compare data" className={`group/reload -mr-1 ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-all duration-200 hover:bg-muted/80 hover:text-primary hover:scale-110 active:scale-95 ${isCompareRefreshing ? 'opacity-100 text-primary pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}><RotateCw size={10} className={`transition-transform duration-300 ${isCompareRefreshing ? 'animate-spin' : 'group-hover/reload:rotate-180'}`}/></button></TabsTrigger></TabsList>
      <TabsContent value="overview" className="min-h-0 flex-1"><ManifestOverview nodes={graph.nodes} edges={graph.edges} insights={insights} onOpenMap={openMap}/></TabsContent>
      <TabsContent value="inventory" className="min-h-0 flex-1"><ManifestInventory nodes={graph.nodes} edges={graph.edges} insights={insights} selectedKey={selected?.key ?? null} onSelect={handleSelectKey} onOpenMap={openMap}/></TabsContent>
      <TabsContent value="findings" className="min-h-0 flex-1"><ManifestFindings nodes={graph.nodes} insights={insights} selectedKey={selected?.key ?? null} onSelect={handleSelectKey} onOpenMap={openMap}/></TabsContent>
      <div className={workspaceView === 'compare' ? 'min-h-0 flex-1 overflow-y-auto' : 'hidden'}><ManifestClusterCompare nodes={graph.nodes} onOpenInEditor={handleOpenInEditor} onIngestCurrentDir={() => void ingest('current-directory')}/></div>
      <div className={workspaceView === 'map' ? 'min-h-0 flex-1 overflow-hidden' : 'hidden'}><div className="grid h-full min-h-0 gap-4 overflow-y-auto xl:grid-cols-[250px_minmax(500px,1fr)_360px] xl:overflow-hidden">
        <Card className="hidden min-h-0 border-border bg-card xl:block"><CardHeader className="pb-2"><CardTitle className="text-sm">Explorer</CardTitle><CardDescription>{graph.nodes.length.toLocaleString()} objects · {insights.length.toLocaleString()} findings</CardDescription></CardHeader><CardContent className="h-[calc(100%-72px)] p-0"><Tabs defaultValue="objects" className="flex h-full flex-col"><TabsList className="mx-3 mb-2"><TabsTrigger value="objects">Objects</TabsTrigger><TabsTrigger value="findings">Findings</TabsTrigger></TabsList><TabsContent value="objects" className="min-h-0 flex-1"><VirtualObjectList nodes={graph.nodes} selectedKey={selected?.key ?? null} onSelect={handleSelectKey}/></TabsContent><TabsContent value="findings" className="min-h-0 flex-1"><ScrollArea className="h-full px-3 pb-3">{insights.slice(0, 500).map(insight => <button type="button" key={insight.id} onClick={() => handleSelectKey(insight.nodeKey)} className="mb-1.5 flex w-full items-start gap-2 rounded-md border border-border bg-muted/30 p-2 text-left hover:bg-muted">{insightIcon(insight)}<span className="min-w-0"><span className="block truncate text-[11px] font-medium">{insight.title}</span><span className="block truncate text-[9px] text-muted-foreground">{nodeByKey.get(insight.nodeKey)?.name}</span></span></button>)}{insights.length > 500 && <button type="button" className="w-full rounded-md border border-border p-2 text-[10px] text-muted-foreground hover:bg-muted" onClick={() => handleViewChange('findings')}>Open all {insights.length.toLocaleString()} findings</button>}</ScrollArea></TabsContent></Tabs></CardContent></Card>
        <ManifestRelationCanvas key="manifest-canvas" graph={graph} selectedKey={selected?.key ?? null} onSelect={handleSelectKey} insights={insights} onOpenInEditor={handleOpenInEditor}/>
        <ManifestResourceInspector selected={selected} selectedEdges={selectedEdges} selectedInsights={selectedInsights} nodeByKey={nodeByKey} onSelect={handleSelectKey} onOpenInEditor={handleOpenInEditor} className="min-h-[420px] xl:min-h-0"/>
      </div></div>
    </Tabs> : <EmptyState className="flex-1" icon={<GitFork/>} title="No manifest dataset loaded" description={currentDirInfo?.directory ? `Current directory (${currentDirInfo.directory}) has ${currentDirInfo.count} Kubernetes manifest file(s). You can also upload files, select folders, or import a manifest URL.` : "Scan the current directory, upload YAML/JSON files, or paste a manifest URL."} actions={<><Button size="sm" onClick={() => void ingest('current-directory')} disabled={ingesting}><FolderSync size={14}/>Fetch from Current Directory {currentDirInfo ? `(${currentDirInfo.count})` : ''}</Button><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><FileCode2 size={14}/>Choose files</Button><Button variant="outline" size="sm" onClick={() => folderInput.current?.click()}><FolderOpen size={14}/>Choose folder</Button></>} />}
  </div></div>;
}
