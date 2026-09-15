'use client';

import { create } from 'zustand';
import type { ConnectionSettings } from '@/lib/types';

export const isVsCodeEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('vscode') === 'true' || window.parent !== window;
  } catch {
    return false;
  }
};

const STORAGE_KEY = 'klystr:connection-settings';

export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = {
  mode: 'mock',
  clusterUrl: '',
  token: '',
  skipTlsVerify: false,
};

interface ConnectionState {
  settings: ConnectionSettings;
  hydrated: boolean;
  revision: number;
  hydrate: () => void;
  apply: (settings: ConnectionSettings) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  settings: DEFAULT_CONNECTION_SETTINGS,
  hydrated: false,
  revision: 0,
  hydrate: () => {
    if (get().hydrated) return;
    const inVsCode = isVsCodeEnvironment();
    let settings: ConnectionSettings = {
      ...DEFAULT_CONNECTION_SETTINGS,
      mode: inVsCode ? 'live' : 'mock',
    };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ConnectionSettings>;
        settings = {
          mode: inVsCode ? 'live' : parsed.mode === 'live' ? 'live' : 'mock',
          clusterUrl: parsed.clusterUrl ?? '',
          connectionId: parsed.connectionId,
          skipTlsVerify: parsed.skipTlsVerify === true,
          environment: parsed.environment,
          kubeconfigPath: parsed.kubeconfigPath,
          kubeconfigContent: parsed.kubeconfigContent,
          kubeconfigFileName: parsed.kubeconfigFileName,
          contextName: parsed.contextName,
          token: '',
        };
      }
    } catch { /* use safe defaults */ }
    set({ settings, hydrated: true, revision: get().revision + 1 });
  },
  apply: newSettings => {
    const inVsCode = isVsCodeEnvironment();
    const settings: ConnectionSettings = {
      ...newSettings,
      mode: inVsCode ? 'live' : newSettings.mode,
    };
    set(state => ({ settings, hydrated: true, revision: state.revision + 1 }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: settings.mode,
        clusterUrl: settings.clusterUrl,
        connectionId: settings.connectionId,
        skipTlsVerify: settings.skipTlsVerify,
        environment: settings.environment,
        kubeconfigPath: settings.kubeconfigPath,
        kubeconfigContent: settings.kubeconfigContent,
        kubeconfigFileName: settings.kubeconfigFileName,
        contextName: settings.contextName,
      }));
    } catch { /* storage is optional */ }
  },
}));
