'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { RefreshCw, PanelLeftClose, PanelLeftOpen, AlertTriangle, Settings, Sun, Moon, Timer, Database, Server, X, UploadCloud, FileCode, FolderOpen, Trash2, Globe, CheckCircle2 } from 'lucide-react';
import { parseKubeconfigMetadata } from '@/lib/k8s/kubeconfig-parser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUIStore } from '@/stores/ui-store';
import { useDiscoveryStore } from '@/stores/discovery-store';
import { useFilterStore } from '@/stores/filter-store';
import { isVsCodeEnvironment } from '@/stores/connection-store';
import type { ConnectionErrorInfo, ConnectionSettings } from '@/lib/types';
import type { DiscoveryWarning } from '@/lib/types';
import { ConnectionErrorCard } from '@/components/layout/ConnectionErrorCard';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { KubeLogo } from '@/components/ui/kube-logo';
import { AUTO_REFRESH_INTERVALS } from '@/config/constants';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HeaderProps {
  contexts?: { name: string; isActive: boolean }[];
  onRefresh: () => void;
  warningCount?: number;
  warnings?: DiscoveryWarning[];
  connectionSettings: ConnectionSettings;
  onConnectionApply: (settings: ConnectionSettings) => Promise<void>;
  autoRefreshInterval: number;
  onAutoRefreshChange: (ms: number) => void;
}

export function Header({
  contexts,
  onRefresh,
  warningCount = 0,
  warnings = [],
  connectionSettings,
  onConnectionApply,
  autoRefreshInterval,
  onAutoRefreshChange,
}: HeaderProps) {
  const toggleFilterSidebar = useUIStore(s => s.toggleFilterSidebar);
  const isFilterSidebarOpen = useUIStore(s => s.isFilterSidebarOpen);
  const isDiscovering = useDiscoveryStore(s => s.isDiscovering);
  const lastDiscoveredAt = useDiscoveryStore(s => s.lastDiscoveredAt);
  const activeContext = useFilterStore(s => s.activeContext);
  const setActiveContext = useFilterStore(s => s.setActiveContext);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState(connectionSettings);
  const [connecting, setConnecting] = useState(false);
  const [connectionErrorInfo, setConnectionErrorInfo] = useState<ConnectionErrorInfo | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [warningNotificationOpen, setWarningNotificationOpen] = useState(false);
  const inVsCode = isVsCodeEnvironment();
  const lastWarningSignature = useRef('');
  const { resolvedTheme, setTheme } = useTheme();

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isDarkTheme = isMounted ? resolvedTheme === 'dark' : false;

  useEffect(() => {
    const signature = warnings.map(warning => `${warning.resourceType}:${warning.type}:${warning.message}`).join('|');
    const shouldOpen = Boolean(signature && signature !== lastWarningSignature.current);
    lastWarningSignature.current = signature;
    const timer = window.setTimeout(() => setWarningNotificationOpen(shouldOpen), 0);
    return () => window.clearTimeout(timer);
  }, [warnings]);

  const [kubeconfigTab, setKubeconfigTab] = useState<'path' | 'upload'>(
    connectionSettings.kubeconfigContent ? 'upload' : 'path'
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftContexts, setDraftContexts] = useState<{ name: string; cluster: string; isActive: boolean }[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.command === 'kubeconfigFileSelected' && event.data.filePath) {
        updateDraftSettings({
          environment: 'kubeconfig',
          kubeconfigPath: event.data.filePath,
          kubeconfigContent: event.data.fileContent,
          kubeconfigFileName: event.data.fileName || event.data.filePath.split('/').pop(),
        });
        setKubeconfigTab(event.data.fileContent ? 'upload' : 'path');
        setSettingsOpen(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const parsedKubeconfig = useMemo(() => {
    if (!draftSettings.kubeconfigContent) return null;
    return parseKubeconfigMetadata(draftSettings.kubeconfigContent);
  }, [draftSettings.kubeconfigContent]);

  useEffect(() => {
    if (!settingsOpen || draftSettings.mode !== 'live') {
      setDraftContexts([]);
      return;
    }
    const env = draftSettings.environment ?? 'default';
    if (env === 'custom' && !draftSettings.clusterUrl) {
      setDraftContexts([]);
      return;
    }
    if (env === 'kubeconfig' && !draftSettings.kubeconfigPath && !draftSettings.kubeconfigContent) {
      setDraftContexts([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetch('/api/contexts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftSettings),
      })
        .then(res => res.json())
        .then(data => {
          if (!cancelled && data.contexts && Array.isArray(data.contexts)) {
            setDraftContexts(data.contexts);
          }
        })
        .catch(() => {
          if (!cancelled) setDraftContexts([]);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    settingsOpen,
    draftSettings.mode,
    draftSettings.environment,
    draftSettings.kubeconfigPath,
    draftSettings.kubeconfigContent,
    draftSettings.clusterUrl,
  ]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      updateDraftSettings({
        environment: 'kubeconfig',
        kubeconfigContent: content,
        kubeconfigFileName: file.name,
        kubeconfigPath: undefined,
        clusterUrl: '',
        token: '',
      });
      setKubeconfigTab('upload');
    };
    reader.readAsText(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleBrowseKubeconfig = () => {
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage({ command: 'selectKubeconfigFile' }, '*');
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleClearUploadedFile = () => {
    updateDraftSettings({
      kubeconfigContent: undefined,
      kubeconfigFileName: undefined,
    });
    setKubeconfigTab('path');
  };

  const updateDraftSettings = (patch: Partial<ConnectionSettings>) =>
    setDraftSettings(current => ({ ...current, ...patch }));

  const openSettings = (patch?: Partial<ConnectionSettings>) => {
    const next = { ...connectionSettings, ...patch };
    setDraftSettings(next);
    setKubeconfigTab(next.kubeconfigContent ? 'upload' : 'path');
    setConnectionErrorInfo(null);
    setSettingsOpen(true);
  };

  const connect = async (overrideSettings?: Partial<ConnectionSettings>) => {
    setConnecting(true);
    setConnectionErrorInfo(null);
    const settingsToApply = overrideSettings ? { ...draftSettings, ...overrideSettings } : draftSettings;
    try {
      await onConnectionApply(settingsToApply);
      setSettingsOpen(false);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'info' in error && error.info) {
        setConnectionErrorInfo(error.info as ConnectionErrorInfo);
      } else {
        setConnectionErrorInfo({
          category: 'unknown',
          message: error instanceof Error ? error.message : 'Unable to connect to Kubernetes.',
        });
      }
    } finally {
      setConnecting(false);
    }
  };

  const switchSource = async (mode: ConnectionSettings['mode']) => {
    if (mode === connectionSettings.mode) return;
    setConnecting(true);
    try { await onConnectionApply({ ...connectionSettings, mode }); }
    catch { openSettings({ mode }); }
    finally { setConnecting(false); }
  };

  const autoRefreshLabel = AUTO_REFRESH_INTERVALS.find(i => i.value === autoRefreshInterval)?.label ?? 'Off';
  const isAutoRefreshing = autoRefreshInterval > 0;

  return (
    <>
      <header className="z-50 flex h-14 flex-shrink-0 items-center gap-3 overflow-x-auto border-b border-border/80 bg-card/95 px-3 backdrop-blur-xl sm:px-4">
        {/* Logo */}
        <div className="mr-1 flex shrink-0 items-center gap-2 sm:mr-2 sm:gap-2.5">
          <KubeLogo />
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Klystr</h1>
            <p className="-mt-0.5 hidden text-[10px] font-medium text-muted-foreground sm:block">See. Understand. Operate.</p>
          </div>
        </div>

        <div className="w-px h-6 bg-accent mx-1" />

        {/* Sidebar Toggle */}
        <Tooltip>
          <TooltipTrigger render={
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={toggleFilterSidebar} aria-label={isFilterSidebarOpen ? 'Close filters' : 'Open filters'}>
              {isFilterSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </Button>
          } />
          <TooltipContent side="bottom">{isFilterSidebarOpen ? 'Close filters' : 'Open filters'}</TooltipContent>
        </Tooltip>

        <span className="hidden text-xs font-medium text-muted-foreground lg:inline">Topology</span>

        {/* Context Selector */}
        {contexts && contexts.length > 0 && (
          <Select value={activeContext ?? ''} onValueChange={setActiveContext}>
            <SelectTrigger className="hidden h-8 w-44 bg-muted text-xs md:flex">
              <SelectValue placeholder="Select context" />
            </SelectTrigger>
            <SelectContent>
              {contexts.map(ctx => (
                <SelectItem key={ctx.name} value={ctx.name} className="text-xs">
                  <span className="flex items-center gap-2">
                    {ctx.isActive && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
                    {ctx.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Kubeconfig Quick Indicator & Selector */}
        <button
          type="button"
          onClick={() => openSettings({ environment: 'kubeconfig' })}
          className="hidden items-center gap-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 px-2.5 py-1 text-xs font-medium text-foreground transition-colors md:flex group"
          title="Click to manage, upload, or switch Kubeconfig"
        >
          <FileCode size={13} className="text-primary group-hover:scale-110 transition-transform" />
          <span className="truncate max-w-[130px]">
            {connectionSettings.kubeconfigFileName
              ? connectionSettings.kubeconfigFileName
              : connectionSettings.kubeconfigPath
              ? connectionSettings.kubeconfigPath.split('/').pop() || 'kubeconfig'
              : 'Kubeconfig'}
          </span>
        </button>

        {/* Root data source selector */}
        <Select value={connectionSettings.mode} onValueChange={value => value && void switchSource(value as ConnectionSettings['mode'])} disabled={connecting || inVsCode}>
          <SelectTrigger className="h-9 min-w-40 rounded-lg bg-muted/45 px-3 shadow-xs" aria-label="Change application data source">
            <span className={`size-2 rounded-full ${connectionSettings.mode === 'live' ? 'bg-success' : 'bg-info'}`}/>
            <SelectValue className="sr-only"/>
            <span className="flex-1 text-left text-xs font-semibold">{connectionSettings.mode === 'live' ? 'Live cluster' : 'Mock data'}</span>
          </SelectTrigger>
          <SelectContent align="start" sideOffset={6} className="min-w-64 rounded-xl p-1.5 shadow-xl">
            <SelectItem value="live" className="rounded-lg py-2.5 pl-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-success/10 text-success-foreground"><Server size={15}/></span>
              <span><span className="block text-sm font-medium">Live cluster</span><span className="block text-[11px] text-muted-foreground">Kubernetes API data</span></span>
            </SelectItem>
            {!inVsCode && (
              <SelectItem value="mock" className="rounded-lg py-2.5 pl-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-info/10 text-info"><Database size={15}/></span>
                <span><span className="block text-sm font-medium">Mock data</span><span className="block text-[11px] text-muted-foreground">Safe sample environment</span></span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {/* Auto-refresh selector */}
        <Tooltip>
          <TooltipTrigger render={
            <div className="flex items-center gap-1.5">
              <Timer size={13} className={isAutoRefreshing ? 'text-success-foreground' : 'text-muted-foreground'} />
              <Select value={String(autoRefreshInterval)} onValueChange={v => onAutoRefreshChange(Number(v))}>
                <SelectTrigger className="h-7 w-16 text-[11px] bg-muted/60 border-border px-2 gap-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {AUTO_REFRESH_INTERVALS.map(item => (
                    <SelectItem key={item.value} value={String(item.value)} className="text-xs">
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          } />
          <TooltipContent side="bottom">Auto-refresh: {autoRefreshLabel}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openSettings()} aria-label="Connection settings">
              <Settings size={16} />
            </Button>
          } />
          <TooltipContent side="bottom">Connection settings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              aria-label={`Switch to ${isDarkTheme ? 'light' : 'dark'} theme`}
              suppressHydrationWarning
            >
              <Sun size={16} className="hidden dark:block" />
              <Moon size={16} className="dark:hidden" />
            </Button>
          } />
          <TooltipContent side="bottom">Toggle theme</TooltipContent>
        </Tooltip>

        {/* Data freshness */}
        {lastDiscoveredAt && (
          <div className="hidden items-center gap-2 rounded-md border border-border bg-muted/35 px-2.5 py-1.5 md:flex" title={`Last updated ${new Date(lastDiscoveredAt).toLocaleString()}`}>
            <span className={`size-2 rounded-full ${isDiscovering ? 'animate-pulse bg-warning' : connectionSettings.mode === 'live' ? 'bg-success' : 'bg-info'}`} />
            <span className="text-xs font-medium text-foreground">{isDiscovering ? 'Refreshing' : connectionSettings.mode === 'live' ? 'Live' : 'Demo'}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{new Date(lastDiscoveredAt).toLocaleTimeString()}</span>
          </div>
        )}

        {/* Warnings */}
        {warningCount > 0 && (
          <Tooltip>
            <TooltipTrigger render={
              <Button variant="ghost" size="icon" className="relative h-8 w-8 text-warning-foreground hover:text-warning-foreground" onClick={() => setWarningsOpen(true)} aria-label={`Open ${warningCount} discovery warnings`}>
                <AlertTriangle size={16} />
                <Badge className="absolute -top-1 -right-1 h-4 min-w-4 text-[9px] px-1 bg-warning text-black">
                  {warningCount}
                </Badge>
              </Button>
            } />
            <TooltipContent side="bottom">{warningCount} discovery warning{warningCount !== 1 ? 's' : ''}</TooltipContent>
          </Tooltip>
        )}

        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onRefresh()}
              disabled={isDiscovering}
              aria-label="Refresh graph"
            >
              {isDiscovering ? <LoadingIndicator size="sm" /> : <RefreshCw size={16} />}
            </Button>
          } />
          <TooltipContent side="bottom">Refresh graph (r)</TooltipContent>
        </Tooltip>
      </header>

      {warnings.length > 0 && warningNotificationOpen && (
        <aside role="status" aria-live="polite" className="fixed right-4 top-16 z-[80] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-warning/30 bg-popover/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-3 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-foreground"><AlertTriangle size={17}/></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">Kubernetes discovery issues</p><p className="mt-1 text-xs leading-5 text-muted-foreground"><strong className="text-warning-foreground">{warnings.length} issue{warnings.length === 1 ? '' : 's'}</strong> detected while contacting the cluster.</p><Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => { setWarningNotificationOpen(false); setWarningsOpen(true); }}>View all statuses</Button></div>
            <Button variant="ghost" size="icon-sm" onClick={() => setWarningNotificationOpen(false)} aria-label="Dismiss discovery notification"><X size={14}/></Button>
          </div>
        </aside>
      )}

      <Dialog open={warningsOpen} onOpenChange={setWarningsOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kubernetes discovery status</DialogTitle>
            <DialogDescription>{warnings.length} resource requests returned an issue. No credentials are shown here.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {warnings.map((warning, index) => (
              <div key={`${warning.resourceType}-${index}`} className="flex items-start gap-3 rounded-md border border-border bg-muted/70 px-3 py-2">
                <AlertTriangle size={14} className={warning.type === 'error' ? 'mt-0.5 shrink-0 text-destructive-foreground' : 'mt-0.5 shrink-0 text-warning-foreground'} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <span>{warning.resourceType}</span>
                    <span className={warning.type === 'error' ? 'text-destructive-foreground' : 'text-warning-foreground'}>{warning.type}</span>
                  </div>
                  <p className="mt-1 break-words text-[11px] text-muted-foreground">{warning.message}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={open => { if (!connecting) setSettingsOpen(open); }}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Connection settings</DialogTitle>
            <DialogDescription>Values are sent securely to the server for graph discovery. Tokens are never included in graph data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {connectionErrorInfo && (
              <ConnectionErrorCard
                error={connectionErrorInfo}
                draftSettings={draftSettings}
                onUpdateDraftSettings={updateDraftSettings}
                onRetryWithPatch={patch => void connect(patch)}
                isConnecting={connecting}
              />
            )}
            <label className="block text-xs text-muted-foreground">Mode
              <Select
                value={draftSettings.mode}
                onValueChange={value => { if (value) updateDraftSettings({ mode: value as ConnectionSettings['mode'] }); }}
                disabled={connecting}
              >
                <SelectTrigger className="mt-1 w-full h-8 bg-muted border-border text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Production / Kubernetes</SelectItem>
                  {!inVsCode && <SelectItem value="mock">Demo data</SelectItem>}
                </SelectContent>
              </Select>
            </label>
            {draftSettings.mode === 'live' && (
              <>
                <label className="block text-xs text-muted-foreground">Kubernetes Environment
                  <Select
                    value={draftSettings.environment ?? 'default'}
                    onValueChange={value => {
                      if (value) {
                        const env = value as ConnectionSettings['environment'];
                        updateDraftSettings({
                          environment: env,
                          // Clear remote token/url when switching away from custom
                          clusterUrl: env === 'custom' ? draftSettings.clusterUrl : '',
                          token: env === 'custom' ? draftSettings.token : '',
                        });
                      }
                    }}
                    disabled={connecting}
                  >
                    <SelectTrigger className="mt-1 w-full h-8 bg-muted border-border text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Auto-Detect (~/.kube/config / Minikube / kind)</SelectItem>
                      <SelectItem value="microk8s">MicroK8s (microk8s config)</SelectItem>
                      <SelectItem value="k3s">K3s (/etc/rancher/k3s/k3s.yaml)</SelectItem>
                      <SelectItem value="kubeconfig">Kubeconfig File (Provide Path or Upload File)</SelectItem>
                      <SelectItem value="custom">Remote Cluster (URL & Token)</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                {draftSettings.environment === 'kubeconfig' && (
                  <div className="space-y-2.5 rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">Kubeconfig Source</span>
                      <div className="flex items-center rounded-md border border-border bg-muted/60 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setKubeconfigTab('path')}
                          className={`flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                            kubeconfigTab === 'path'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <FolderOpen size={12} />
                          <span>File Path</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setKubeconfigTab('upload')}
                          className={`flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                            kubeconfigTab === 'upload'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <UploadCloud size={12} />
                          <span>Upload File</span>
                          {draftSettings.kubeconfigContent && (
                            <span className="size-1.5 rounded-full bg-emerald-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    {kubeconfigTab === 'path' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              disabled={connecting}
                              value={draftSettings.kubeconfigPath ?? ''}
                              onChange={event => updateDraftSettings({
                                kubeconfigPath: event.target.value,
                                kubeconfigContent: undefined,
                                kubeconfigFileName: undefined,
                              })}
                              placeholder="~/.kube/config or /path/to/kubeconfig"
                              className="bg-muted border-border pr-8 text-xs font-mono h-8"
                            />
                            {draftSettings.kubeconfigPath && (
                              <button
                                type="button"
                                onClick={() => updateDraftSettings({ kubeconfigPath: '' })}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                title="Clear path"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={connecting}
                            onClick={handleBrowseKubeconfig}
                            className="h-8 shrink-0 gap-1.5 text-xs bg-muted hover:bg-muted/80 border-border"
                            title="Browse for kubeconfig file"
                          >
                            <FolderOpen size={13} />
                            <span>Browse</span>
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>Quick paths:</span>
                          <button
                            type="button"
                            className="underline hover:text-foreground font-mono"
                            onClick={() => updateDraftSettings({
                              kubeconfigPath: '~/.kube/config',
                              kubeconfigContent: undefined,
                              kubeconfigFileName: undefined,
                            })}
                          >
                            ~/.kube/config
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            className="underline hover:text-foreground font-mono"
                            onClick={() => updateDraftSettings({
                              kubeconfigPath: '/etc/kubernetes/admin.conf',
                              kubeconfigContent: undefined,
                              kubeconfigFileName: undefined,
                            })}
                          >
                            /etc/kubernetes/admin.conf
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {draftSettings.kubeconfigContent ? (
                          <div className="space-y-2.5 rounded-lg border border-border bg-card/60 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                                  <FileCode size={16} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-xs font-semibold text-foreground" title={draftSettings.kubeconfigFileName}>
                                      {draftSettings.kubeconfigFileName ?? 'Uploaded kubeconfig'}
                                    </span>
                                    <Badge variant="outline" className="h-4 px-1 text-[9px] border-emerald-500/40 text-emerald-400">
                                      Loaded
                                    </Badge>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {(draftSettings.kubeconfigContent.length / 1024).toFixed(1)} KB · In-memory
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  title="Replace file"
                                >
                                  Replace
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleClearUploadedFile}
                                  className="h-7 size-7 p-0 text-muted-foreground hover:text-destructive"
                                  title="Remove uploaded file"
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </div>

                            {/* Parsed Metadata Summary */}
                            {parsedKubeconfig && parsedKubeconfig.valid && (
                              <div className="rounded-md border border-border/70 bg-muted/40 p-2.5 text-xs space-y-2">
                                {parsedKubeconfig.clusters[0]?.server && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Server size={12} className="text-primary shrink-0" />
                                    <span className="font-semibold text-foreground">API Server:</span>
                                    <span className="font-mono text-[11px] text-primary truncate max-w-[280px]">
                                      {parsedKubeconfig.clusters[0].server}
                                    </span>
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-medium">
                                    {parsedKubeconfig.totalContexts} {parsedKubeconfig.totalContexts === 1 ? 'Context' : 'Contexts'}
                                  </Badge>
                                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-medium">
                                    {parsedKubeconfig.totalClusters} {parsedKubeconfig.totalClusters === 1 ? 'Cluster' : 'Clusters'}
                                  </Badge>
                                  {parsedKubeconfig.users[0]?.authType && (
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize text-muted-foreground border-border">
                                      Auth: {parsedKubeconfig.users[0].authType}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border/80 hover:border-primary/60 bg-muted/20 hover:bg-muted/40 p-4 cursor-pointer transition-colors text-center"
                          >
                            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <UploadCloud size={16} />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-foreground">
                                Click to upload or drag &amp; drop kubeconfig
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Supports .yaml, .yml, .config, .conf
                              </p>
                            </div>
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".yaml,.yml,.config,.conf,*"
                          onChange={handleFileInputChange}
                          className="hidden"
                        />
                      </div>
                    )}

                    {draftContexts.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-border/60">
                        <label className="block text-[11px] text-muted-foreground">
                          Active Context ({draftContexts.length} available in this kubeconfig)
                        </label>
                        <Select
                          value={draftSettings.contextName || draftContexts.find(c => c.isActive)?.name || draftContexts[0]?.name}
                          onValueChange={value => updateDraftSettings({ contextName: value || undefined })}
                          disabled={connecting}
                        >
                          <SelectTrigger className="h-8 bg-muted border-border text-xs">
                            <SelectValue placeholder="Select context" />
                          </SelectTrigger>
                          <SelectContent>
                            {draftContexts.map(ctx => (
                              <SelectItem key={ctx.name} value={ctx.name}>
                                <span className="font-mono">{ctx.name}</span>
                                {ctx.isActive && <span className="ml-1.5 text-[10px] text-muted-foreground">(current)</span>}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {draftSettings.environment === 'custom' && (
                  <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                    <label className="block text-xs text-muted-foreground">Cluster URL
                      <Input disabled={connecting} value={draftSettings.clusterUrl ?? ''} onChange={event => updateDraftSettings({ clusterUrl: event.target.value })} placeholder="https://10.0.0.10:6443" className="mt-1 bg-muted border-border h-8 text-xs font-mono" />
                    </label>
                    <label className="block text-xs text-muted-foreground">Bearer Token
                      <Input disabled={connecting} type="password" value={draftSettings.token ?? ''} onChange={event => updateDraftSettings({ token: event.target.value })} placeholder="Kubernetes bearer token" className="mt-1 bg-muted border-border font-mono text-xs h-8" />
                    </label>
                  </div>
                )}

                {draftSettings.environment !== 'custom' && draftSettings.environment !== 'kubeconfig' && (
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Local Cluster Connection:</span> Uses your local cluster credentials directly. Zero IP, port, or token configuration required.
                  </div>
                )}
              </>
            )}
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <div>
                <label htmlFor="skip-tls-verification" className="text-xs font-medium text-foreground">Skip TLS verification</label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Use only for a trusted cluster with a self-signed certificate.</p>
              </div>
              <Switch
                id="skip-tls-verification"
                checked={draftSettings.skipTlsVerify ?? false}
                onCheckedChange={checked => updateDraftSettings({ skipTlsVerify: checked })}
                disabled={draftSettings.mode === 'mock' || connecting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void connect()} disabled={connecting || isDiscovering} className="min-w-40 bg-primary text-primary-foreground hover:bg-primary/85">
              {connecting || isDiscovering ? <LoadingIndicator size="sm" label="Connecting…" /> : 'Connect and refresh'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
