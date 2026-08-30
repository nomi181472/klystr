import type { PluginManifest } from '@/lib/plugins/contracts';

/**
 * Shell navigation is driven by this registry. Remote entries may be added
 * before their deployment exists; the shell will show an unavailable page
 * until the remote can be loaded.
 */
export const PLUGIN_REGISTRY: readonly PluginManifest[] = [
  { id: 'rbac', label: 'RBAC', route: '/rbac', icon: 'shield', order: 10, availability: 'remote', enabled: true, remoteEntry: process.env.NEXT_PUBLIC_RBAC_REMOTE_ENTRY, scope: 'klystrRbac', exposedModule: './Plugin', shellApiRange: '^1.0.0' },
  {
    id: 'topology',
    label: 'Topology',
    route: '/topology',
    icon: 'git-branch',
    order: 20,
    availability: 'remote',
    enabled: true,
    remoteEntry: process.env.NEXT_PUBLIC_TOPOLOGY_REMOTE_ENTRY,
    scope: 'klystrTopology',
    exposedModule: './Plugin',
    shellApiRange: '^1.0.0',
  },
  { id: 'images', label: 'Image Analysis', route: '/images', icon: 'box', order: 30, availability: 'remote', enabled: true, remoteEntry: process.env.NEXT_PUBLIC_IMAGES_REMOTE_ENTRY, scope: 'klystrImages', exposedModule: './Plugin', shellApiRange: '^1.0.0' },
  { id: 'manifests', label: 'Manifests', route: '/manifests', icon: 'file-stack', order: 40, availability: 'remote', enabled: true, remoteEntry: process.env.NEXT_PUBLIC_MANIFESTS_REMOTE_ENTRY, scope: 'klystrManifests', exposedModule: './Plugin', shellApiRange: '^1.0.0' },
  { id: 'security', label: 'Security', route: '/security', icon: 'shield-check', order: 50, availability: 'remote', enabled: true, remoteEntry: process.env.NEXT_PUBLIC_SECURITY_REMOTE_ENTRY, scope: 'klystrSecurity', exposedModule: './Plugin', shellApiRange: '^1.0.0' },
  { id: 'telemetry', label: 'Telemetry', route: '/telemetry', icon: 'activity', order: 60, availability: 'local', enabled: true },
  {
    id: 'new_plugins',
    label: 'New Plugins',
    route: '/plugins/new_plugins',
    icon: 'lightbulb',
    order: 100,
    availability: 'remote',
    enabled: true,
    remoteEntry: process.env.NEXT_PUBLIC_IDEAS_REMOTE_ENTRY,
    scope: 'klystrIdeas',
    exposedModule: './Plugin',
    shellApiRange: '^1.0.0',
  },
] as const;

export function getEnabledPlugins(): PluginManifest[] {
  return PLUGIN_REGISTRY.filter((plugin) => plugin.enabled).sort((a, b) => a.order - b.order);
}

export function getPlugin(id: string): PluginManifest | undefined {
  return getEnabledPlugins().find((plugin) => plugin.id === id);
}
