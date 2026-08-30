import { create } from 'zustand';
import type { DiscoveryProgress, DiscoveryWarning } from '@/lib/types';

interface DiscoveryState {
  progress: Record<string, DiscoveryProgress>;
  warnings: DiscoveryWarning[];
  isDiscovering: boolean;
  lastDiscoveredAt: string | null;
  autoRefreshInterval: number; // 0 = off
  isLiveMode: boolean;
}

interface DiscoveryActions {
  updateProgress: (p: DiscoveryProgress) => void;
  addWarning: (w: DiscoveryWarning) => void;
  setIsDiscovering: (v: boolean) => void;
  setLastDiscoveredAt: (ts: string) => void;
  setAutoRefreshInterval: (ms: number) => void;
  setIsLiveMode: (v: boolean) => void;
  resetProgress: () => void;
}

export const useDiscoveryStore = create<DiscoveryState & DiscoveryActions>((set) => ({
  progress: {},
  warnings: [],
  isDiscovering: false,
  lastDiscoveredAt: null,
  autoRefreshInterval: 0,
  isLiveMode: false,

  updateProgress: (p) =>
    set((s) => ({
      progress: { ...s.progress, [p.resourceType]: p },
    })),

  addWarning: (w) =>
    set((s) => ({
      warnings: [...s.warnings, w],
    })),

  setIsDiscovering: (v) => set({ isDiscovering: v }),
  setLastDiscoveredAt: (ts) => set({ lastDiscoveredAt: ts }),
  setAutoRefreshInterval: (ms) => set({ autoRefreshInterval: ms }),
  setIsLiveMode: (v) => set({ isLiveMode: v }),

  resetProgress: () => set({ progress: {}, warnings: [] }),
}));
