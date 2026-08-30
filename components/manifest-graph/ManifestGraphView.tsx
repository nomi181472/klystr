'use client';

export { ManifestGraphWorkspace as ManifestGraphView } from './ManifestGraphWorkspace';

/* Legacy implementation retained only because this workspace file cannot be removed by the current Windows ACL.
import { useRef, useState } from 'react';
import { AlertTriangle, FileCode2, FolderOpen, GitFork, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GraphEdgeRecord, IngestEvent, ResourceNode } from '@/lib/manifest-graph/types';

interface ManifestGraph { sessionId: string; nodes: ResourceNode[]; edges: GraphEdgeRecord[] }
type DirectoryInput = HTMLInputElement & { webkitdirectory: boolean };

export function ManifestGraphView() {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [events, setEvents] = useState<IngestEvent[]>([]);
  const [graph, setGraph] = useState<ManifestGraph | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = graph?.nodes.find(node => node.key === selectedKey) ?? graph?.nodes[0] ?? null;
  const done = [...events].reverse().find((event): event is Extract<IngestEvent, { type: 'done' }> => event.type === 'done');
  const progress = [...events].reverse().find((event): event is Extract<IngestEvent, { type: 'progress' }> => event.type === 'progress');
  const conflicts = events.filter(event => event.type === 'conflict');
  const failures = events.filter(event => event.type === 'file-error' || event.type === 'chart-error');

  const choose = (list: FileList | null, preserveChartFiles = false) => {
    const selectedFiles = [...(list ?? [])];
    setFiles(preserveChartFiles ? selectedFiles : selectedFiles.filter(file => /\.(ya?ml|json)$/i.test(file.name)));
    setEvents([]); setGraph(null); setSelectedKey(null); setError(null);
  };

  const ingest = async () => {
    setIngesting(true); setEvents([]); setGraph(null); setError(null);
    try {
      const form = new FormData();
      const metadata = files.map(file => ({ relativePath: file.webkitRelativePath || file.name, lastModified: file.lastModified, size: file.size }));
      files.forEach(file => form.append('files', file, file.name));
      form.append('manifest', JSON.stringify(metadata));
      const response = await fetch('/api/manifest-graph/ingest', { method: 'POST', body: form });
      if (!response.ok || !response.body) throw new Error((await response.json()).error ?? 'Upload failed.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '', sessionId: string | null = null;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split('\n\n'); buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find(item => item.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as IngestEvent;
          setEvents(current => [...current, event]);
          if (event.type === 'done') sessionId = event.sessionId;
        }
      }
      if (!sessionId) throw new Error('Ingestion ended before completion.');
      const graphResponse = await fetch(`/api/manifest-graph/${sessionId}`);
      if (!graphResponse.ok) throw new Error('The graph could not be loaded.');
      const result = await graphResponse.json() as ManifestGraph;
      setGraph(result); setSelectedKey(result.nodes[0]?.key ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Manifest ingestion failed.'); }
    finally { setIngesting(false); }
  };

  return <div className="flex h-full min-h-0 flex-col bg-background p-4"><div className="mx-auto flex h-full w-full max-w-[1500px] min-h-0 flex-col gap-4">
    <Card className="shrink-0 border-border bg-card"><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><GitFork size={17} className="text-primary"/>Manifest dependency graph</CardTitle><CardDescription className="mt-1">Upload raw manifests or Helm chart folders. Cluster REST discovery remains separate.</CardDescription></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={ingesting}><FileCode2 size={14}/>Files</Button><Button variant="outline" size="sm" onClick={() => folderInput.current?.click()} disabled={ingesting}><FolderOpen size={14}/>Folder</Button><Button size="sm" onClick={() => void ingest()} disabled={!files.length || ingesting}>{ingesting ? <LoadingIndicator size="sm"/> : <Upload size={14}/>}Ingest {files.length || ''}</Button></div></div></CardHeader><CardContent>
      <input ref={fileInput} hidden type="file" multiple accept=".yaml,.yml,.json" onChange={event => choose(event.target.files)}/><input ref={element => { folderInput.current = element; if (element) (element as DirectoryInput).webkitdirectory = true; }} hidden type="file" multiple onChange={event => choose(event.target.files, true)}/>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted"><div className="bg-primary transition-all" style={{ width: done ? '100%' : progress ? `${progress.index / progress.total * 100}%` : '0%' }}/></div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground"><span>{files.length ? `${files.length} file(s) selected` : 'Choose files or a folder to begin'}</span>{progress && <span>{progress.index}/{progress.total} · {progress.filePath}</span>}{done && <><Badge variant="outline">{done.nodeCount} nodes</Badge><Badge variant="outline">{done.edgeCount} edges</Badge></>}{conflicts.length > 0 && <span className="flex items-center gap-1 text-warning-foreground"><AlertTriangle size={12}/>{conflicts.length} conflicts</span>}</div>
      {error && <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive-foreground">{error}</p>}{failures.map((failure, index) => <p key={index} className="mt-2 rounded-md border border-warning/30 bg-warning-surface p-2 text-xs text-warning-foreground">{failure.type === 'chart-error' ? failure.chartPath : failure.filePath}: {failure.message}</p>)}
    </CardContent></Card>
    {graph ? <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
      <Card className="min-h-0 border-border bg-card"><CardHeader className="pb-2"><CardTitle className="text-sm">Resources</CardTitle><CardDescription>{graph.nodes.length} parsed objects</CardDescription></CardHeader><CardContent className="h-[calc(100%-72px)] p-0"><ScrollArea className="h-full px-3 pb-3">{graph.nodes.map(node => <button key={node.key} onClick={() => setSelectedKey(node.key)} className={`mb-1.5 w-full rounded-md border p-2 text-left ${selected?.key === node.key ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted'}`}><div className="flex justify-between gap-2"><span className="truncate text-xs font-medium">{node.name}</span><Badge variant="outline" className="text-[9px]">{node.kind}</Badge></div><p className="mt-1 truncate text-[10px] text-muted-foreground">{node.namespace ?? 'cluster-scoped'} · {node.source.filePath}</p></button>)}</ScrollArea></CardContent></Card>
      <Card className="min-h-0 border-border bg-card"><CardHeader className="pb-2"><CardTitle className="text-sm">{selected?.name}</CardTitle><CardDescription className="truncate">{selected?.key}</CardDescription></CardHeader><CardContent className="h-[calc(100%-72px)]"><ScrollArea className="h-full pr-3"><Tabs defaultValue="containers"><TabsList><TabsTrigger value="containers">Containers ({selected?.containers.length ?? 0})</TabsTrigger><TabsTrigger value="references">Pod refs</TabsTrigger><TabsTrigger value="manifest">Manifest</TabsTrigger></TabsList><TabsContent value="containers" className="mt-3 space-y-3">{(['container','initContainer','ephemeralContainer'] as const).map(role => { const items = selected?.containers.filter(item => item.role === role) ?? []; return items.length ? <section key={role}><h4 className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">{role}s</h4>{items.map(container => { const refs = [...(selected?.structuralRefs ?? []), ...(selected?.literalRefs ?? [])].filter(ref => ref.containerName === container.name && ref.containerRole === role); return <div key={`${role}-${container.index}`} className="mb-2 rounded-lg border border-border bg-muted/35 p-3"><div className="flex justify-between"><span className="font-medium">{container.name}</span><Badge variant="outline" className="text-[9px]">{role} · {container.index}</Badge></div><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{container.spec.image ?? 'No image declared'}</p><p className="mt-2 text-[10px] text-muted-foreground">{refs.length} attributable reference(s)</p>{refs.map((ref, index) => <p key={index} className="mt-1 truncate rounded bg-card px-2 py-1 font-mono text-[9px]" title={ref.fieldPath}>{ref.fieldPath}</p>)}</div>})}</section> : null;})}{selected?.containers.length === 0 && <p className="text-xs text-muted-foreground">This resource has no Pod containers.</p>}</TabsContent><TabsContent value="references" className="mt-3">{selected?.structuralRefs.filter(ref => !ref.containerName).map((ref,index) => <div key={index} className="mb-2 rounded-md border border-border bg-muted/30 p-2"><p className="font-mono text-[10px]">{ref.fieldPath}</p><p className="mt-1 text-[10px] text-muted-foreground">{ref.candidateNodeKeys.length} candidate(s) · {ref.resolved ? 'resolved' : 'unresolved'}</p></div>)}</TabsContent><TabsContent value="manifest" className="mt-3"><pre className="overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[10px]">{JSON.stringify(selected?.raw, null, 2)}</pre></TabsContent></Tabs></ScrollArea></CardContent></Card>
      <Card className="min-h-0 border-border bg-card"><CardHeader className="pb-2"><CardTitle className="text-sm">Dependencies</CardTitle><CardDescription>Container attribution is preserved.</CardDescription></CardHeader><CardContent className="h-[calc(100%-72px)] p-0"><ScrollArea className="h-full px-3 pb-3">{graph.edges.filter(edge => edge.from === selected?.key || edge.to === selected?.key).map((edge,index) => <div key={index} className="mb-2 rounded-md border border-border bg-muted/30 p-2"><div className="flex justify-between"><Badge variant="outline" className="text-[9px]">{edge.type}</Badge>{edge.meta?.containerName && <span className="text-[10px] text-primary">{String(edge.meta.containerName)}</span>}</div><p className="mt-2 break-all font-mono text-[9px] text-muted-foreground">{edge.from === selected?.key ? `→ ${edge.to}` : `← ${edge.from}`}</p></div>)}</ScrollArea></CardContent></Card>
    </div> : <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-card/40"><div className="max-w-sm text-center"><GitFork size={32} className="mx-auto text-muted-foreground"/><h2 className="mt-3 text-sm font-semibold">No manifest graph loaded</h2><p className="mt-1 text-xs text-muted-foreground">Upload YAML, JSON, multiple files, or a Helm chart folder.</p></div></div>}
  </div></div>;
}
*/
