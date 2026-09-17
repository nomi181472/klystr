'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Box, FileStack, GitBranch, Lightbulb, Shield, ShieldCheck } from 'lucide-react';
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
  const router = useRouter();
  const [plugins, setPlugins] = useState<PluginManifest[]>(navigationOrder(getEnabledPlugins()));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('klystr_active_route', pathname);
      if (window.parent !== window) {
        window.parent.postMessage({
          command: 'routeChanged',
          path: pathname,
          url: window.location.href,
        }, '*');
      }
    }
  }, [pathname]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.command === 'navigateTo' && event.data.path) {
        router.push(event.data.path);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

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

  return (
    <nav
      className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-card px-3 sm:px-4"
      aria-label="Workspace views"
    >
      {plugins.map((plugin) => {
        const Icon = ICONS[plugin.icon];
        const isActive = pathname === plugin.route || pathname.startsWith(`${plugin.route}/`);
        return (
          <Link
            key={plugin.id}
            href={plugin.route}
            className={`flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-medium transition-colors ${
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={14} />
            {plugin.label}
          </Link>
        );
      })}
    </nav>
  );
}
