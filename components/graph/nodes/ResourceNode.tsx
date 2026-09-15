'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ElementType } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getResourceConfig } from '@/config/resource-types';
import { Badge } from '@/components/ui/badge';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { useGraphStore } from '@/stores/graph-store';
import type { ConnectionSettings, GraphContainerInfo, PodMetrics } from '@/lib/types';
import type { ContainerMetaphor } from '@/lib/graph/pod-metaphor';
import { CircleHelp, Cpu, MemoryStick, MoreVertical, Microchip, Network, Package, Wind } from 'lucide-react';
import {
  SiActix, SiApachekafka, SiDjango, SiDotnet, SiElasticsearch, SiExpress, SiFastapi,
  SiFlask, SiGo, SiGunicorn, SiJavascript, SiLaravel, SiMariadb, SiMongodb, SiMysql,
  SiNestjs, SiNextdotjs, SiNginx, SiNodedotjs, SiOpenjdk, SiOpensearch, SiPhp,
  SiPostgresql, SiPuma, SiPython, SiQuarkus, SiRabbitmq, SiRedis, SiRuby,
  SiRubyonrails, SiRust, SiSpring, SiSymfony, SiTypescript,
} from '@icons-pack/react-simple-icons';
import { FederatedExtensionSlot } from '@/components/plugins/FederatedExtensionSlot';

export interface ResourceNodeData {
  kind: string;
  name: string;
  namespace: string | null;
  status?: string;
  ip?: string;
  ports?: { port: number; protocol: string; name?: string }[];
  podMetrics?: PodMetrics;
  containers?: GraphContainerInfo[];
  containerMetaphorsPending?: boolean;
  resourceUid: string;
  labels?: Record<string, string>;
  onEditLabels?: () => void;
  connectionSettings?: ConnectionSettings;
  activeContext?: string | null;
  dimmed?: boolean;
  pathDirection?: 'upstream' | 'downstream' | 'both';
  [key: string]: unknown;
}

// ─── Status badge logic ──────────────────────────────────────────
type StatusSeverity = 'healthy' | 'warning' | 'error' | 'muted';

function getStatusSeverity(status: string | undefined): StatusSeverity {
  if (!status) return 'muted';
  const s = status.toLowerCase();
  if (['running', 'available', 'active', 'ready', 'bound', 'succeeded', 'complete', 'completed', 'healthy'].includes(s)) return 'healthy';
  if (['crashloopbackoff', 'error', 'failed', 'oomkilled', 'imagepullbackoff', 'errimagepull', 'createcontainerconfigerror'].includes(s)) return 'error';
  if (['pending', 'terminating', 'containercreatring', 'init:crashloopbackoff', 'notready', 'unknown'].includes(s)) return 'warning';
  return 'muted';
}

function getPodMotion(kind: string, status: string | undefined) {
  if (kind !== 'Pod' || !status) return '';
  const normalized = status.toLowerCase().replaceAll(/[^a-z]/g, '');
  if (normalized.includes('crash') || ['error', 'failed', 'oomkilled', 'imagepullbackoff', 'errimagepull', 'evicted'].includes(normalized)) {
    return 'pod-node-crashed';
  }
  if (normalized.includes('pending') || normalized.includes('creating') || normalized.includes('init')) {
    return 'pod-node-pending';
  }
  if (['stopped', 'terminated', 'completed', 'complete', 'succeeded'].includes(normalized)) {
    return 'pod-node-stopped';
  }
  return '';
}

const STATUS_STYLES: Record<StatusSeverity, { border: string; color: string }> = {
  healthy: { border: 'color-mix(in oklch, var(--success) 32%, transparent)', color: 'var(--success-foreground)' },
  error:   { border: 'color-mix(in oklch, var(--destructive) 32%, transparent)', color: 'var(--destructive-foreground)' },
  warning: { border: 'color-mix(in oklch, var(--warning) 32%, transparent)', color: 'var(--warning-foreground)' },
  muted:   { border: 'var(--border)',   color: 'var(--muted-foreground)' },
};

const CONTAINER_METAPHOR_ICONS: Record<ContainerMetaphor, ElementType> = {
  python: SiPython,
  fastapi: SiFastapi,
  django: SiDjango,
  flask: SiFlask,
  gunicorn: SiGunicorn,
  uvicorn: Wind,
  javascript: SiJavascript,
  nodejs: SiNodedotjs,
  typescript: SiTypescript,
  nextjs: SiNextdotjs,
  nestjs: SiNestjs,
  express: SiExpress,
  java: SiOpenjdk,
  spring: SiSpring,
  quarkus: SiQuarkus,
  micronaut: Microchip,
  go: SiGo,
  rust: SiRust,
  cargo: Package,
  actix: SiActix,
  axum: Network,
  ruby: SiRuby,
  rails: SiRubyonrails,
  puma: SiPuma,
  php: SiPhp,
  laravel: SiLaravel,
  symfony: SiSymfony,
  dotnet: SiDotnet,
  postgresql: SiPostgresql,
  mysql: SiMysql,
  mariadb: SiMariadb,
  mongodb: SiMongodb,
  redis: SiRedis,
  elasticsearch: SiElasticsearch,
  opensearch: SiOpensearch,
  kafka: SiApachekafka,
  rabbitmq: SiRabbitmq,
  nginx: SiNginx,
};

const METAPHOR_FALLBACKS = new Set<ContainerMetaphor>(['uvicorn', 'micronaut', 'cargo', 'axum']);

function ContainerRows({ containers, podMetrics, metaphorsPending, activeContext, connectionSettings }: {
  containers: GraphContainerInfo[];
  podMetrics?: PodMetrics;
  metaphorsPending: boolean;
  activeContext: string | null;
  connectionSettings: ConnectionSettings;
}) {
  return (
    <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2" aria-label={`${containers.length} containers`}>
      {containers.map(container => {
        const metaphor = container.metaphor ?? null;
        const ContainerIcon = metaphor ? CONTAINER_METAPHOR_ICONS[metaphor.id] : CircleHelp;
        const containerMetric = podMetrics?.containers?.[container.name]
          ?? (containers.length === 1 ? podMetrics : undefined);
        const identity = container.imageId ?? container.image;
        const containerStatus = container.status ?? (container.ready === false ? 'NotReady' : container.ready === true ? 'Running' : 'Unknown');
        const containerStatusStyle = STATUS_STYLES[getStatusSeverity(containerStatus)];

        return (
          <div
            key={container.name}
            className="min-w-0 rounded-md border border-border/60 bg-muted/45 px-1.5 py-1.5"
            title={`${container.name} · ${container.type} · ${containerStatus} · ${metaphor?.label ?? 'Unknown technology'} · ${container.image}`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="flex size-6 shrink-0 items-center justify-center rounded bg-card">
                {metaphorsPending ? (
                  <LoadingIndicator size="xs" label={undefined} className="justify-center gap-0" />
                ) : (
                  <ContainerIcon
                    size={13}
                    color={metaphor && !METAPHOR_FALLBACKS.has(metaphor.id) ? 'default' : metaphor ? 'var(--resource-pod)' : 'var(--muted-foreground)'}
                    aria-label={`${container.name}: ${metaphor?.label ?? 'unknown technology'}`}
                  />
                )}
              </div>
              <span className="shrink-0 rounded bg-foreground/5 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wide text-muted-foreground">{container.type}</span>
              <span className="min-w-0 truncate text-[9px] font-medium text-foreground">{metaphor?.label ?? '?'}</span>
              <span
                className="ml-auto inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[9px] font-medium"
                style={{ borderColor: containerStatusStyle.border, color: containerStatusStyle.color }}
              >
                <span className="size-1.5 rounded-full" style={{ background: containerStatusStyle.color }} />
                {containerStatus}
              </span>
            </div>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 pl-7.5">
              <FederatedExtensionSlot
                pluginId="images"
                exposedModule="./TopologyVerification"
                componentProps={{ identity, activeContext, connectionSettings }}
              />
              {containerMetric && (
                <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">
                  {containerMetric.cpu} · {containerMetric.memory}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Context menu ────────────────────────────────────────────────
interface ContextMenuProps {
  x: number;
  y: number;
  nodeData: ResourceNodeData;
  nodeId: string;
  onClose: () => void;
}

function ContextMenu({ x, y, nodeData, nodeId, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleIsolate = useGraphStore(s => s.toggleIsolate);
  const isolateNodeId = useGraphStore(s => s.isolateNodeId);
  const isIsolated = isolateNodeId === nodeId;

  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    onClose();
  }, [onClose]);

  const fqn = nodeData.namespace
    ? `${nodeData.namespace}/${nodeData.name}`
    : nodeData.name;

  const kubectlDescribe = nodeData.namespace
    ? `kubectl describe ${nodeData.kind.toLowerCase()} ${nodeData.name} -n ${nodeData.namespace}`
    : `kubectl describe ${nodeData.kind.toLowerCase()} ${nodeData.name}`;

  const kubectlLogs = (nodeData.kind === 'Pod' || nodeData.kind === 'Deployment')
    ? nodeData.namespace
      ? `kubectl logs -l app=${nodeData.name} -n ${nodeData.namespace} --tail=100`
      : `kubectl logs ${nodeData.name} --tail=100`
    : null;

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as globalThis.Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const items: { label: string; action: () => void; separator?: boolean }[] = [
    ...(nodeData.onEditLabels ? [{ label: 'Add or edit labels', action: () => { nodeData.onEditLabels?.(); onClose(); } }] : []),
    { label: `Copy name: ${nodeData.name}`, action: () => copy(nodeData.name) },
    { label: `Copy namespace/name: ${fqn}`, action: () => copy(fqn) },
    { label: `Copy kubectl describe`, action: () => copy(kubectlDescribe), separator: true },
    ...(kubectlLogs ? [{ label: `Copy kubectl logs`, action: () => copy(kubectlLogs) }] : []),
    {
      label: isIsolated ? 'Exit isolate mode' : 'Isolate node (2-hop view)',
      action: () => { toggleIsolate(nodeId); onClose(); },
      separator: true,
    },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="nodrag nopan fixed z-[9999] min-w-[220px] rounded-lg border border-border bg-popover py-1 text-xs text-popover-foreground shadow-2xl"
      style={{ left: x, top: y }}
      onClick={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div className="my-1 border-t border-border" />}
          <button
            className="w-full text-left px-3 py-1.5 text-foreground hover:bg-accent hover:text-foreground transition-colors truncate"
            onClick={item.action}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ─── Node component ──────────────────────────────────────────────
function ResourceNodeComponent({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as ResourceNodeData;
  const config = getResourceConfig(nodeData.kind);
  const Icon = config.icon;
  const hoveredNodeId = useGraphStore(s => s.hoveredNodeId);
  const isHovered = hoveredNodeId === id;
  const severity = getStatusSeverity(nodeData.status);
  const statusStyle = STATUS_STYLES[severity];
  const podMotion = getPodMotion(nodeData.kind, nodeData.status);
  const primaryContainer = nodeData.containers?.find(container => container.type === 'app') ?? nodeData.containers?.[0];
  const primaryMetaphor = primaryContainer?.metaphor;
  const NodeIcon = nodeData.kind === 'Pod' ? primaryMetaphor ? CONTAINER_METAPHOR_ICONS[primaryMetaphor.id] : CircleHelp : Icon;
  const isMetaphorPending = nodeData.kind === 'Pod' && nodeData.containerMetaphorsPending === true;

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const onOptionsClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 190;
    setCtxMenu({
      x: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      y: rect.bottom + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
    });
  }, []);

  return (
    <>
      <div
        className="group relative cursor-pointer"
        style={{ width: 270, minWidth: 270, maxWidth: 270, opacity: nodeData.dimmed ? 0.34 : 1 }}
        onContextMenu={onContextMenu}
      >
        <div
          className={`relative min-h-[82px] overflow-hidden rounded-lg border bg-card px-3 py-2.5 transition-all duration-200 ${podMotion}`}
          style={{
            background: severity === 'error'
              ? 'color-mix(in oklch, var(--destructive) 7%, var(--card))'
              : severity === 'warning'
                ? 'color-mix(in oklch, var(--warning) 6%, var(--card))'
                : isHovered || selected
                  ? 'color-mix(in oklch, var(--foreground) 4%, var(--card))'
                  : 'var(--card)',
            borderColor: selected
              ? 'var(--ring)'
              : severity === 'error'
                ? 'color-mix(in oklch, var(--destructive) 65%, var(--border))'
                : severity === 'warning'
                  ? 'color-mix(in oklch, var(--warning) 52%, var(--border))'
                  : isHovered ? 'var(--muted-foreground)' : 'var(--border)',
            borderWidth: selected || severity === 'error' ? 2 : 1,
            boxShadow: selected
              ? '0 0 0 3px color-mix(in oklch, var(--ring) 22%, transparent), 0 8px 22px var(--graph-shadow)'
              : isHovered
                ? '0 6px 16px var(--graph-shadow)'
                : '0 1px 3px var(--graph-shadow)',
          }}
        >
          <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: config.color, opacity: 0.72 }} />
          {(severity === 'warning' || severity === 'error') && (
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: severity === 'error' ? 'var(--destructive)' : 'var(--warning)' }} />
          )}
          <button
            type="button"
            className="nodrag nopan absolute right-1.5 top-1.5 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100"
            onClick={onOptionsClick}
            aria-label={`Options for ${nodeData.name}`}
            title="Resource options"
          >
            <MoreVertical size={15} />
          </button>
          {/* Header row */}
          <div className="mb-1.5 flex items-center gap-2 pr-7">
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
              style={{ background: `color-mix(in oklch, ${config.color} 14%, transparent)` }}
            >
              {isMetaphorPending ? (
                <LoadingIndicator size="xs" label={undefined} className="justify-center gap-0" />
              ) : (
                <NodeIcon
                  size={15}
                  color={primaryMetaphor && !METAPHOR_FALLBACKS.has(primaryMetaphor.id) ? 'default' : config.color}
                  aria-label={nodeData.kind === 'Pod' ? primaryMetaphor ? `${primaryMetaphor.label} application container` : 'Unknown container technology' : undefined}
                />
              )}
            </div>
            <span
              className="text-[11px] font-medium"
              style={{ color: config.textColor }}
            >
              {config.shortLabel}
            </span>
            {nodeData.status && nodeData.kind !== 'Pod' && (
              <Badge
                variant="outline"
                className="ml-auto h-5 gap-1 px-1.5 py-0 text-[10px] font-medium"
                style={{ borderColor: statusStyle.border, color: statusStyle.color }}
              >
                <span className="size-1.5 rounded-full" style={{ background: statusStyle.color }} />
                {nodeData.status}
              </Badge>
            )}
          </div>

          {/* Name */}
          <div
            className="truncate font-mono text-[13px] font-semibold leading-5"
            style={{ color: 'var(--foreground)' }}
            title={nodeData.name}
          >
            {nodeData.name}
          </div>

          {/* Ports */}
          {nodeData.ports && nodeData.ports.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {nodeData.ports.slice(0, 3).map((p, i) => (
                <span
                  key={i}
                  className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  :{p.port}
                </span>
              ))}
              {nodeData.ports.length > 3 && (
                <span
                  className="text-[10px] text-muted-foreground"
                  title={nodeData.ports.slice(3).map(p => `:${p.port}`).join(', ')}
                >
                  +{nodeData.ports.length - 3}
                </span>
              )}
            </div>
          )}

          {nodeData.kind === 'Pod' && nodeData.containers?.length && nodeData.connectionSettings ? (
            <ContainerRows
              containers={nodeData.containers}
              podMetrics={nodeData.podMetrics}
              metaphorsPending={nodeData.containerMetaphorsPending === true}
              activeContext={nodeData.activeContext ?? null}
              connectionSettings={nodeData.connectionSettings}
            />
          ) : null}

          {nodeData.kind === 'Pod' && nodeData.podMetrics && !nodeData.containers?.length && (
            <div
              className="mt-2 grid grid-cols-2 gap-1.5 border-t border-border/50 pt-2"
              aria-label={`Current Pod usage: CPU ${nodeData.podMetrics.cpu}, memory ${nodeData.podMetrics.memory}`}
            >
              <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted/55 px-1.5 py-1" title="Current CPU usage across all containers">
                <Cpu size={11} className="shrink-0 text-primary" />
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">CPU</span>
                <span className="ml-auto truncate font-mono text-[11px] font-semibold tabular-nums text-foreground">{nodeData.podMetrics.cpu}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted/55 px-1.5 py-1" title="Current memory usage across all containers">
                <MemoryStick size={11} className="shrink-0 text-info" />
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">RAM</span>
                <span className="ml-auto truncate font-mono text-[11px] font-semibold tabular-nums text-foreground">{nodeData.podMetrics.memory}</span>
              </div>
            </div>
          )}
        </div>

        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-muted-foreground !border-muted-foreground" />
        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-muted-foreground !border-muted-foreground" />
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          nodeData={nodeData}
          nodeId={id}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}

export const ResourceNode = memo(ResourceNodeComponent);
