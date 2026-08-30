import 'server-only';
import { getEnabledPlugins } from '@/config/plugins';
import type { PluginManifest } from '@/lib/plugins/contracts';

const REMOTE_ENV: Record<string, string | undefined> = {
  topology: process.env.KLYSTR_TOPOLOGY_REMOTE_ENTRY,
  rbac: process.env.KLYSTR_RBAC_REMOTE_ENTRY,
  images: process.env.KLYSTR_IMAGES_REMOTE_ENTRY,
  manifests: process.env.KLYSTR_MANIFESTS_REMOTE_ENTRY,
  security: process.env.KLYSTR_SECURITY_REMOTE_ENTRY,
};

function isManifest(value: unknown): value is PluginManifest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PluginManifest>;
  const icons = ['box', 'file-stack', 'git-branch', 'lightbulb', 'shield', 'shield-check'];
  return typeof item.id === 'string'
    && typeof item.label === 'string'
    && typeof item.route === 'string'
    && item.route.startsWith('/')
    && typeof item.order === 'number'
    && typeof item.icon === 'string'
    && icons.includes(item.icon)
    && typeof item.enabled === 'boolean'
    && (item.integrity === undefined || typeof item.integrity === 'string')
    && (item.availability === 'local' || item.availability === 'remote')
    && (item.availability !== 'remote' || (
      item.route === `/plugins/${item.id}`
      && typeof item.remoteEntry === 'string'
      && typeof item.scope === 'string'
      && typeof item.exposedModule === 'string'
    ));
}

async function externalManifests(): Promise<PluginManifest[]> {
  const inline = process.env.KLYSTR_PLUGIN_REGISTRY_JSON;
  if (inline) {
    try {
      const parsed: unknown = JSON.parse(inline);
      return Array.isArray(parsed) ? parsed.filter(isManifest) : [];
    } catch {
      return [];
    }
  }

  const url = process.env.KLYSTR_PLUGIN_REGISTRY_URL;
  if (!url) return [];
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return [];
    const parsed: unknown = await response.json();
    return Array.isArray(parsed) ? parsed.filter(isManifest) : [];
  } catch {
    return [];
  }
}

export async function getRuntimePlugins(): Promise<PluginManifest[]> {
  const core = getEnabledPlugins().map((plugin) => ({
    ...plugin,
    remoteEntry: REMOTE_ENV[plugin.id] ?? plugin.remoteEntry,
  }));
  const merged = new Map<string, PluginManifest>(core.map((plugin) => [plugin.id, plugin]));
  for (const plugin of await externalManifests()) merged.set(plugin.id, plugin);
  return [...merged.values()].filter((plugin) => plugin.enabled).sort((a, b) => a.order - b.order);
}
