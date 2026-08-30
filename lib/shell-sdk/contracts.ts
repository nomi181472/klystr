import type { ConnectionSettings } from '@/lib/types';

export const SHELL_SDK_VERSION = '1.0.0';

export interface ShellSnapshot {
  version: typeof SHELL_SDK_VERSION;
  connection: ConnectionSettings;
  activeContext: string | null;
  discoveredNamespaces: string[];
}

export type ShellCommand =
  | { type: 'topology.refresh' }
  | { type: 'navigation.open'; path: string };

export interface ShellSdk {
  version: typeof SHELL_SDK_VERSION;
  getSnapshot(): ShellSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: ShellCommand): void;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
