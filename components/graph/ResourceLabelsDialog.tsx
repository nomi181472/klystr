'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Plus, ShieldX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import type { ConnectionSettings, GraphNode, LabelPermissionResponse } from '@/lib/types';

interface LabelRow { id: number; key: string; value: string }

interface ResourceLabelsDialogProps {
  node: GraphNode;
  contextName: string | null;
  connectionSettings: ConnectionSettings;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

let nextRowId = 1;

function initialRows(labels: Record<string, string> | undefined): LabelRow[] {
  const rows = Object.entries(labels ?? {}).map(([key, value]) => ({ id: nextRowId++, key, value }));
  return rows.length ? rows : [{ id: nextRowId++, key: '', value: '' }];
}

function validLabelKey(value: string) {
  const name = value.includes('/') ? value.slice(value.lastIndexOf('/') + 1) : value;
  return value.length <= 253 && /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/.test(name);
}

function validLabelValue(value: string) {
  return value === '' || (value.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/.test(value));
}

export function ResourceLabelsDialog({ node, contextName, connectionSettings, onClose, onSaved }: ResourceLabelsDialogProps) {
  const [permission, setPermission] = useState<LabelPermissionResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LabelRow[]>(() => initialRows(node.metadata.labels));

  useEffect(() => {
    const controller = new AbortController();
    async function checkPermission() {
      try {
        const params = contextName ? `?ctx=${encodeURIComponent(contextName)}` : '';
        const response = await fetch(`/api/resource-labels${params}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ ...connectionSettings, kind: node.kind, name: node.name, namespace: node.namespace }),
        });
        const result = await response.json() as LabelPermissionResponse;
        if (!controller.signal.aborted) setPermission(result);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to check permission');
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }
    void checkPermission();
    return () => controller.abort();
  }, [connectionSettings, contextName, node.kind, node.name, node.namespace]);

  const validationError = useMemo(() => {
    const populated = rows.filter(row => row.key.trim());
    if (new Set(populated.map(row => row.key.trim())).size !== populated.length) return 'Label keys must be unique.';
    if (populated.some(row => !validLabelKey(row.key.trim()))) return 'A label key is invalid or too long.';
    if (populated.some(row => !validLabelValue(row.value.trim()))) return 'A label value is invalid or longer than 63 characters.';
    return null;
  }, [rows]);

  function updateRow(id: number, patch: Partial<LabelRow>) {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  }

  async function save() {
    if (!permission?.allowed || validationError) return;
    setSaving(true);
    setError(null);
    const previous = node.metadata.labels ?? {};
    const next = Object.fromEntries(rows.filter(row => row.key.trim()).map(row => [row.key.trim(), row.value.trim()]));
    const labels: Record<string, string | null> = { ...next };
    for (const key of Object.keys(previous)) if (!(key in next)) labels[key] = null;
    try {
      const params = contextName ? `?ctx=${encodeURIComponent(contextName)}` : '';
      const response = await fetch(`/api/resource-labels${params}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...connectionSettings, kind: node.kind, name: node.name, namespace: node.namespace, labels }),
      });
      const result = await response.json() as { updated?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? `Label update failed (${response.status})`);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update labels');
    } finally {
      setSaving(false);
    }
  }

  const denied = !checking && permission && !permission.allowed;
  const inputsDisabled = checking || !permission?.allowed || saving;

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit labels</DialogTitle>
          <DialogDescription><span className="font-mono text-foreground">{node.kind}/{node.name}</span>{node.namespace ? ` in ${node.namespace}` : ' · cluster-scoped'}</DialogDescription>
        </DialogHeader>

        {checking && <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/35"><LoadingIndicator size="md" /><div className="text-center"><p className="text-sm font-medium text-foreground">Let me check permission…</p><p className="mt-1 text-xs text-muted-foreground">Verifying patch access for this exact resource.</p></div></div>}

        {denied && <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-start gap-2"><ShieldX size={17} className="mt-0.5 shrink-0 text-warning-foreground" /><div><p className="text-sm font-medium text-foreground">You cannot edit these labels</p><p className="mt-1 text-xs text-muted-foreground">{permission.error ?? permission.reason ?? 'Kubernetes denied patch access.'} Existing labels remain visible below.</p></div></div>
          {permission.command && <CommandLine label="Confirm manually" command={permission.command} />}
          {permission.grantCommands.length > 0 && <div className="space-y-1.5"><p className="text-[11px] font-medium text-muted-foreground">A cluster administrator can grant access (replace &lt;USER&gt;):</p>{permission.grantCommands.map(command => <CommandLine key={command} command={command} />)}</div>}
        </div>}

        {permission?.allowed && !checking && <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success-foreground"><CheckCircle2 size={14} />Patch permission confirmed for this resource.</div>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}

        {!checking && <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"><span>Key</span><span>Value</span><span /></div>
          {rows.map(row => <div key={row.id} className="grid grid-cols-[1fr_1fr_32px] gap-2">
            <Input value={row.key} onChange={event => updateRow(row.id, { key: event.target.value })} placeholder="app.kubernetes.io/name" className="h-9 font-mono text-xs" disabled={inputsDisabled} />
            <Input value={row.value} onChange={event => updateRow(row.id, { value: event.target.value })} placeholder="api-gateway" className="h-9 font-mono text-xs" disabled={inputsDisabled} />
            <Button variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground" disabled={inputsDisabled} onClick={() => setRows(current => current.filter(item => item.id !== row.id))} aria-label="Remove label"><Trash2 size={14} /></Button>
          </div>)}
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={inputsDisabled} onClick={() => setRows(current => [...current, { id: nextRowId++, key: '', value: '' }])}><Plus size={13} />Add label</Button>
          {validationError && <p className="text-xs text-destructive-foreground">{validationError}</p>}
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!permission?.allowed || Boolean(validationError) || saving}>{saving ? <LoadingIndicator size="sm" label="Saving and refreshing…" /> : 'Save labels'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommandLine({ label, command }: { label?: string; command: string }) {
  return <div><div className="flex items-center gap-2 rounded-md border border-border bg-background p-2"><code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap text-[10px] text-foreground">{command}</code><Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => void navigator.clipboard.writeText(command)} aria-label={`Copy ${label ?? 'command'}`}><Copy size={12} /></Button></div></div>;
}
