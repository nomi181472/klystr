'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Box, CheckCircle2, Gauge, RefreshCw, Search, Server, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { Switch } from '@/components/ui/switch';
import type { ConnectionSettings } from '@/lib/types';
import type { ImageInventoryItem, ImageScan, ImageScanResources, ImageScanStep, ImageUsage } from '@/lib/image-analysis/types';
import { ImageVerificationBadge } from '@/components/image-analysis/ImageVerificationBadge';
import { PageHeader } from '@/components/ui/page-header';

import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PodUsage {
  pod: string;
  namespace: string;
  containers: string[];
  status?: string;
  node?: string;
}

function uniquePods(usages: ImageUsage[]): PodUsage[] {
  const pods = new Map<string, PodUsage>();
  for (const usage of usages) {
    const id = `${usage.namespace}/${usage.pod}`;
    const pod = pods.get(id) ?? {
      pod: usage.pod,
      namespace: usage.namespace,
      containers: [],
      status: usage.status,
      node: usage.node,
    };
    if (!pod.containers.includes(usage.container)) pod.containers.push(usage.container);
    pods.set(id, pod);
  }
  return [...pods.values()].sort((a, b) => a.namespace.localeCompare(b.namespace) || a.pod.localeCompare(b.pod));
}

function isRunning(status?: string) {
  return status?.toLowerCase() === 'running';
}

export function ImageAnalysisView({ activeContext, connectionSettings }: { activeContext: string | null; connectionSettings: ConnectionSettings }) {
  const [items, setItems] = useState<ImageInventoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ImageInventoryItem | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [provisioningSteps, setProvisioningSteps] = useState<ImageScanStep[]>([]);
  const [podListImage, setPodListImage] = useState<ImageInventoryItem | null>(null);
  const [scan, setScan] = useState<ImageScan | null>(null);
  const [error, setError] = useState('');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyStage, setVerifyStage] = useState<'confirm' | 'critical'>('confirm');
  const [verifyText, setVerifyText] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationRefresh, setVerificationRefresh] = useState(0);
  const [mockVerifiedImages, setMockVerifiedImages] = useState<Set<string>>(() => new Set());
  const [verificationPromptDismissedFor, setVerificationPromptDismissedFor] = useState<string | null>(null);
  const [constrainScan, setConstrainScan] = useState(true);
  const [scanCpuRequest, setScanCpuRequest] = useState('25m');
  const [scanMemoryRequest, setScanMemoryRequest] = useState('128Mi');
  const [scanCpuLimit, setScanCpuLimit] = useState('1');
  const [scanMemoryLimit, setScanMemoryLimit] = useState('1Gi');
  const inspectRequest = useRef(0);

  async function refresh() {
    setLoading(true);
    const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';
    try {
      const response = await fetch(`/api/image-analysis/inventory${params}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(connectionSettings),
      });
      const result = await response.json() as { images?: ImageInventoryItem[]; error?: string };
      setItems(result.images ?? []);
      setError(result.error ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to discover images');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
    // Connection changes must refresh the authoritative server inventory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext, connectionSettings]);

  useEffect(() => {
    const handleRefresh = () => {
      void refresh();
    };
    window.addEventListener('klystr:refresh:images', handleRefresh);
    return () => window.removeEventListener('klystr:refresh:images', handleRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext, connectionSettings]);

  useEffect(() => {
    if (!selected || !scan || ['completed', 'completed-with-warnings', 'failed'].includes(scan.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/image-analysis/scans?imageId=${selected.id}`);
      if (response.ok) { const next = await response.json() as ImageScan; setScan(next); setProvisioningSteps(next.steps ?? []); }
    }, 700);
    return () => window.clearInterval(timer);
  }, [selected, scan]);

  async function analyze() {
    if (!selected) return;
    setAnalyzing(true);
    setScan(null);
    setError('');
    setProvisioningSteps([{ id: 'request', label: 'Sending analysis request', status: 'running' }]);
    const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';
    const resourceConfiguration: ImageScanResources = constrainScan ? {
      constrained: true,
      requests: { cpu: scanCpuRequest, memory: scanMemoryRequest },
      limits: { cpu: scanCpuLimit, memory: scanMemoryLimit },
    } : { constrained: false };
    try {
      const response = await fetch(`/api/image-analysis/scans${params}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...connectionSettings, imageId: selected.id, image: selected.image, resourceConfiguration }),
      });
      if (!response.ok || !response.body) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error ?? 'Unable to start scan');
      }
      setProvisioningSteps(current => current.map(step => step.id === 'request' ? { ...step, label: 'Analysis request accepted', status: 'completed' } : step));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      let finalScan: ImageScan | null = null;
      while (true) {
        const { done, value } = await reader.read();
        buffered += decoder.decode(value, { stream: !done });
        const lines = buffered.split('\n');
        buffered = done ? '' : lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; step?: ImageScanStep; scan?: ImageScan; error?: string };
          if (event.type === 'progress' && event.step) setProvisioningSteps(current => [...current.filter(step => step.id !== event.step!.id), event.step!]);
          if (event.type === 'scan' && event.scan) { finalScan = event.scan; setScan(event.scan); setProvisioningSteps(event.scan.steps ?? []); }
          if (event.type === 'error') throw new Error(event.error ?? 'Unable to start scan');
        }
        if (done) break;
      }
      if (!finalScan) throw new Error('The server ended the analysis request without returning scan status.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to start scan';
      setError(message);
      setProvisioningSteps(current => [...current.filter(step => step.status !== 'running'), { id: 'request-error', label: 'Analysis request failed', status: 'failed', detail: message }]);
    } finally {
      setAnalyzing(false);
    }
  }

  async function inspect(item: ImageInventoryItem) {
    const requestId = ++inspectRequest.current;
    setSelected(item);
    setScan(null);
    setProvisioningSteps([]);
    setScanLoading(true);
    setVerificationPromptDismissedFor(null);
    try {
      const response = await fetch(`/api/image-analysis/scans?imageId=${encodeURIComponent(item.id)}`);
      if (response.ok) {
        const previous = await response.json() as ImageScan | null;
        if (previous && inspectRequest.current === requestId) {
          setScan(previous); setProvisioningSteps(previous.steps ?? []);
          if (previous.resourceConfiguration) {
            setConstrainScan(previous.resourceConfiguration.constrained);
            setScanCpuRequest(previous.resourceConfiguration.requests?.cpu ?? '25m');
            setScanMemoryRequest(previous.resourceConfiguration.requests?.memory ?? '128Mi');
            setScanCpuLimit(previous.resourceConfiguration.limits?.cpu ?? '1');
            setScanMemoryLimit(previous.resourceConfiguration.limits?.memory ?? '1Gi');
          }
        }
      } else {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error ?? 'Unable to load the previous scan.');
      }
    } catch (cause) {
      if (inspectRequest.current === requestId) setError(cause instanceof Error ? cause.message : 'Unable to load the previous scan.');
    } finally {
      if (inspectRequest.current === requestId) setScanLoading(false);
    }
  }

  async function verifyImage(criticalAcknowledged: boolean) {
    if (!selected) return;
    if (connectionSettings.mode === 'mock') {
      setMockVerifiedImages(current => new Set(current).add(selected.id));
      setVerifyOpen(false);
      setVerifyStage('confirm');
      setVerifyText('');
      return;
    }
    setVerifying(true);
    const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';
    try {
      const response = await fetch(`/api/image-analysis/verification${params}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...connectionSettings, action: 'verify', imageId: selected.id, criticalAcknowledged }) });
      const result = await response.json() as { verified?: boolean; error?: string; requiresCriticalAcknowledgement?: boolean };
      if (response.status === 409 || result.requiresCriticalAcknowledgement) { setVerifyStage('critical'); return; }
      if (!response.ok) throw new Error(result.error ?? 'Unable to save verification');
      setVerifyOpen(false); setVerifyStage('confirm'); setVerifyText(''); setVerificationRefresh(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save verification'); }
    finally { setVerifying(false); }
  }

  const shown = items.filter(item => `${item.image} ${item.registry} ${item.namespaces} ${item.usages.map(usage => `${usage.pod} ${usage.container}`).join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex h-full overflow-hidden">
      <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-7">
        <PageHeader
          className="mb-5"
          title="Image Analysis"
          description="Unique images running in Kubernetes Pods."
          icon={<Box />}
          actions={
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          }
        />
        <div className="relative mb-4 max-w-xl">
          <Search className="absolute left-3 top-2.5 text-muted-foreground" size={14} />
          <Input className="h-9 pl-9 text-xs" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search image, registry, pod, container or namespace" />
        </div>
        {error && <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground">{error}</div>}
        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-border bg-card">
            <LoadingIndicator size="md" label="Discovering images…" className="justify-center" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <Table className="min-w-[1280px] table-fixed text-xs">
              <colgroup>
                <col className="w-[150px]"/><col className="w-[300px]"/><col className="w-[160px]"/><col className="w-[130px]"/><col className="w-[180px]"/><col className="w-[160px]"/><col className="w-[120px]"/><col className="w-[110px]"/><col className="w-[100px]"/>
              </colgroup>
              <TableHeader className="bg-muted/70">
                <TableRow>
                  <TableHead className="p-3">Image</TableHead>
                  <TableHead className="p-3">Reference</TableHead>
                  <TableHead className="p-3">Registry</TableHead>
                  <TableHead className="p-3">Tag</TableHead>
                  <TableHead className="p-3">Namespaces</TableHead>
                  <TableHead className="p-3">Pods</TableHead>
                  <TableHead className="p-3">Verification</TableHead>
                  <TableHead className="p-3">Status</TableHead>
                  <TableHead className="p-3"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(item => {
                  const pods = uniquePods(item.usages);
                  const running = pods.filter(pod => isRunning(pod.status)).length;
                  return (
                    <TableRow key={item.id} className="align-middle hover:bg-muted/30">
                      <TableCell className="truncate p-3 font-medium text-foreground" title={item.shortName}>{item.shortName}</TableCell>
                      <TableCell className="truncate p-3 font-mono text-muted-foreground" title={item.image}>{item.image}</TableCell>
                      <TableCell className="truncate p-3 text-muted-foreground" title={item.registry}>{item.registry}</TableCell>
                      <TableCell className="truncate p-3 font-mono text-muted-foreground" title={item.tag}>{item.tag}</TableCell>
                      <TableCell className="truncate p-3 text-muted-foreground" title={item.namespaces.join(', ')}>{item.namespaces.join(', ')}</TableCell>
                      <TableCell className="p-3">
                        <Button variant="outline" size="sm" className="h-7 w-full justify-center whitespace-nowrap text-xs" onClick={() => setPodListImage(item)}>
                          <span className="font-semibold text-success-foreground">{running}</span> running <span className="text-muted-foreground">/ {pods.length} total</span>
                        </Button>
                      </TableCell>
                      <TableCell className="p-3">
                        <ImageVerificationBadge identities={[...new Set(item.usages.map(usage => usage.imageIdentity))]} activeContext={activeContext} connectionSettings={connectionSettings} refreshKey={verificationRefresh} mockVerified={mockVerifiedImages.has(item.id)} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap p-3">
                        <StatusBadge tone="neutral">{item.status.replaceAll('-', ' ')}</StatusBadge>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => void inspect(item)}>Inspect</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {selected && (
        <aside className="w-[420px] overflow-auto border-l border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{selected.shortName}</h3>
            <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => setSelected(null)} aria-label="Close inspector">
              <X size={14} />
            </Button>
          </div>
          <div>
            <ImageVerificationBadge identities={[...new Set(selected.usages.map(usage => usage.imageIdentity))]} activeContext={activeContext} connectionSettings={connectionSettings} refreshKey={verificationRefresh} mockVerified={mockVerifiedImages.has(selected.id)} />
          </div>
          <p className="break-all rounded-lg border border-border bg-muted/40 p-2.5 font-mono text-xs text-muted-foreground">{selected.image}</p>
          <ScanResourceControls constrained={constrainScan} onConstrainedChange={setConstrainScan} cpuRequest={scanCpuRequest} onCpuRequestChange={setScanCpuRequest} memoryRequest={scanMemoryRequest} onMemoryRequestChange={setScanMemoryRequest} cpuLimit={scanCpuLimit} onCpuLimitChange={setScanCpuLimit} memoryLimit={scanMemoryLimit} onMemoryLimitChange={setScanMemoryLimit} disabled={analyzing || scanLoading || (!!scan && !['completed', 'completed-with-warnings', 'failed'].includes(scan.status))} />
          <Button className="w-full" onClick={() => { setVerificationPromptDismissedFor(null); void analyze(); }} disabled={analyzing || scanLoading || (!!scan && !['completed', 'completed-with-warnings', 'failed'].includes(scan.status))}>
            {scanLoading ? <LoadingIndicator size="sm" label="Loading previous scan…" /> : analyzing ? <LoadingIndicator size="sm" label="Preparing resources…" /> : scan && !['completed', 'completed-with-warnings', 'failed'].includes(scan.status) ? 'Analysis in progress' : scan && ['completed', 'completed-with-warnings'].includes(scan.status) ? 'Run analysis again' : 'Analyze image'}
          </Button>
          {provisioningSteps.length > 0 && <ScanProvisioningProgress steps={provisioningSteps} />}
          {scan && <ScanResult scan={scan} />}
          {scan && ['completed', 'completed-with-warnings'].includes(scan.status) && verificationPromptDismissedFor !== selected.id && !mockVerifiedImages.has(selected.id) && (
            <Card className="border-border bg-muted/30">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Save this inspected image as verified for this Klystr project?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { setVerifyStage('confirm'); setVerifyOpen(true); }}>
                    <ShieldCheck size={13} />
                    Save verified status
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setVerificationPromptDismissedFor(selected.id)}>Keep unverified</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      )}

      {podListImage && <PodUsageDialog image={podListImage} onClose={() => setPodListImage(null)} />}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{verifyStage === 'critical' ? 'Critical vulnerabilities detected' : 'Verify inspected image?'}</DialogTitle>
            <DialogDescription>{verifyStage === 'critical' ? 'This image contains critical vulnerabilities. Verification records an explicit acceptance; it does not make the image safe.' : 'Klystr will sign this image identity with the server secret and append it to verified_images.json.'}</DialogDescription>
          </DialogHeader>
          {verifyStage === 'critical' ? (
            <div className="space-y-3">
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                <AlertTriangle size={16} className="shrink-0" />
                Double-check the vulnerability report. Type VERIFY to confirm that you intentionally accept this image.
              </div>
              <Input value={verifyText} onChange={event => setVerifyText(event.target.value)} placeholder="Type VERIFY" className="font-mono text-xs" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setVerifyOpen(false)}>Cancel</Button>
                <Button variant="destructive" disabled={verifyText !== 'VERIFY' || verifying} onClick={() => void verifyImage(true)}>
                  {verifying ? <LoadingIndicator size="sm" label="Signing…" /> : 'Accept and verify'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVerifyOpen(false)}>Keep unverified</Button>
              <Button disabled={verifying} onClick={() => scan?.vulnerabilities.some(vulnerability => vulnerability.severity === 'CRITICAL') ? setVerifyStage('critical') : void verifyImage(false)}>
                {verifying ? <LoadingIndicator size="sm" label="Signing…" /> : 'Verify image'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ScanResourceControlsProps {
  constrained: boolean;
  onConstrainedChange: (value: boolean) => void;
  cpuRequest: string;
  onCpuRequestChange: (value: string) => void;
  memoryRequest: string;
  onMemoryRequestChange: (value: string) => void;
  cpuLimit: string;
  onCpuLimitChange: (value: string) => void;
  memoryLimit: string;
  onMemoryLimitChange: (value: string) => void;
  disabled: boolean;
}

function ScanResourceControls(props: ScanResourceControlsProps) {
  const fields = [
    { id: 'scan-cpu-request', label: 'CPU request', value: props.cpuRequest, change: props.onCpuRequestChange, placeholder: '25m' },
    { id: 'scan-memory-request', label: 'Memory request', value: props.memoryRequest, change: props.onMemoryRequestChange, placeholder: '128Mi' },
    { id: 'scan-cpu-limit', label: 'CPU limit', value: props.cpuLimit, change: props.onCpuLimitChange, placeholder: '1' },
    { id: 'scan-memory-limit', label: 'Memory limit', value: props.memoryLimit, change: props.onMemoryLimitChange, placeholder: '1Gi' },
  ];
  return (
    <Card className="border-border bg-muted/20">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Gauge size={13} />Scanner resources</div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Applied only to the Trivy Job created for this analysis.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Label htmlFor="scan-resource-toggle" className="text-[10px] text-muted-foreground">Constrain</Label>
            <Switch id="scan-resource-toggle" checked={props.constrained} disabled={props.disabled} onCheckedChange={props.onConstrainedChange} className="scale-75" />
          </div>
        </div>
        {props.constrained ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {fields.map(field => (
              <div key={field.id}>
                <Label htmlFor={field.id} className="text-[10px] text-muted-foreground">{field.label}</Label>
                <Input id={field.id} value={field.value} disabled={props.disabled} onChange={event => field.change(event.target.value)} placeholder={field.placeholder} className="mt-1 h-8 font-mono text-xs" spellCheck={false} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-[10px] leading-4 text-warning-foreground">
            No CPU or memory requests/limits will be added. The scan may use available node capacity and can be throttled or evicted by Kubernetes.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScanProvisioningProgress({ steps }: { steps: ImageScanStep[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Kubernetes resources
      </div>
      <ol className="divide-y divide-border/60">
        {steps.map(step => (
          <li key={step.id} className="flex gap-2.5 px-3 py-2.5">
            <div className="mt-0.5 shrink-0">
              {step.status === 'running' ? <LoadingIndicator size="xs" label={undefined} className="gap-0" /> : step.status === 'completed' ? <CheckCircle2 size={14} className="text-success-foreground" /> : <AlertTriangle size={14} className="text-destructive-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-medium ${step.status === 'failed' ? 'text-destructive-foreground' : 'text-foreground'}`}>{step.label}</div>
              {step.resource && (
                <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5">{step.resource.kind}</span>
                  <span className="truncate" title={`${step.resource.namespace}/${step.resource.name}`}>{step.resource.namespace}/{step.resource.name}</span>
                </div>
              )}
              {step.detail && <p className="mt-1 break-words text-[10px] leading-4 text-muted-foreground">{step.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PodUsageDialog({ image, onClose }: { image: ImageInventoryItem; onClose: () => void }) {
  const pods = uniquePods(image.usages);
  const running = pods.filter(pod => isRunning(pod.status)).length;
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pods using {image.shortName}</DialogTitle>
          <DialogDescription>{running} running out of {pods.length} total Pods. One Pod may use the image in multiple containers.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted">
              <TableRow>
                {['Pod', 'Namespace', 'Container(s)', 'Status', 'Node'].map(header => (
                  <TableHead key={header} className="p-3">{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pods.map(pod => (
                <TableRow key={`${pod.namespace}/${pod.pod}`}>
                  <TableCell className="p-3 font-mono font-medium">{pod.pod}</TableCell>
                  <TableCell className="p-3 font-mono text-muted-foreground">{pod.namespace}</TableCell>
                  <TableCell className="p-3 text-muted-foreground">{pod.containers.join(', ')}</TableCell>
                  <TableCell className="p-3">
                    <StatusBadge tone={isRunning(pod.status) ? 'success' : 'warning'}>
                      {pod.status ?? 'Unknown'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="p-3">
                    {pod.node ? <span className="flex items-center gap-1.5 font-mono text-muted-foreground"><Server size={12} />{pod.node}</span> : <span className="text-muted-foreground">Not scheduled</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScanResult({ scan }: { scan: ImageScan }) {
  if (scan.status === 'failed') return <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive-foreground">{scan.error ?? 'Scan failed.'}</div>;
  if (!['completed', 'completed-with-warnings'].includes(scan.status)) {
    return (
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <LoadingIndicator size="sm" />
          <p className="capitalize text-xs font-medium text-foreground">{scan.status.replaceAll('-', ' ')}</p>
        </div>
        {scan.message && <p className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs leading-5 text-warning-foreground">{scan.message}</p>}
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
            <p className="mt-1 text-lg font-semibold text-foreground">{scan.vulnerabilities.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Fixable</span>
            <p className="mt-1 text-lg font-semibold text-success-foreground">{scan.vulnerabilities.filter(v => v.fixedVersion).length}</p>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {scan.vulnerabilities.map(vulnerability => (
          <details key={`${vulnerability.id}-${vulnerability.packageName}`} className="group rounded-lg border border-border bg-card p-2.5 text-xs">
            <summary className="cursor-pointer font-medium text-foreground flex items-center justify-between">
              <span><StatusBadge tone={vulnerability.severity === 'CRITICAL' ? 'danger' : vulnerability.severity === 'HIGH' ? 'warning' : 'info'} className="mr-1.5">{vulnerability.severity}</StatusBadge>{vulnerability.id}</span>
              <span className="text-[10px] text-muted-foreground">{vulnerability.packageName}</span>
            </summary>
            <p className="mt-2 text-muted-foreground">
              {vulnerability.title}
              <span className="block mt-1 font-mono text-[11px] text-foreground">{vulnerability.installedVersion} → {vulnerability.fixedVersion ?? 'No fix'}</span>
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
