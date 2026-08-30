'use client';

import { create } from 'zustand';
import type { ConnectionSettings } from '@/lib/types';

const STORAGE_KEY = 'klystr:connection-settings';
export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = { mode: 'mock', clusterUrl: '', token: '', skipTlsVerify: false };


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
    let settings = DEFAULT_CONNECTION_SETTINGS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ConnectionSettings>;
        settings = {
          mode: parsed.mode === 'live' ? 'live' : 'mock',
          clusterUrl: parsed.clusterUrl ?? '',
          connectionId: parsed.connectionId,
          skipTlsVerify: parsed.skipTlsVerify === true,
          token: '',
        };
      }
    } catch { /* use safe defaults */ }
    set({ settings, hydrated: true, revision: get().revision + 1 });
  },
  apply: settings => {
    set(state => ({ settings, hydrated: true, revision: state.revision + 1 }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: settings.mode, clusterUrl: settings.clusterUrl, connectionId: settings.connectionId, skipTlsVerify: settings.skipTlsVerify })); } catch { /* storage is optional */ }
  },
}));
