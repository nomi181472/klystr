'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  Filter,
  FolderOpen,
  FolderSync,
  FolderTree,
  HardDrive,
  Hash,
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
  buildComparisonReportAsync,
  type CompareProgress,
  type ComparisonReport,
  type DiffStatus,
  type KindGroupComparison,
  type ObjectComparison,
  type PropertyTreeNode,
} from '@/lib/manifest-graph/cluster-diff';

interface ManifestClusterCompareProps {
  nodes: ResourceNode[];
  connectionSettings?: ConnectionSettings;
  activeContext?: string | null;
  onOpenInEditor?: (filePath: string, line?: number, column?: number) => void;
  onIngestCurrentDir?: () => void;
}

type ViewMode = 'two-column' | 'tree';

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

const STEPS_LIST = [
  { step: 1, name: 'Reading Manifests' },
  { step: 2, name: 'Cluster Discovery' },
  { step: 3, name: 'Normalization' },
  { step: 4, name: 'Property Hashing' },
  { step: 5, name: 'Assembly' },
] as const;

interface CachedCompareState {
  signature: string;
  report: ComparisonReport;
  clusterResources: K8sResource[];
  clusterNamespaces: string[];
  contextName: string;
}

let cachedCompareState: CachedCompareState | null = null;

export function ManifestClusterCompare({
  nodes,
  connectionSettings: propSettings,
  activeContext,
  onOpenInEditor,
  onIngestCurrentDir,
}: ManifestClusterCompareProps) {
  const storeSettings = useConnectionStore(s => s.settings);
  const effectiveSettings = propSettings ?? storeSettings;

  const nodeSignature = useMemo(() => {
    if (!nodes || nodes.length === 0) return '';
    return `${nodes.length}:${nodes.map(n => n.key).sort().join(',')}`;
  }, [nodes]);

  const hasCachedReport = Boolean(cachedCompareState && cachedCompareState.signature === nodeSignature);

  const [clusterResources, setClusterResources] = useState<K8sResource[]>(() => {
    if (cachedCompareState && cachedCompareState.signature === nodeSignature) {
      return cachedCompareState.clusterResources;
    }
    return [];
  });
  const [clusterNamespaces, setClusterNamespaces] = useState<string[]>(() => {
    if (cachedCompareState && cachedCompareState.signature === nodeSignature) {
      return cachedCompareState.clusterNamespaces;
    }
    return [];
  });
  const [isAccessible, setIsAccessible] = useState<boolean | null>(() => {
    if (cachedCompareState && cachedCompareState.signature === nodeSignature) {
      return true;
    }
    return null;
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contextName, setContextName] = useState<string>(() => {
    if (cachedCompareState && cachedCompareState.signature === nodeSignature) {
      return cachedCompareState.contextName;
    }
    return '';
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return !hasCachedReport;
  });

  // Progress state for real-time async pipeline
  const [progress, setProgress] = useState<CompareProgress>({
    step: 1,
    stepName: 'Initializing',
    description: 'Starting cluster comparison pipeline…',
    percent: 5,
  });

  // Dual View Mode State
  const [viewMode, setViewMode] = useState<ViewMode>('two-column');
  const [onlyDriftedProperties, setOnlyDriftedProperties] = useState<boolean>(true);

  // Filters & State
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set(['all']));
  const [statusFilter, setStatusFilter] = useState<'all' | DiffStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());

  // Report state computed asynchronously
  const [report, setReport] = useState<ComparisonReport | null>(() => {
    if (cachedCompareState && cachedCompareState.signature === nodeSignature) {
      return cachedCompareState.report;
    }
    return null;
  });

  const hasManifests = nodes.length > 0;

  // Run the 5-step async comparison pipeline
  const runComparisonPipeline = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // Step 1 & 2: Concurrently read manifests & fetch live cluster resources
      setProgress({
        step: 1,
        stepName: 'Reading Manifests & Discovery',
        description: 'Connecting to cluster and scanning workspace manifests in parallel…',
        percent: 20,
      });

      const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';

      // Fetch cluster resources
      const clusterPromise = fetch(`/api/manifest-graph/compare${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...effectiveSettings,
        }),
      }).then(res => res.json());

      const data = await clusterPromise;

      if (!data || data.accessible === false) {
        setIsAccessible(false);
        setErrorMessage(data?.error || 'Failed to query live Kubernetes cluster');
        setClusterResources([]);
        setLoading(false);
        return;
      }

      setIsAccessible(true);
      const resources: K8sResource[] = data.resources || [];
      setClusterResources(resources);
      setClusterNamespaces(data.namespaces || []);
      setContextName(data.contextName || activeContext || 'connected-cluster');

      // Step 3 to 5: Run pure async property hashing and comparison
      const computedReport = await buildComparisonReportAsync(
        nodes,
        resources,
        undefined,
        updatedProgress => {
          setProgress(updatedProgress);
        }
      );

      cachedCompareState = {
        signature: nodeSignature,
        report: computedReport,
        clusterResources: resources,
        clusterNamespaces: data.namespaces || [],
        contextName: data.contextName || activeContext || 'connected-cluster',
      };

      setReport(computedReport);
    } catch (err) {
      setIsAccessible(false);
      setErrorMessage(err instanceof Error ? err.message : 'Network error communicating with cluster');
      setClusterResources([]);
    } finally {
      setLoading(false);
    }
  }, [activeContext, effectiveSettings, nodeSignature, nodes]);

  const lastSignatureRef = useRef<string>(cachedCompareState?.signature || '');
  const hasInitializedRef = useRef<boolean>(hasCachedReport);

  useEffect(() => {
    if (!hasManifests) return;

    // If manifest dataset changed (new files ingested), re-run
    if (nodeSignature && nodeSignature !== lastSignatureRef.current) {
      lastSignatureRef.current = nodeSignature;
      hasInitializedRef.current = true;
      void runComparisonPipeline();
      return;
    }

    // Initial run if no cached report exists
    if (!report && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      void runComparisonPipeline();
    }
  }, [hasManifests, nodeSignature, report, runComparisonPipeline]);

  // Listen to external refresh trigger (e.g. from tab reload button)
  useEffect(() => {
    const handleRefresh = () => {
      void runComparisonPipeline();
    };
    window.addEventListener('klystr:refresh:compare', handleRefresh);
    return () => window.removeEventListener('klystr:refresh:compare', handleRefresh);
  }, [runComparisonPipeline]);

  // Discover all distinct namespaces
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

  const toggleNamespace = (ns: string) => {
    setSelectedNamespaces(prev => {
      const next = new Set(prev);
      if (ns === 'all') return new Set(['all']);
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

  const toggleExpand = (id: string) => {
    setExpandedDiffs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter report items
  const filteredGroups: KindGroupComparison[] = useMemo(() => {
    if (!report) return [];
    const query = searchQuery.trim().toLowerCase();
    return report.byKind
      .map(group => {
        const filteredItems = group.items.filter(item => {
          if (!selectedNamespaces.has('all') && !selectedNamespaces.has(item.namespace)) return false;
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
  }, [report, selectedNamespaces, statusFilter, searchQuery]);

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

  // ── Loading Screen: Multi-Step Async Progress Card ───────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[420px] w-full flex-col items-center justify-center space-y-6 rounded-xl border border-border bg-card/60 p-8 backdrop-blur-xs">
        <LoadingIndicator size="lg" label="" className="flex-col gap-3" />

        <div className="w-full max-w-md space-y-3 text-center">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{progress.stepName}</span>
            <span className="font-mono text-primary font-bold text-sm">{progress.percent}%</span>
          </div>

          {/* Smooth animated progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out shadow-sm"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <p className="text-xs text-foreground/90 font-medium">
            {progress.description}
          </p>

          {progress.currentItem && (
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              {progress.currentItem}
            </p>
          )}

          {/* Step badges */}
          <div className="grid grid-cols-5 gap-1 pt-3">
            {STEPS_LIST.map(s => {
              const isDone = progress.step > s.step;
              const isCurrent = progress.step === s.step;
              return (
                <div
                  key={s.step}
                  className={`flex flex-col items-center rounded-md border p-1 text-[10px] transition-colors ${
                    isDone
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : isCurrent
                      ? 'border-primary/50 bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-muted/30 text-muted-foreground/60'
                  }`}
                >
                  <span>Step {s.step}</span>
                  <span className="truncate max-w-[65px]">{s.name}</span>
                </div>
              );
            })}
          </div>
        </div>
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
            Cannot reach Kubernetes API server for context <code className="font-mono text-primary bg-muted px-1.5 py-0.5 rounded text-xs">{contextName || activeContext || 'default'}</code>.
          </CardDescription>
          {errorMessage && (
            <div className="mx-auto mt-4 max-w-xl rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground text-left font-mono break-all">
              {errorMessage}
            </div>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => void runComparisonPipeline()} variant="default" className="gap-2">
              <RotateCw size={14} />
              Retry Connection
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controls Bar */}
      <Card className="border-border bg-card shrink-0">
        <CardContent className="p-4 space-y-3">
          {/* Row 1: Cluster Context, Summary Badges, View Toggle */}
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

            <div className="flex items-center gap-2">
              {/* Dual View Mode Toggle */}
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('two-column')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'two-column'
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Columns3 size={13} />
                  Two-Column View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('tree')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'tree'
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FolderTree size={13} />
                  Tree View
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void runComparisonPipeline()}
                className="h-7 text-xs gap-1.5"
              >
                <RotateCw size={12} />
                Refresh Diff
              </Button>
            </div>
          </div>

          {/* Row 2: Namespace Filter Pills */}
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

          {/* Row 3: Status Filters & Search Bar */}
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

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyDriftedProperties}
                  onChange={e => setOnlyDriftedProperties(e.target.checked)}
                  className="rounded border-border"
                />
                <span>Only Drifted Props</span>
              </label>

              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter by name or file..."
                className="h-7 w-44 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content: Two-Column View vs Hierarchical Tree View */}
      {filteredGroups.length === 0 ? (
        <Card className="border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No objects match the current filters.
        </Card>
      ) : viewMode === 'two-column' ? (
        // ─────────────────────────────────────────────────────────────────────────
        // VIEW 1: Two-Column Diff Mode
        // ─────────────────────────────────────────────────────────────────────────
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

              {/* Items List */}
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
                        {/* Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground">{item.name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">({item.namespace})</span>
                            <StatusBadge tone={STATUS_TONES[item.status]}>
                              {item.statusLabel}
                            </StatusBadge>
                          </div>

                          {/* Source File Badge */}
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

                        {/* Drift Highlights */}
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

                        {/* Two Columns */}
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

                        {/* Collapsible Property Tree Drawer */}
                        {item.propertyTree.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium pt-1 transition-colors"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span>{isExpanded ? 'Hide' : 'Show'} detailed Property Tree & Hashes</span>
                            </button>

                            {isExpanded && (
                              <div className="mt-2 rounded-lg border border-border bg-background p-3">
                                <PropertyTreeViewer
                                  nodes={item.propertyTree}
                                  onlyDrifted={onlyDriftedProperties}
                                />
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
      ) : (
        // ─────────────────────────────────────────────────────────────────────────
        // VIEW 2: Hierarchical Tree Diff Mode
        // ─────────────────────────────────────────────────────────────────────────
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Hierarchical Comparison Tree</CardTitle>
                <CardDescription className="text-xs">
                  Full object and property hierarchy with canonical hashes and drift status
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {report.totalCompared} Objects Analyzed
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {filteredGroups.map(group => {
              const Icon = KIND_ICONS[group.kind] || Box;
              return (
                <div key={group.kind} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Icon size={14} className="text-primary" />
                    <span>{group.kind}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {group.items.length}
                    </Badge>
                  </div>

                  <div className="pl-4 space-y-2 border-l border-border/80 ml-2">
                    {group.items.map(item => (
                      <div key={item.id} className="rounded-md border border-border bg-background p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground">{item.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">({item.namespace})</span>
                            <StatusBadge tone={STATUS_TONES[item.status]}>
                              {item.statusLabel}
                            </StatusBadge>
                          </div>

                          {item.fileName && (
                            <button
                              type="button"
                              onClick={() => onOpenInEditor?.(item.fileName!, item.sourceLine, item.sourceColumn)}
                              className="text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                            >
                              <FileCode2 size={11} />
                              <span>{item.fileName}:{item.sourceLine}</span>
                            </button>
                          )}
                        </div>

                        {/* Property Subtree */}
                        <PropertyTreeViewer
                          nodes={item.propertyTree}
                          onlyDrifted={onlyDriftedProperties}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Property Tree Viewer Component
// ─────────────────────────────────────────────────────────────────────────────
interface PropertyTreeViewerProps {
  nodes: PropertyTreeNode[];
  onlyDrifted?: boolean;
}

function PropertyTreeViewer({ nodes, onlyDrifted = false }: PropertyTreeViewerProps) {
  const displayNodes = useMemo(() => {
    if (!onlyDrifted) return nodes;

    function filterNode(node: PropertyTreeNode): PropertyTreeNode | null {
      if (node.isDifferent) return node;
      if (node.children && node.children.length > 0) {
        const filteredChildren = node.children.map(filterNode).filter((c): c is PropertyTreeNode => c !== null);
        if (filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
      }
      return null;
    }

    return nodes.map(filterNode).filter((n): n is PropertyTreeNode => n !== null);
  }, [nodes, onlyDrifted]);

  if (displayNodes.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic py-1">
        All properties match declared manifest files.
      </div>
    );
  }

  return (
    <div className="space-y-1 font-mono text-xs">
      {displayNodes.map(node => (
        <PropertyTreeNodeItem key={node.path} node={node} onlyDrifted={onlyDrifted} />
      ))}
    </div>
  );
}

interface PropertyTreeNodeItemProps {
  node: PropertyTreeNode;
  onlyDrifted?: boolean;
}

function PropertyTreeNodeItem({ node, onlyDrifted }: PropertyTreeNodeItemProps) {
  const [isOpen, setIsOpen] = useState<boolean>(node.isDifferent || !onlyDrifted);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="space-y-1">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 transition-colors ${
          node.isDifferent
            ? 'bg-warning/15 text-warning-foreground font-medium'
            : 'hover:bg-muted/40 text-foreground'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-4 inline-block text-center text-muted-foreground">•</span>
          )}

          <span className="font-semibold text-xs truncate">{node.label || node.key}</span>

          {node.type === 'object' && (
            <span className="text-[10px] text-muted-foreground">{'{}'}</span>
          )}
          {node.type === 'array' && (
            <span className="text-[10px] text-muted-foreground">{'[]'}</span>
          )}
        </div>

        {/* Values and Hashes */}
        <div className="flex items-center gap-2 text-[11px]">
          {node.manifestHash && (
            <span
              className="flex items-center gap-1 font-mono text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground"
              title={`Manifest Property Hash: ${node.manifestHash}`}
            >
              <Hash size={10} />
              <span>{node.manifestHash}</span>
            </span>
          )}

          {node.clusterHash && node.clusterHash !== node.manifestHash && (
            <span
              className="flex items-center gap-1 font-mono text-[10px] bg-warning/20 text-warning-foreground px-1 py-0.5 rounded"
              title={`Cluster Property Hash: ${node.clusterHash}`}
            >
              <Hash size={10} />
              <span>{node.clusterHash}</span>
            </span>
          )}

          {node.isDifferent ? (
            <span className="rounded bg-warning/25 px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
              Drifted
            </span>
          ) : (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              Match
            </span>
          )}
        </div>
      </div>

      {/* Leaf Values Comparison */}
      {!hasChildren && (node.manifestValue !== undefined || node.clusterValue !== undefined) && (
        <div className="pl-6 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-2 pb-1">
          <div className="rounded bg-muted/40 p-1.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-sans">Manifest:</span>
            <span className="text-foreground break-all">{node.manifestValue ?? '(unset)'}</span>
          </div>
          <div className={`rounded p-1.5 ${node.isDifferent ? 'bg-warning/10 border border-warning/30' : 'bg-muted/40'}`}>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-sans">Cluster:</span>
            <span className={node.isDifferent ? 'text-warning-foreground font-semibold break-all' : 'text-foreground break-all'}>
              {node.clusterValue ?? '(unset)'}
            </span>
          </div>
        </div>
      )}

      {/* Recursive Children */}
      {hasChildren && isOpen && (
        <div className="pl-4 border-l border-border/80 ml-2.5 space-y-1">
          {node.children!.map(child => (
            <PropertyTreeNodeItem key={child.path} node={child} onlyDrifted={onlyDrifted} />
          ))}
        </div>
      )}
    </div>
  );
}
