'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Download, FileText, FlaskConical, GitFork,
  LockKeyhole, Network, RefreshCw, Search, ShieldAlert, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ConnectionSettings } from '@/lib/types';
import type { SecurityAttackPath, SecurityExposure, SecuritySeverity, SecuritySnapshot, SecurityTestRun, SecurityWorkload } from '@/lib/security/types';

interface Props { activeContext?: string | null; connectionSettings: ConnectionSettings }

const activeTestDefinitions = [
  { id: 'api-permissions', title: 'Sensitive Secret access boundary', description: 'Review whether the connected identity can enumerate Secrets in the target namespace.', defaultEnabled: true },
  { id: 'network-reachability', title: 'NetworkPolicy visibility', description: 'Review access to the NetworkPolicy resources needed for exposure analysis.', defaultEnabled: true },
  { id: 'service-exposure', title: 'Service discovery visibility', description: 'Review whether the connected identity can list Services in the target namespace.', defaultEnabled: true },
  { id: 'token-boundary', title: 'ServiceAccount token boundary', description: 'Review whether the identity can mint ServiceAccount tokens in the target namespace.', defaultEnabled: false },
  { id: 'admission-dry-run', title: 'Admission policy visibility', description: 'Review access to ValidatingAdmissionPolicy configuration without submitting objects.', defaultEnabled: false },
] as const;

function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  const tones: Record<SecuritySeverity, StatusTone> = { critical: 'danger', high: 'warning', medium: 'info', low: 'success', info: 'neutral' };
  return <StatusBadge tone={tones[severity]}>{severity}</StatusBadge>;
}

function Metric({ label, value, detail, tone = 'text-foreground' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ClusterPosture({ snapshot }: { snapshot: SecuritySnapshot }) {
  const postureControls = snapshot.controls;
  const failed = postureControls.filter(item => item.status === 'fail').length;
  const warnings = postureControls.filter(item => item.status === 'warning').length;
  const coverage = Math.round(postureControls.reduce((sum, item) => sum + item.coverage, 0) / postureControls.length);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Posture score" value="68/100" detail="Mock weighted control score" />
        <Metric label="Failed controls" value={String(failed)} detail="Requires immediate review" tone="text-destructive-foreground" />
        <Metric label="Warnings" value={String(warnings)} detail="Partial or unverified coverage" tone="text-warning-foreground" />
        <Metric label="Observed coverage" value={`${coverage}%`} detail="Across 12 mock namespaces" tone="text-success-foreground" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Control coverage</CardTitle>
          <CardDescription>Live evidence calculated from Kubernetes resources visible to the connected identity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {postureControls.map(control => (
            <div key={control.id} className="rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${control.status === 'pass' ? 'bg-success' : control.status === 'fail' ? 'bg-destructive' : control.status === 'warning' ? 'bg-warning' : 'bg-muted-foreground'}`} />
                <p className="min-w-0 flex-1 text-xs font-semibold text-foreground">{control.title}</p>
                <Badge variant="outline" className="text-xs">{control.category}</Badge>
                <StatusBadge status={control.status === 'pass' ? 'healthy' : control.status === 'fail' ? 'failed' : 'warning'}>
                  {control.status}
                </StatusBadge>
                <span className="text-xs font-medium tabular-nums text-foreground">{control.coverage}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${control.status === 'pass' ? 'bg-success' : control.status === 'fail' ? 'bg-destructive' : control.status === 'warning' ? 'bg-warning' : 'bg-muted-foreground'}`}
                  style={{ width: `${control.coverage}%` }}
                />
              </div>
              <div className="mt-2.5 grid gap-2 text-xs text-muted-foreground lg:grid-cols-2">
                <p><strong className="font-medium text-foreground">Evidence:</strong> {control.evidence}</p>
                <p><strong className="font-medium text-foreground">Next action:</strong> {control.recommendation}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AttackPaths({ attackPaths }: { attackPaths: SecurityAttackPath[] }) {
  const [selectedId, setSelectedId] = useState(attackPaths[0]?.id ?? '');
  if (!attackPaths.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <ShieldCheck className="mx-auto text-success-foreground size-8" />
          <p className="mt-3 text-sm font-semibold">No sensitive RBAC paths found</p>
          <p className="mt-1 text-xs text-muted-foreground">This result only covers RBAC resources visible to the connected identity.</p>
        </CardContent>
      </Card>
    );
  }
  const selected = attackPaths.find(path => path.id === selectedId) ?? attackPaths[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Prioritized paths</CardTitle>
          <CardDescription>Transitive RBAC and workload relationships.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {attackPaths.map(path => (
            <button
              key={path.id}
              type="button"
              onClick={() => setSelectedId(path.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${selected.id === path.id ? 'border-primary/40 bg-primary/10' : 'border-border hover:bg-muted/40'}`}
            >
              <span className="flex items-start gap-2">
                <GitFork size={14} className="mt-0.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{path.title}</span>
                <SeverityBadge severity={path.severity} />
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">{path.nodes.length} connected steps</span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="min-w-0 flex-1 text-sm">{selected.title}</CardTitle>
            <SeverityBadge severity={selected.severity} />
          </div>
          <CardDescription>{selected.summary}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-stretch gap-2">
            {selected.nodes.map((node, index) => (
              <div key={`${node.type}:${node.label}`} className="contents">
                <div className="min-w-40 flex-1 rounded-xl border border-border bg-muted/25 p-3">
                  <Badge variant="outline" className="text-xs">{node.type}</Badge>
                  <p className="mt-2 break-all text-xs font-semibold text-foreground">{node.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{node.detail}</p>
                </div>
                {index < selected.nodes.length - 1 && <ArrowRight size={15} className="self-center text-muted-foreground" />}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
            <strong className="font-semibold text-foreground">Defensive interpretation:</strong> Reduce permissions at the narrowest binding, disable unnecessary token automounting, and validate the path after remediation.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NetworkExposureView({ networkExposures }: { networkExposures: SecurityExposure[] }) {
  const [query, setQuery] = useState('');
  const [namespace, setNamespace] = useState('all');
  const namespaces = [...new Set(networkExposures.map(item => item.namespace))];
  const rows = networkExposures.filter(item => (namespace === 'all' || item.namespace === namespace) && `${item.entrypoint} ${item.workload} ${item.route}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Exposure inventory</CardTitle>
            <CardDescription>Entrypoints traced to backing workloads and policy coverage.</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search exposure" className="h-8 w-48 pl-8 text-xs" />
            </div>
            <Select value={namespace} onValueChange={value => setNamespace(value ?? 'all')}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All namespaces</SelectItem>
                {namespaces.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="min-w-[850px] text-xs">
          <TableHeader>
            <TableRow>
              {['Entrypoint', 'Namespace', 'Route', 'Workload', 'Exposure', 'Policy', 'Risk'].map(label => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-foreground">{item.entrypoint}</TableCell>
                <TableCell>{item.namespace}</TableCell>
                <TableCell className="text-muted-foreground">{item.route}</TableCell>
                <TableCell className="font-mono">{item.workload}</TableCell>
                <TableCell>{item.exposure}</TableCell>
                <TableCell className="text-muted-foreground">{item.policy}</TableCell>
                <TableCell><SeverityBadge severity={item.severity} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function WorkloadSecurity({ workloadRisks }: { workloadRisks: SecurityWorkload[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {workloadRisks.map(item => (
        <Card key={item.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-2">
              <ShieldAlert size={15} className="mt-0.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm">{item.workload}</CardTitle>
                <CardDescription>{item.namespace} · {item.containers} containers</CardDescription>
              </div>
              <SeverityBadge severity={item.severity} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pod Security profile</span>
              <Badge variant="outline" className="capitalize">{item.pss}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.risks.map(risk => (
                <Badge key={risk} variant="secondary" className="font-normal text-[11px]">{risk}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ActiveTests({ namespaces, onRun }: { namespaces: string[]; onRun: (ids: string[], namespace: string) => Promise<SecurityTestRun> }) {
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(activeTestDefinitions.filter(test => test.defaultEnabled).map(test => test.id)));
  const [authorized, setAuthorized] = useState(false);
  const [namespace, setNamespace] = useState(namespaces[0] ?? 'default');
  const [status, setStatus] = useState<'idle'|'running'|'done'>('idle');
  const [runResult, setRunResult] = useState<SecurityTestRun>();
  const [error, setError] = useState<string>();

  const run = async () => {
    setStatus('running');
    setError(undefined);
    try {
      setRunResult(await onRun([...enabled], namespace));
      setStatus('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Security tests failed');
      setStatus('idle');
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Read-only validation plan</CardTitle>
          <CardDescription>Production-safe checks use Kubernetes SelfSubjectAccessReview. They do not create pods, send traffic, or exploit workloads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeTestDefinitions.map(test => (
            <label key={test.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted/25">
              <Switch checked={enabled.has(test.id)} onCheckedChange={checked => { const next = new Set(enabled); if (checked) next.add(test.id); else next.delete(test.id); setEnabled(next); setStatus('idle'); }} aria-label={`Enable ${test.title}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{test.title}</span>
                  <Badge variant="outline" className="text-[11px]">read-only</Badge>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{test.description}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Validation controls</CardTitle>
          <CardDescription>Every check is evaluated as the currently connected Kubernetes identity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Target namespace</p>
            <Select value={namespace} onValueChange={value => value && setNamespace(value)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(namespaces.length ? namespaces : ['default']).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={authorized} onCheckedChange={value => setAuthorized(Boolean(value))} />
            <span>
              <strong className="text-foreground">I am authorized to assess this cluster</strong>
              <br />
              <span className="text-muted-foreground">The server only submits authorization reviews.</span>
            </span>
          </label>
          <Button className="w-full" disabled={!authorized || enabled.size === 0 || status === 'running'} onClick={() => void run()}>
            <FlaskConical size={14} />
            {status === 'running' ? 'Running reviews…' : 'Run read-only validation'}
          </Button>
          {error && <p role="alert" className="text-xs text-destructive-foreground">{error}</p>}
          {status === 'done' && runResult && (
            <div className="space-y-2">
              {runResult.results.map(result => (
                <div key={result.id} className="rounded-xl border border-border p-2.5 text-xs">
                  <p className={`flex items-center gap-1.5 font-semibold ${result.status === 'pass' ? 'text-success-foreground' : result.status === 'fail' ? 'text-destructive-foreground' : 'text-warning-foreground'}`}>
                    <CheckCircle2 size={13} />
                    {result.title}
                  </p>
                  <p className="mt-1 text-muted-foreground">{result.evidence}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Reports({ snapshot }: { snapshot: SecuritySnapshot }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `klystr-security-${snapshot.contextName}-${snapshot.generatedAt.slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const critical = snapshot.attackPaths.filter(item => item.severity === 'critical').length + snapshot.workloadRisks.filter(item => item.severity === 'critical').length;
  const high = snapshot.attackPaths.filter(item => item.severity === 'high').length + snapshot.networkExposures.filter(item => item.severity === 'high').length + snapshot.workloadRisks.filter(item => item.severity === 'high').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Assessment report</CardTitle>
        <CardDescription>Export the current evidence snapshot for review, automation, or remediation tracking.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3.5">
          <FileText size={16} className="text-muted-foreground" />
          <div className="min-w-52 flex-1">
            <p className="text-xs font-semibold text-foreground">Cluster security assessment · {snapshot.contextName}</p>
            <p className="mt-1 text-xs text-muted-foreground">{new Date(snapshot.generatedAt).toLocaleString()} · {snapshot.namespaces} visible namespaces</p>
          </div>
          <div className="flex gap-4 text-center">
            <span>
              <strong className="block text-xs font-bold text-destructive-foreground">{critical}</strong>
              <small className="text-[10px] text-muted-foreground">critical</small>
            </span>
            <span>
              <strong className="block text-xs font-bold text-warning-foreground">{high}</strong>
              <small className="text-[10px] text-muted-foreground">high</small>
            </span>
          </div>
          <Badge variant="outline">Live snapshot</Badge>
          <Button variant="outline" size="sm" onClick={download}>
            <Download size={13} />
            Download JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SecurityWorkspace({ activeContext, connectionSettings }: Props) {
  const context = useMemo(() => activeContext || 'current', [activeContext]);
  const [snapshot, setSnapshot] = useState<SecuritySnapshot>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const requestSequence = useRef(0);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';
    const response = await fetch(`/api/security${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...connectionSettings, ...body }),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error ?? `Security request failed (${response.status})`));
    return payload;
  }, [activeContext, connectionSettings]);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setSnapshot(undefined);
    setError(undefined);
    try {
      const result = await request({ action: 'snapshot' }) as unknown as SecuritySnapshot;
      if (sequence === requestSequence.current) setSnapshot(result);
    } catch (cause) {
      if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : 'Security assessment failed');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runTests = useCallback(async (testIds: string[], namespace: string) => request({ action: 'test', testIds, namespace }) as unknown as Promise<SecurityTestRun>, [request]);
  const namespaces = useMemo(() => [...new Set([...(snapshot?.workloadRisks.map(item => item.namespace) ?? []), ...(snapshot?.networkExposures.map(item => item.namespace) ?? [])])].sort(), [snapshot]);
  const isSample = snapshot?.source === 'sample';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-card p-4 sm:p-5">
        <PageHeader
          title="Security"
          description={
            <>
              {connectionSettings.mode === 'mock' ? 'Sample security assessment and interaction preview' : 'Live cluster visibility, exposure analysis, defensive validation, and reporting'} · <span className="font-mono">{snapshot?.contextName ?? context}</span>
            </>
          }
          icon={<ShieldCheck />}
          actions={
            <>
              <Badge variant="outline" className={isSample ? 'border-info/30 bg-info/5 text-info' : snapshot ? 'border-success/30 bg-success/5 text-success-foreground' : ''}>
                {isSample ? 'Mock data' : snapshot ? 'Live data' : connectionSettings.mode === 'mock' ? 'Loading mock data' : 'Awaiting live data'}
              </Badge>
              <Badge variant="outline">Read-only assessment</Badge>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </>
          }
        />
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-info/25 bg-info/5 px-3.5 py-2.5 text-xs text-muted-foreground">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-info" />
          <span>
            {connectionSettings.mode === 'mock'
              ? 'This workspace is using deterministic sample evidence. Switch to Live cluster and apply the connection settings to assess Kubernetes.'
              : 'The live assessment lists visible Kubernetes resources and submits SelfSubjectAccessReviews. It does not create, update, delete, exec into, or send traffic from cluster resources. Results are limited by the connected identity’s RBAC visibility.'}
          </span>
        </div>
      </div>

      {loading && !snapshot ? (
        <div className="grid flex-1 place-items-center">
          <LoadingIndicator size="md" label={connectionSettings.mode === 'mock' ? 'Loading sample security data…' : 'Assessing visible cluster resources…'} className="justify-center" />
        </div>
      ) : error && !snapshot ? (
        <div className="grid flex-1 place-items-center p-6">
          <Card className="max-w-xl">
            <CardContent className="py-10 text-center">
              <AlertTriangle className="mx-auto text-warning-foreground size-8" />
              <p className="mt-3 text-sm font-semibold">Security assessment unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        </div>
      ) : snapshot ? (
        <Tabs defaultValue="posture" className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 overflow-x-auto border-b border-border px-4 sm:px-5">
            <TabsList className="h-10 w-max bg-transparent p-0 gap-1">
              <TabsTrigger value="posture"><ShieldCheck size={14} className="mr-1.5" />Cluster posture</TabsTrigger>
              <TabsTrigger value="rbac"><GitFork size={14} className="mr-1.5" />RBAC attack paths</TabsTrigger>
              <TabsTrigger value="network"><Network size={14} className="mr-1.5" />Network exposure</TabsTrigger>
              <TabsTrigger value="workloads"><LockKeyhole size={14} className="mr-1.5" />Workload security</TabsTrigger>
              <TabsTrigger value="tests"><FlaskConical size={14} className="mr-1.5" />Active tests</TabsTrigger>
              <TabsTrigger value="reports"><FileText size={14} className="mr-1.5" />Reports</TabsTrigger>
            </TabsList>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 sm:p-6 lg:p-7">
              {error && (
                <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                  {error}
                </div>
              )}
              {snapshot.warnings.length > 0 && (
                <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                  <strong className="text-warning-foreground font-semibold">Partial visibility:</strong> {snapshot.warnings.length} Kubernetes resource requests failed. Controls show only evidence visible to this identity.
                </div>
              )}
              <TabsContent value="posture"><ClusterPosture snapshot={snapshot} /></TabsContent>
              <TabsContent value="rbac"><AttackPaths attackPaths={snapshot.attackPaths} /></TabsContent>
              <TabsContent value="network"><NetworkExposureView networkExposures={snapshot.networkExposures} /></TabsContent>
              <TabsContent value="workloads"><WorkloadSecurity workloadRisks={snapshot.workloadRisks} /></TabsContent>
              <TabsContent value="tests"><ActiveTests namespaces={namespaces} onRun={runTests} /></TabsContent>
              <TabsContent value="reports"><Reports snapshot={snapshot} /></TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      ) : null}
    </div>
  );
}
