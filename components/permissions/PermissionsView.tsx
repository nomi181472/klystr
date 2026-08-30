'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, KeyRound, RefreshCw, ShieldCheck, ShieldX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PERMISSION_TARGETS, SENSITIVE_CHECKS } from '@/lib/k8s/permission-catalog';
import type { ConnectionSettings, PermissionCheck, PermissionsResponse } from '@/lib/types';

interface PermissionsViewProps {
  activeContext: string | null;
  connectionSettings: ConnectionSettings;
  namespaces: string[];
}

type CellState = 'allowed' | 'denied' | 'unknown';

function stateOf(check?: PermissionCheck): CellState {
  if (!check || check.evaluationError) return 'unknown';
  return check.allowed ? 'allowed' : 'denied';
}

function combinedState(checks: Array<PermissionCheck | undefined>): CellState {
  const states = checks.map(stateOf);
  if (states.includes('allowed')) return 'allowed';
  if (states.every(state => state === 'denied')) return 'denied';
  return 'unknown';
}

function PermissionMark({ state, label }: { state: CellState; label: string }) {
  if (state === 'allowed') return <span title={`${label}: allowed`} aria-label={`${label}: allowed`} className="inline-flex size-6 items-center justify-center rounded-full bg-success/15 text-success-foreground"><Check size={14} /></span>;
  if (state === 'denied') return <span title={`${label}: denied`} aria-label={`${label}: denied`} className="inline-flex size-6 items-center justify-center rounded-full bg-destructive/12 text-destructive-foreground"><X size={14} /></span>;
  return <span title={`${label}: check unavailable`} aria-label={`${label}: check unavailable`} className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">?</span>;
}

export function PermissionsView({ activeContext, connectionSettings, namespaces }: PermissionsViewProps) {
  const [namespace, setNamespace] = useState('*');
  const [result, setResult] = useState<PermissionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPermissions() {
    setLoading(true);
    setError(null);
    try {
      const selectedNamespace = connectionSettings.mode === 'mock' ? 'mock' : namespace;
      const params = new URLSearchParams({ namespace: selectedNamespace });
      if (activeContext) params.set('ctx', activeContext);
      const response = await fetch(`/api/permissions?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionSettings),
      });
      const payload = await response.json() as PermissionsResponse;
      if (!response.ok || payload.error) throw new Error(payload.error ?? `Permission request failed (${response.status})`);
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to fetch Kubernetes permissions');
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const values = result ? Object.values(result.checks) : [];
    return {
      allowed: values.filter(check => stateOf(check) === 'allowed').length,
      denied: values.filter(check => stateOf(check) === 'denied').length,
      unknown: values.filter(check => stateOf(check) === 'unknown').length,
    };
  }, [result]);

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-7">
        <PageHeader
          title="My Kubernetes permissions"
          description="Check what the currently authenticated identity can do. This uses read-only SelfSubjectAccessReviews and never attempts the operations."
          icon={<ShieldCheck />}
          actions={
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5">
              <span className="text-xs font-medium text-muted-foreground">Scope:</span>
              <Select
                value={connectionSettings.mode === 'mock' ? 'mock' : namespace}
                onValueChange={value => { if (value) setNamespace(value); }}
                disabled={connectionSettings.mode === 'mock'}
              >
                <SelectTrigger className="h-9 w-52 bg-background font-mono text-xs" aria-label="Namespace for permission checks">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connectionSettings.mode === 'mock' ? (
                    <SelectItem value="mock">Mock namespace</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="*">All namespaces (* / -A)</SelectItem>
                      {namespaces.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </>
                  )}
                </SelectContent>
              </Select>
              <Button onClick={() => void fetchPermissions()} disabled={loading} className="h-9 shrink-0">
                {loading ? <LoadingIndicator size="sm" label="Checking…" /> : <><RefreshCw size={14} /> Fetch permissions</>}
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground">
            Context <strong className="ml-1 font-mono text-foreground">{result?.contextName ?? activeContext ?? 'current'}</strong>
          </span>
          {result && (
            <>
              <StatusBadge tone={result.source === 'live' ? 'success' : 'neutral'}>
                {result.source === 'live' ? 'Live API checks' : 'Mock data'}
              </StatusBadge>
              <StatusBadge tone="success">{summary.allowed} allowed</StatusBadge>
              <StatusBadge tone="danger">{summary.denied} denied</StatusBadge>
              {summary.unknown > 0 && <StatusBadge tone="neutral">{summary.unknown} unavailable</StatusBadge>}
              <span className="ml-auto text-muted-foreground">Checked {new Date(result.checkedAt).toLocaleString()}</span>
            </>
          )}
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-foreground">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!result && !loading ? (
          <EmptyState
            icon={<KeyRound />}
            title="Fetch access for this identity"
            description="Choose the namespace you work in, then fetch to see effective resource and special-action permissions."
          />
        ) : result && (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <Table className="min-w-[900px]">
                <TableHeader className="bg-muted/95 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-4 py-3 font-semibold">Access area</TableHead>
                    <TableHead className="w-20 px-3 py-3 text-center font-semibold">Read</TableHead>
                    <TableHead className="w-20 px-3 py-3 text-center font-semibold">Create</TableHead>
                    <TableHead className="w-28 px-3 py-3 text-center font-semibold">Update / patch</TableHead>
                    <TableHead className="w-20 px-3 py-3 text-center font-semibold">Delete</TableHead>
                    <TableHead className="min-w-72 px-4 py-3 font-semibold">Special actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSION_TARGETS.map(target => {
                    const prefix = target.id;
                    return (
                      <TableRow key={target.id} className="transition-colors hover:bg-muted/35">
                        <TableCell className="px-4 py-3">
                          <div className="font-medium text-foreground">{target.label}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {target.description}
                            {target.namespaced
                              ? ` · ${target.id === 'systemcomponents' ? 'kube-system' : result.namespace === '*' ? 'all namespaces' : result.namespace}`
                              : ' · cluster-wide'}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center">
                          <PermissionMark state={stateOf(result.checks[`${prefix}.get`])} label={`Read ${target.label}`} />
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center">
                          <PermissionMark state={stateOf(result.checks[`${prefix}.create`])} label={`Create ${target.label}`} />
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center">
                          <PermissionMark state={combinedState([result.checks[`${prefix}.update`], result.checks[`${prefix}.patch`]])} label={`Update or patch ${target.label}`} />
                        </TableCell>
                        <TableCell className="px-3 py-3 text-center">
                          <PermissionMark state={stateOf(result.checks[`${prefix}.delete`])} label={`Delete ${target.label}`} />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {target.special?.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {target.special.map(action => {
                                const state = stateOf(result.checks[action.id]);
                                return (
                                  <span
                                    key={action.id}
                                    title={action.description}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium ${
                                      state === 'allowed'
                                        ? 'border-success/25 bg-success/10 text-success-foreground'
                                        : state === 'denied'
                                          ? 'border-border bg-muted/60 text-muted-foreground'
                                          : 'border-warning/25 bg-warning/10 text-warning-foreground'
                                    }`}
                                  >
                                    {state === 'allowed' ? <Check size={10} /> : state === 'denied' ? <X size={10} /> : '?'}
                                    {action.label}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <Card className="border-warning/30 bg-warning/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle size={16} className="text-warning-foreground" />
                  Sensitive capabilities
                </CardTitle>
                <CardDescription>Review these carefully when applying least privilege.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-3">
                  {SENSITIVE_CHECKS.map(item => {
                    const state = stateOf(result.checks[item.id]);
                    return (
                      <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-2xs">
                        <PermissionMark state={state} label={item.label} />
                        <div>
                          <div className="text-xs font-medium text-foreground">{item.label}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{item.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldX size={16} className="text-muted-foreground" />
                  Kubernetes verb reference
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries({
                    get: 'Read one resource',
                    list: 'List resources',
                    watch: 'Monitor changes',
                    create: 'Create resources',
                    update: 'Replace resources',
                    patch: 'Modify part of a resource',
                    delete: 'Delete one resource',
                    deletecollection: 'Bulk delete',
                    bind: 'Bind powerful roles',
                    escalate: 'Create stronger RBAC roles',
                    impersonate: 'Act as another identity',
                    approve: 'Approve certificate requests',
                  }).map(([verb, meaning]) => (
                    <div key={verb} className="flex gap-2">
                      <code className="w-24 shrink-0 font-mono text-primary">{verb}</code>
                      <span className="text-muted-foreground">{meaning}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

