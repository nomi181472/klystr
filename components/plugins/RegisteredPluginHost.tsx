'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PluginUnavailable } from '@/components/plugins/PluginUnavailable';
import { RemotePluginHost } from '@/components/plugins/RemotePluginHost';
import type { PluginManifest } from '@/lib/plugins/contracts';

export function RegisteredPluginHost({ pluginId, fallback }: { pluginId: string; fallback?: ReactNode }) {
  const [plugin, setPlugin] = useState<PluginManifest | null>(null);
  const [resolved, setResolved] = useState(false);
  // Track the last remote entry so we only trigger a remount when it actually changes.
  const lastRemoteEntry = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const discover = async () => {
      try {
        const response = await fetch('/api/plugins', { cache: 'no-store' });
        const data = await response.json() as { plugins?: PluginManifest[] };
        if (!active) return;
        const found = data.plugins?.find((item) => item.id === pluginId) ?? null;
        // Only update state when the remote entry URL actually changes to avoid
        // unnecessary remounts of the child plugin tree on every poll cycle.
        if (found?.remoteEntry !== lastRemoteEntry.current) {
          lastRemoteEntry.current = found?.remoteEntry;
          setPlugin(found);
        }
      } catch {
        if (active) setPlugin(null);
      } finally {
        if (active) setResolved(true);
      }
    };
    void discover();
    // Poll every 30s so a newly-deployed remote is picked up without a page reload.
    const interval = window.setInterval(() => void discover(), 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [pluginId]);

  if (!resolved) return fallback ?? null;
  if (!plugin?.remoteEntry) return fallback ?? <PluginUnavailable label={plugin?.label ?? pluginId} />;
  return <RemotePluginHost plugin={plugin} fallback={fallback} />;
}
