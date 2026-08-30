export const SHELL_API_VERSION = '1.0.0';

export type PluginAvailability = 'local' | 'remote';

export interface PluginManifest {
  id: string;
  label: string;
  route: `/${string}`;
  icon: 'activity' | 'box' | 'file-stack' | 'git-branch' | 'lightbulb' | 'shield' | 'shield-check';
  order: number;
  availability: PluginAvailability;
  enabled: boolean;
  remoteEntry?: string;
  scope?: string;
  exposedModule?: string;
  shellApiRange?: string;
  integrity?: string;
}

export interface FederatedPluginModule {
  default: React.ComponentType;
}
