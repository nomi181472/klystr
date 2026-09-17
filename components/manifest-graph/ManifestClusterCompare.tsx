'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  Filter,
  FolderSync,
  HardDrive,
  KeyRound,
  Layers,
  Network,
  RotateCw,
  Server,
  Shield,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { useConnectionStore } from '@/stores/connection-store';
import type { ResourceNode } from '@/lib/manifest-graph/types';
import type { ConnectionSettings, K8sResource } from '@/lib/types';
import {
  buildComparisonReport,
  type ComparisonReport,
  type DiffStatus,
  type KindGroupComparison,
  type ObjectComparison,
} from '@/lib/manifest-graph/cluster-diff';

interface ManifestClusterCompareProps {
  nodes: ResourceNode[];
  connectionSettings?: ConnectionSettings;
  activeContext?: string | null;
  onOpenInEditor?: (filePath: string, line?: number, column?: number) => void;
  onIngestCurrentDir?: () => void;
}

const KIND_ICONS: Record<string, React.ElementType> = {
  Deployment: Layers,
  StatefulSet: Database,
  DaemonSet: Server,
  Service: Network,
  Ingress: Network,
  ConfigMap: FileText,
  Secret: KeyRound,
  PersistentVolumeClaim: HardDrive,
  HorizontalPodAutoscaler: Box,
  Job: Box,
  CronJob: Box,
  NetworkPolicy: Shield,
  ServiceAccount: Shield,
  Pod: Box,
};

const STATUS_TONES: Record<DiffStatus, StatusTone> = {
  'in-sync': 'success',
  'out-of-sync': 'warning',
  'missing-in-cluster': 'danger',
  'cluster-only': 'neutral',
};

export function ManifestClusterCompare({
  nodes,
  connectionSettings: propSettings,
  activeContext,
  onOpenInEditor,
  onIngestCurrentDir,
}: ManifestClusterCompareProps) {
  const storeSettings = useConnectionStore(s => s.settings);
  const effectiveSettings = propSettings ?? storeSettings;

  const [clusterResources, setClusterResources] = useState<K8sResource[]>([]);
  const [clusterNamespaces, setClusterNamespaces] = useState<string[]>([]);
  const [isAccessible, setIsAccessible] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contextName, setContextName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Namespace selection: Set of strings. If contains 'all' or empty, all namespaces are shown.
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set(['all']));
  const [statusFilter, setStatusFilter] = useState<'all' | DiffStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());

  // Prerequisite 1: Manifest files must be loaded
  const hasManifests = nodes.length > 0;

  // Query live cluster resources
  const fetchClusterState = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';
      const response = await fetch(`/api/manifest-graph/compare${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...effectiveSettings,
          namespaces: Array.from(selectedNamespaces).filter(ns => ns !== 'all'),
        }),
      });

      const data = await response.json();
      if (!response.ok || data.accessible === false) {
        setIsAccessible(false);
        setErrorMessage(data.error || 'Failed to query live Kubernetes cluster');
        setClusterResources([]);
      } else {
        setIsAccessible(true);
        setClusterResources(data.resources || []);
        setClusterNamespaces(data.namespaces || []);
        setContextName(data.contextName || activeContext || 'connected-cluster');
      }
    } catch (err) {
      setIsAccessible(false);
      setErrorMessage(err instanceof Error ? err.message : 'Network error communicating with cluster');
      setClusterResources([]);
    } finally {
      setLoading(false);
    }
  }, [activeContext, effectiveSettings, selectedNamespaces]);

  useEffect(() => {
    void fetchClusterState();
  }, [fetchClusterState]);

  // Discover all distinct namespaces across manifests and cluster
  const allAvailableNamespaces = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      set.add(n.namespace || 'default');
    }
    for (const ns of clusterNamespaces) {
      set.add(ns);
    }
    for (const r of clusterResources) {
      if (r.namespace) set.add(r.namespace);
    }
    return Array.from(set).sort();
  }, [nodes, clusterNamespaces, clusterResources]);

  // Namespace selection toggle
  const toggleNamespace = (ns: string) => {
    setSelectedNamespaces(prev => {
      const next = new Set(prev);
      if (ns === 'all') {
        return new Set(['all']);
      }
      next.delete('all');
      if (next.has(ns)) {
        next.delete(ns);
        if (next.size === 0) next.add('all');
      } else {
        next.add(ns);
      }
      return next;
    });
  };

  const selectSingleNamespace = (ns: string) => {
    setSelectedNamespaces(new Set([ns]));
  };

  // Build the comparison report
  const report: ComparisonReport = useMemo(() => {
    const activeNsArray = selectedNamespaces.has('all') ? undefined : Array.from(selectedNamespaces);
    return buildComparisonReport(nodes, clusterResources, activeNsArray);
  }, [nodes, clusterResources, selectedNamespaces]);

  // Filter report items by status and query
  const filteredGroups: KindGroupComparison[] = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return report.byKind
      .map(group => {
        const filteredItems = group.items.filter(item => {
          if (statusFilter !== 'all' && item.status !== statusFilter) return false;
          if (query) {
            const matchesName = item.name.toLowerCase().includes(query);
            const matchesFile = (item.fileName || '').toLowerCase().includes(query);
            const matchesNs = item.namespace.toLowerCase().includes(query);
            return matchesName || matchesFile || matchesNs;
          }
          return true;
        });
        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter(group => group.items.length > 0);
  }, [report, statusFilter, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedDiffs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Prerequisite Screen 1: No Manifest Files ──────────────────────────────────
  if (!hasManifests) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="text-center py-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning-foreground mb-4">
            <FileCode2 size={28} />
          </div>
          <CardTitle className="text-lg">No Manifest Files Loaded</CardTitle>
          <CardDescription className="max-w-md mx-auto mt-2">
            To compare cluster resources against local manifests, please ingest Kubernetes YAML files from your current directory or select files from your project workspace.
          </CardDescription>
          {onIngestCurrentDir && (
            <div className="mt-6 flex justify-center">
              <Button onClick={onIngestCurrentDir} className="gap-2">
                <FolderSync size={15} />
                Ingest Current Directory Manifests
              </Button>
            </div>
          )}
        </CardHeader>
      </Card>
    );
  }

  // ── Loading Screen: Animated Branded Logo ────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-96 w-full flex-col items-center justify-center space-y-4 rounded-xl border border-border bg-card/60 backdrop-blur-xs">
        <LoadingIndicator size="lg" label="Comparing cluster state against directory manifests…" className="flex-col gap-3" />
        <p className="text-xs text-muted-foreground font-mono">
          Querying {contextName || effectiveSettings.contextName || 'cluster'} live resources
        </p>
      </div>
    );
  }

  // ── Prerequisite Screen 2: Cluster Service Inaccessible ───────────────────────
  if (isAccessible === false) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="text-center py-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive-foreground mb-4">
            <Server size={28} />
          </div>
          <CardTitle className="text-lg">Kubernetes Cluster Inaccessible</CardTitle>
          <CardDescription className="max-w-lg mx-auto mt-2 text-foreground/80">
            Cannot reach Kubernetes API server for context <code className="font-mono text-primary bg-muted px-1.5 py-0.5 rounded text-xs">{contextName || effectiveSettings.contextName || 'default'}</code>.
          </CardDescription>
          {errorMessage && (
            <div className="mx-auto mt-4 max-w-xl rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground text-left font-mono break-all">
              {errorMessage}
            </div>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => void fetchClusterState()} variant="default" className="gap-2">
              <RotateCw size={14} />
              Retry Connection
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controls & Namespace Filter */}
      <Card className="border-border bg-card shrink-0">
        <CardContent className="p-4 space-y-3">
          {/* Summary Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Server size={16} className="text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cluster:</span>
              <span className="font-mono text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded">
                {contextName || 'connected'}
              </span>
              <Badge variant="outline" className="text-xs">
                {report.totalManifestObjects} manifest objects
              </Badge>
              <Badge variant="outline" className="text-xs">
                {report.totalClusterObjects} live cluster resources
              </Badge>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchClusterState()}
              className="h-7 text-xs gap-1.5"
            >
              <RotateCw size={12} />
              Refresh Diff
            </Button>
          </div>

          {/* Namespace Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
              <Filter size={12} />
              Namespace:
            </span>
            <button
              type="button"
              onClick={() => toggleNamespace('all')}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                selectedNamespaces.has('all')
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              All Namespaces
            </button>
            {allAvailableNamespaces.map(ns => {
              const isSelected = selectedNamespaces.has(ns);
              return (
                <button
                  key={ns}
                  type="button"
                  onClick={() => toggleNamespace(ns)}
                  onDoubleClick={() => selectSingleNamespace(ns)}
                  title="Click to toggle, double click to select only this namespace"
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                >
                  {ns}
                </button>
              );
            })}
          </div>

          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-foreground text-background font-semibold'
                    : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({report.totalCompared})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('out-of-sync')}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  statusFilter === 'out-of-sync'
                    ? 'bg-warning text-warning-foreground font-semibold'
                    : 'border border-warning/30 bg-warning/10 text-warning-foreground hover:bg-warning/20'
                }`}
              >
                <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
                Out of Sync ({report.summary.outOfSync})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('missing-in-cluster')}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  statusFilter === 'missing-in-cluster'
                    ? 'bg-destructive text-destructive-foreground font-semibold'
                    : 'border border-destructive/30 bg-destructive/10 text-destructive-foreground hover:bg-destructive/20'
                }`}
              >
                <XCircle size={11} className="inline mr-1 -mt-0.5" />
                Missing in Cluster ({report.summary.missingInCluster})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('in-sync')}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  statusFilter === 'in-sync'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                <CheckCircle2 size={11} className="inline mr-1 -mt-0.5" />
                In Sync ({report.summary.inSync})
              </button>
              {report.summary.clusterOnly > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('cluster-only')}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                    statusFilter === 'cluster-only'
                      ? 'bg-muted-foreground text-background font-semibold'
                      : 'border border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Cluster Only ({report.summary.clusterOnly})
                </button>
              )}
            </div>

            {/* Search Input */}
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter by name or file..."
              className="h-7 w-48 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            />
          </div>
        </CardContent>
      </Card>

      {/* Comparison Sections Grouped by Kind */}
      {filteredGroups.length === 0 ? (
        <Card className="border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No objects match the current filters.
        </Card>
      ) : (
        filteredGroups.map(group => {
          const Icon = KIND_ICONS[group.kind] || Box;
          return (
            <div key={group.kind} className="space-y-3">
              {/* Kind Header */}
              <div className="flex items-center justify-between border-b border-border/80 pb-1.5 pt-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon size={14} />
                  </div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    {group.kind}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {group.items.length} {group.items.length === 1 ? 'object' : 'objects'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {group.outOfSyncCount > 0 && (
                    <span className="flex items-center gap-1 text-warning-foreground font-medium">
                      <AlertTriangle size={12} />
                      {group.outOfSyncCount} out of sync
                    </span>
                  )}
                  {group.missingInClusterCount > 0 && (
                    <span className="flex items-center gap-1 text-destructive-foreground font-medium">
                      <XCircle size={12} />
                      {group.missingInClusterCount} missing
                    </span>
                  )}
                  {group.inSyncCount > 0 && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 size={12} />
                      {group.inSyncCount} in sync
                    </span>
                  )}
                </div>
              </div>

              {/* Items under this Kind */}
              <div className="grid gap-3">
                {group.items.map(item => {
                  const isExpanded = expandedDiffs.has(item.id);
                  const isOutOfSync = item.status === 'out-of-sync';
                  const isMissing = item.status === 'missing-in-cluster';

                  return (
                    <Card
                      key={item.id}
                      className={`border transition-colors ${
                        isOutOfSync
                          ? 'border-warning/40 bg-warning/5'
                          : isMissing
                          ? 'border-destructive/30 bg-destructive/5'
                          : 'border-border bg-card hover:bg-muted/10'
                      }`}
                    >
                      <CardContent className="p-3.5 space-y-2.5">
                        {/* Header Row: Object Name, Status Badge, File Chip */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground">{item.name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">({item.namespace})</span>
                            <StatusBadge tone={STATUS_TONES[item.status]}>
                              {item.statusLabel}
                            </StatusBadge>
                          </div>

                          {/* Source File Badge with direct VS Code Jump */}
                          {item.fileName ? (
                            <button
                              type="button"
                              onClick={() => onOpenInEditor?.(item.fileName!, item.sourceLine, item.sourceColumn)}
                              title="Click to open file and jump to definition in VS Code"
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground transition-colors group"
                            >
                              <FileCode2 size={12} className="text-primary shrink-0" />
                              <span className="truncate max-w-[280px] sm:max-w-[420px]">{item.fileName}</span>
                              {item.sourceLine && (
                                <span className="text-primary font-semibold">:{item.sourceLine}</span>
                              )}
                              <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 shrink-0 text-primary transition-opacity" />
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">(No manifest file)</span>
                          )}
                        </div>

                        {/* Drift Highlights / Summary */}
                        {item.diffSummary.length > 0 && (
                          <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground space-y-1">
                            {item.diffSummary.map((sum, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <AlertCircle size={13} className="shrink-0 mt-0.5 text-warning-foreground" />
                                <span>{sum}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Two-Column Comparison Grid: Manifest File vs Actual Cluster */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {/* Column 1: Manifest File State */}
                          <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              <span>Manifest File State</span>
                              <FileCode2 size={12} />
                            </div>

                            {item.manifestNode ? (
                              <div className="space-y-1 text-xs">
                                {item.manifestSpecSummary.images.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Image: </span>
                                    <code className="font-mono text-foreground bg-muted px-1 py-0.5 rounded text-[11px]">
                                      {item.manifestSpecSummary.images.join(', ')}
                                    </code>
                                  </div>
                                )}
                                {item.manifestSpecSummary.replicas !== undefined && (
                                  <div>
                                    <span className="text-muted-foreground">Replicas: </span>
                                    <span className="font-medium text-foreground">{item.manifestSpecSummary.replicas}</span>
                                  </div>
                                )}
                                {item.manifestSpecSummary.ports.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Ports: </span>
                                    <span className="font-mono text-foreground text-[11px]">{item.manifestSpecSummary.ports.join(', ')}</span>
                                  </div>
                                )}
                                {item.manifestSpecSummary.serviceType && (
                                  <div>
                                    <span className="text-muted-foreground">Service Type: </span>
                                    <span className="font-medium text-foreground">{item.manifestSpecSummary.serviceType}</span>
                                  </div>
                                )}
                                {item.manifestSpecSummary.keys && item.manifestSpecSummary.keys.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Data Keys: </span>
                                    <span className="font-mono text-xs">{item.manifestSpecSummary.keys.length} keys ({item.manifestSpecSummary.keys.join(', ')})</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Not declared in manifest files</p>
                            )}
                          </div>

                          {/* Column 2: Actual Cluster State */}
                          <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              <span>Actual Cluster State</span>
                              <Server size={12} />
                            </div>

                            {item.clusterResource ? (
                              <div className="space-y-1 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Status: </span>
                                  <span className="font-medium text-foreground">{item.clusterSpecSummary.status || 'Active'}</span>
                                </div>
                                {item.clusterSpecSummary.images.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Image: </span>
                                    <code className={`font-mono px-1 py-0.5 rounded text-[11px] ${
                                      item.fields.find(f => f.path === 'spec.containers[].image')?.isDifferent
                                        ? 'bg-warning/20 text-warning-foreground font-semibold'
                                        : 'bg-muted text-foreground'
                                    }`}>
                                      {item.clusterSpecSummary.images.join(', ')}
                                    </code>
                                  </div>
                                )}
                                {item.clusterSpecSummary.replicas !== undefined && (
                                  <div>
                                    <span className="text-muted-foreground">Replicas: </span>
                                    <span className={`font-medium ${
                                      item.fields.find(f => f.path === 'spec.replicas')?.isDifferent
                                        ? 'text-warning-foreground font-bold'
                                        : 'text-foreground'
                                    }`}>
                                      {item.clusterSpecSummary.replicas}
                                    </span>
                                  </div>
                                )}
                                {item.clusterSpecSummary.ports.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Ports: </span>
                                    <span className="font-mono text-foreground text-[11px]">{item.clusterSpecSummary.ports.join(', ')}</span>
                                  </div>
                                )}
                                {item.clusterSpecSummary.serviceType && (
                                  <div>
                                    <span className="text-muted-foreground">Service Type: </span>
                                    <span className="font-medium text-foreground">{item.clusterSpecSummary.serviceType}</span>
                                  </div>
                                )}
                                {item.clusterSpecSummary.keys && item.clusterSpecSummary.keys.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Data Keys: </span>
                                    <span className="font-mono text-xs">{item.clusterSpecSummary.keys.length} keys ({item.clusterSpecSummary.keys.join(', ')})</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive-foreground">
                                <p className="font-medium">Not Deployed to Cluster</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">Object exists in YAML manifest but has not been applied to this cluster context.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Granular Field Diff Table & Toggle */}
                        {item.fields.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium pt-1 transition-colors"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span>{isExpanded ? 'Hide' : 'Show'} detailed property diff ({item.fields.length} properties)</span>
                            </button>

                            {isExpanded && (
                              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-muted/50 text-[10px] uppercase font-semibold text-muted-foreground border-b border-border">
                                    <tr>
                                      <th className="p-2">Property</th>
                                      <th className="p-2">Manifest File Value</th>
                                      <th className="p-2">Live Cluster Value</th>
                                      <th className="p-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border font-mono text-[11px]">
                                    {item.fields.map((f, i) => (
                                      <tr key={i} className={f.isDifferent ? 'bg-warning/10' : ''}>
                                        <td className="p-2 font-sans font-medium text-foreground">{f.label}</td>
                                        <td className="p-2 text-muted-foreground break-all">{f.manifestValue}</td>
                                        <td className="p-2 text-foreground break-all">{f.clusterValue}</td>
                                        <td className="p-2">
                                          {f.isDifferent ? (
                                            <span className="text-warning-foreground font-sans font-semibold text-[10px]">Outdated</span>
                                          ) : (
                                            <span className="text-emerald-600 dark:text-emerald-400 font-sans text-[10px]">Match</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
