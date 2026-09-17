'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Box, FileStack, GitBranch, Lightbulb, RotateCw, Shield, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getEnabledPlugins } from '@/config/plugins';
import type { PluginManifest } from '@/lib/plugins/contracts';

const ICONS = {
  activity: Activity,
  box: Box,
  'file-stack': FileStack,
  'git-branch': GitBranch,
  lightbulb: Lightbulb,
  shield: Shield,
  'shield-check': ShieldCheck,
} as const;

const coreTelemetry = getEnabledPlugins().find(plugin => plugin.id === 'telemetry');

function navigationOrder(runtimePlugins: PluginManifest[]) {
  const byId = new Map(runtimePlugins.map(plugin => [plugin.id, plugin]));
  if (coreTelemetry) byId.set('telemetry', coreTelemetry);
  const ordered = [...byId.values()].filter(plugin => plugin.enabled).sort((a, b) => a.order - b.order);
  const telemetry = ordered.find(plugin => plugin.id === 'telemetry');
  if (!telemetry) return ordered;
  const withoutTelemetry = ordered.filter(plugin => plugin.id !== 'telemetry');
  const newPluginsIndex = withoutTelemetry.findIndex(plugin => plugin.id === 'new_plugins');
  withoutTelemetry.splice(newPluginsIndex < 0 ? withoutTelemetry.length : newPluginsIndex, 0, telemetry);
  return withoutTelemetry;
}

export function WorkspaceNav() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [plugins, setPlugins] = useState<PluginManifest[]>(navigationOrder(getEnabledPlugins()));
  const [refreshingTabs, setRefreshingTabs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const refresh = () => fetch('/api/plugins', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: { plugins?: PluginManifest[] }) => { if (active && data.plugins) setPlugins(navigationOrder(data.plugins)); })
      .catch(() => undefined);
    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const handleTabRefresh = (e: React.MouseEvent, pluginId: string, label: string) => {
    e.preventDefault();
    e.stopPropagation();

    setRefreshingTabs((prev) => ({ ...prev, [pluginId]: true }));

    // 1. Invalidate TanStack query caches for this domain/tab
    if (pluginId === 'topology') {
      void queryClient.invalidateQueries({ queryKey: ['topology'] });
    } else if (pluginId === 'rbac') {
      void queryClient.invalidateQueries({ queryKey: ['rbac'] });
    } else if (pluginId === 'images') {
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      void queryClient.invalidateQueries({ queryKey: ['image-analysis'] });
    } else if (pluginId === 'manifests') {
      void queryClient.invalidateQueries({ queryKey: ['manifests'] });
      void queryClient.invalidateQueries({ queryKey: ['manifest-graph'] });
    } else if (pluginId === 'security') {
      void queryClient.invalidateQueries({ queryKey: ['security'] });
    } else if (pluginId === 'telemetry') {
      void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
    } else if (pluginId === 'new_plugins') {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    }

    // 2. Dispatch targeted custom events so the active tab component immediately re-fetches
    window.dispatchEvent(
      new CustomEvent('klystr:refresh', {
        detail: { pluginId, timestamp: Date.now() },
      })
    );
    window.dispatchEvent(
      new CustomEvent(`klystr:refresh:${pluginId}`, {
        detail: { pluginId, timestamp: Date.now() },
      })
    );

    // Keep spinning feedback visible for a satisfying, responsive micro-interaction
    setTimeout(() => {
      setRefreshingTabs((prev) => ({ ...prev, [pluginId]: false }));
    }, 700);
  };

  return (
    <nav
      className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-card px-3 sm:px-4"
      aria-label="Workspace views"
    >
      {plugins.map((plugin) => {
        const Icon = ICONS[plugin.icon];
        const isActive = pathname === plugin.route || pathname.startsWith(`${plugin.route}/`);
        const isRefreshing = refreshingTabs[plugin.id] ?? false;

        return (
          <Link
            key={plugin.id}
            href={plugin.route}
            className={`group relative flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-medium transition-colors ${
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={14} className="shrink-0" />
            <span>{plugin.label}</span>
            <button
              type="button"
              onClick={(e) => handleTabRefresh(e, plugin.id, plugin.label)}
              title={`Reload ${plugin.label} data`}
              aria-label={`Reload ${plugin.label} data`}
              className={`group/reload -mr-1 ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-all duration-200 hover:bg-muted/80 hover:text-primary hover:scale-110 active:scale-95 ${
                isRefreshing
                  ? 'opacity-100 text-primary pointer-events-auto'
                  : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'
              }`}
            >
              <RotateCw
                size={11}
                className={`transition-transform duration-300 ${
                  isRefreshing ? 'animate-spin' : 'group-hover/reload:rotate-180'
                }`}
              />
            </button>
          </Link>
        );
      })}
    </nav>
  );
}

