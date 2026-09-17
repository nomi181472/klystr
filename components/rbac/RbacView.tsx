'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Plus, RefreshCw, Shield, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionsView } from '@/components/permissions/PermissionsView';
import { RBAC_RESOURCES, RBAC_VERBS, type RbacIdentity, type RbacInventory, type RbacRuleSelection, type RbacVerb } from '@/lib/rbac/types';
import type { ConnectionSettings } from '@/lib/types';

import { PageHeader } from '@/components/ui/page-header';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Props { activeContext: string | null; connectionSettings: ConnectionSettings; namespaces: string[] }
const emptyIdentity = (namespace: string): RbacIdentity => ({ name: '', namespace, scope: 'namespace', managed: true, rules: [] });

export function RbacView({ activeContext, connectionSettings, namespaces }: Props) {
  const [workspace, setWorkspace] = useState<'management' | 'permissions'>('management');
  const [namespace, setNamespace] = useState(connectionSettings.mode === 'mock' ? 'klystr' : '');
  const [inventory, setInventory] = useState<RbacInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editor, setEditor] = useState<RbacIdentity | null>(null);
  const [editingExisting, setEditingExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tokenFor, setTokenFor] = useState<RbacIdentity | null>(null);
  const [token, setToken] = useState<{ token: string; expiresAt: string } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';
    const response = await fetch(`/api/rbac${params}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...connectionSettings, ...body }) });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error ?? `RBAC request failed (${response.status})`));
    return payload;
  }, [activeContext, connectionSettings]);

  const load = useCallback(async (selected = '') => {
    setLoading(true); setError(undefined);
    try {
      const result = await request({ action: 'inventory', namespace: selected }) as unknown as RbacInventory;
      setInventory(result);
      if (!selected && result.namespaces.length) setNamespace(result.namespaces.includes('klystr') ? 'klystr' : result.namespaces[0]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load RBAC'); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const handleRefresh = () => {
      void load(namespace);
    };
    window.addEventListener('klystr:refresh:rbac', handleRefresh);
    return () => window.removeEventListener('klystr:refresh:rbac', handleRefresh);
  }, [load, namespace]);

  function hasVerb(resourceId: string, verb: RbacVerb) { return editor?.rules.find(rule => rule.resourceId === resourceId)?.verbs.includes(verb) ?? false; }
  function setRules(resourceId: string, verbs: RbacVerb[]) {
    setEditor(current => current && ({ ...current, rules: [...current.rules.filter(rule => rule.resourceId !== resourceId), ...(verbs.length ? [{ resourceId, verbs } satisfies RbacRuleSelection] : [])] }));
  }
  function toggleCell(resourceId: string, verb: RbacVerb) {
    const current = editor?.rules.find(rule => rule.resourceId === resourceId)?.verbs ?? [];
    setRules(resourceId, current.includes(verb) ? current.filter(item => item !== verb) : [...current, verb]);
  }
  function toggleRow(resourceId: string) {
    const complete = RBAC_VERBS.every(verb => hasVerb(resourceId, verb));
    setRules(resourceId, complete ? [] : [...RBAC_VERBS]);
  }
  async function save() {
    if (!editor) return;
    const critical = editor.scope === 'cluster' || editor.rules.some(rule => RBAC_RESOURCES.find(resource => resource.id === rule.resourceId)?.risk === 'critical');
    if (critical && !window.confirm('This grants cluster-wide or security-sensitive access. Are you sure you want to continue?')) return;
    setSaving(true); setError(undefined);
    try { await request({ action: 'save', identity: editor }); setEditor(null); setEditingExisting(false); setNamespace(editor.namespace); await load(editor.namespace); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save RBAC'); }
    finally { setSaving(false); }
  }
  async function issueToken() {
    if (!tokenFor) return; setTokenLoading(true); setToken(null); setError(undefined);
    try { setToken(await request({ action: 'token', namespace: tokenFor.namespace, name: tokenFor.name, durationSeconds: 600 }) as unknown as { token: string; expiresAt: string }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to issue token'); }
    finally { setTokenLoading(false); }
  }

  const selectedCount = useMemo(() => editor?.rules.reduce((count, rule) => count + rule.verbs.length, 0) ?? 0, [editor]);
  const effectiveNamespace = namespace || inventory?.namespaces[0] || 'klystr';
  const workspaceNav = (
    <div className="sticky top-0 z-30 flex h-10 shrink-0 items-end gap-1 border-b border-border bg-card px-4 sm:px-6" aria-label="RBAC workspace sections">
      <button
        type="button"
        onClick={() => setWorkspace('management')}
        className={`flex h-9 items-center border-b-2 px-3 text-xs font-medium transition-colors ${
          workspace === 'management'
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
        aria-current={workspace === 'management' ? 'page' : undefined}
      >
        Access management
      </button>
      <button
        type="button"
        onClick={() => setWorkspace('permissions')}
        className={`flex h-9 items-center border-b-2 px-3 text-xs font-medium transition-colors ${
          workspace === 'permissions'
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
        aria-current={workspace === 'permissions' ? 'page' : undefined}
      >
        My permissions
      </button>
    </div>
  );

  if (workspace === 'permissions') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {workspaceNav}
        <div className="min-h-0 flex-1">
          <PermissionsView activeContext={activeContext} connectionSettings={connectionSettings} namespaces={inventory?.namespaces ?? namespaces} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      {workspaceNav}
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-7">
        <PageHeader
          title="RBAC control"
          description="Manage ServiceAccount identities, effective permissions, and short-lived tokens. Every live write runs a SelfSubjectAccessReview first."
          icon={<Shield />}
          actions={
            <>
              <Select value={effectiveNamespace} onValueChange={value => { if (value) { setNamespace(value); void load(value); } }}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(inventory?.namespaces ?? [effectiveNamespace]).map(item => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void load(effectiveNamespace)} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Refresh
              </Button>
              <Button onClick={() => { setEditingExisting(false); setEditor(emptyIdentity(effectiveNamespace)); }}>
                <Plus size={14} />
                Add identity
              </Button>
            </>
          }
        />

        {error && (
          <div role="alert" className="whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-foreground">
            <AlertTriangle className="mr-2 inline" size={16} />
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4 py-3">ServiceAccount</TableHead>
                <TableHead className="px-4 py-3">Scope</TableHead>
                <TableHead className="px-4 py-3">Permissions</TableHead>
                <TableHead className="px-4 py-3">Ownership</TableHead>
                <TableHead className="px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-12 text-center text-muted-foreground">
                    <LoadingIndicator size="md" label="Loading cluster RBAC…" className="justify-center" />
                  </TableCell>
                </TableRow>
              ) : inventory?.identities.length ? (
                inventory.identities.map(identity => (
                  <TableRow key={`${identity.namespace}/${identity.name}`}>
                    <TableCell className="px-4 py-3">
                      <div className="font-medium text-foreground">{identity.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{identity.namespace}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge tone="neutral">{identity.scope}</StatusBadge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {identity.rules.reduce((n, rule) => n + rule.verbs.length, 0)} grants across {identity.rules.length} resources
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {identity.managed ? (
                        <StatusBadge tone="success" dot>klystr managed</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">External · read only</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setTokenFor(identity); setToken(null); }}>
                          <KeyRound size={13} />
                          Token
                        </Button>
                        <Button size="sm" onClick={() => { setEditingExisting(true); setEditor(structuredClone(identity)); }} disabled={!identity.managed}>
                          Edit permissions
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="p-14 text-center text-muted-foreground">
                    <UserRoundCog className="mx-auto mb-3 size-8 text-muted-foreground" />
                    No ServiceAccounts found in this namespace.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !saving) { setEditor(null); setEditingExisting(false); } }}>
        <DialogContent className="grid h-[min(900px,92vh)] w-[calc(100vw-2rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
          <DialogHeader className="border-b p-5 pr-12">
            <DialogTitle>{editingExisting ? `Edit ${editor?.name}` : 'Create RBAC identity'}</DialogTitle>
            <DialogDescription>Select individual cells, or click a resource row to toggle every verb. {selectedCount} grants selected.</DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="min-h-0 overflow-auto px-5">
              <div className="grid grid-cols-1 gap-3 border-b bg-popover py-4 md:grid-cols-3">
                <label className="text-xs text-muted-foreground">
                  Name
                  <Input className="mt-1" value={editor.name} disabled={editingExisting} onChange={event => setEditor({ ...editor, name: event.target.value.toLowerCase() })} />
                </label>
                <label className="text-xs text-muted-foreground">
                  Namespace
                  <Select value={editor.namespace} disabled={editingExisting} onValueChange={value => value && setEditor({ ...editor, namespace: value })}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{(inventory?.namespaces ?? []).map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Scope
                  <Select value={editor.scope} disabled={editingExisting} onValueChange={value => value && setEditor({ ...editor, scope: value as RbacIdentity['scope'] })}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="namespace">This namespace</SelectItem>
                      <SelectItem value="cluster">Cluster-wide</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <Table className="min-w-[800px] table-fixed text-xs">
                <TableHeader className="sticky top-0 z-10 bg-popover">
                  <TableRow className="border-b text-muted-foreground">
                    <TableHead className="w-56 p-3 text-left">Resource</TableHead>
                    {RBAC_VERBS.map(verb => <TableHead key={verb} className="p-3 text-center capitalize">{verb}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {RBAC_RESOURCES.map(resource => (
                    <TableRow key={resource.id} className="hover:bg-muted/30">
                      <TableCell className="p-3 text-left">
                        <button type="button" className="w-full text-left" onClick={() => toggleRow(resource.id)}>
                          <span className="font-medium text-foreground">{resource.label}</span>
                          {resource.risk && (
                            <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${resource.risk === 'critical' ? 'bg-destructive/15 text-destructive-foreground' : 'bg-warning/15 text-warning-foreground'}`}>
                              {resource.risk}
                            </span>
                          )}
                          <span className="block font-normal text-muted-foreground font-mono text-[11px]">{resource.group || 'core'}/{resource.resource}</span>
                        </button>
                      </TableCell>
                      {RBAC_VERBS.map(verb => (
                        <TableCell key={verb} className="p-2 text-center">
                          <button
                            type="button"
                            aria-label={`${verb} ${resource.label}`}
                            aria-pressed={hasVerb(resource.id, verb)}
                            onClick={() => toggleCell(resource.id, verb)}
                            className={`inline-flex size-7 items-center justify-center rounded-lg border transition-all ${
                              hasVerb(resource.id, verb)
                                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                                : 'border-border hover:border-primary/60'
                            }`}
                          >
                            {hasVerb(resource.id, verb) && <Check size={14} />}
                          </button>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter className="m-0 border-t p-4">
            <Button variant="outline" onClick={() => { setEditor(null); setEditingExisting(false); }} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !editor?.name || selectedCount === 0}>
              {saving ? <LoadingIndicator size="sm" label="Checking can-i, then saving…" /> : editingExisting ? 'Update permissions' : 'Create identity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tokenFor)} onOpenChange={open => { if (!open) { setTokenFor(null); setToken(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Short-lived ServiceAccount token</DialogTitle>
            <DialogDescription>Issued with Kubernetes TokenRequest, displayed once, and not stored by klystr.</DialogDescription>
          </DialogHeader>
          {token ? (
            <div className="space-y-2">
              <div className="break-all rounded-lg border border-border bg-muted p-3 font-mono text-xs">{token.token}</div>
              <p className="text-xs text-muted-foreground">Expires {new Date(token.expiresAt).toLocaleString()}</p>
              <Button variant="outline" className="w-full" onClick={() => void navigator.clipboard.writeText(token.token)}>
                <Copy size={14} />
                Copy token
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              Create a 10-minute token for <strong>{tokenFor?.namespace}/{tokenFor?.name}</strong>.
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => void issueToken()} disabled={tokenLoading}>
              {tokenLoading ? <LoadingIndicator size="sm" label="Checking can-i…" /> : token ? 'Issue another token' : 'Issue token'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
