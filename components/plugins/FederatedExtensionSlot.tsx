'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { loadFederatedPlugin } from '@/lib/plugins/federation';
import type { PluginManifest } from '@/lib/plugins/contracts';

const extensionCache = new Map<string, Promise<ComponentType<Record<string, unknown>>>>();

function discoverExtension(pluginId: string, exposedModule: string) {
  const key = `${pluginId}:${exposedModule}`;
  const cached = extensionCache.get(key);
  if (cached) return cached;
  const pending = fetch('/api/plugins', { cache: 'no-store' })
    .then((response) => response.json())
    .then((data: { plugins?: PluginManifest[] }) => data.plugins?.find((plugin) => plugin.id === pluginId))
    .then((plugin) => plugin?.remoteEntry
      ? loadFederatedPlugin({ ...plugin, exposedModule })
      : Promise.reject(new Error('Extension provider is unavailable.')))
    .then((module) => module.default as ComponentType<Record<string, unknown>>)
    .catch((error) => {
      extensionCache.delete(key);
      throw error;
    });
  extensionCache.set(key, pending);
  return pending;
}

export function FederatedExtensionSlot({
  pluginId,
  exposedModule,
  componentProps,
}: {
  pluginId: string;
  exposedModule: string;
  componentProps: Record<string, unknown>;
}) {
  const [Extension, setExtension] = useState<ComponentType<Record<string, unknown>> | null>(null);

  useEffect(() => {
    let active = true;
    discoverExtension(pluginId, exposedModule)
      .then((component) => { if (active) setExtension(() => component); })
      .catch(() => { if (active) setExtension(null); });
    return () => { active = false; };
  }, [exposedModule, pluginId]);

  return Extension ? <Extension {...componentProps} /> : null;
}
