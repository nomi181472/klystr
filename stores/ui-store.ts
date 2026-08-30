import { create } from 'zustand';

interface UIState {
  isFilterSidebarOpen: boolean;
  isDetailsPanelOpen: boolean;
  isWarningsPanelOpen: boolean;
  isCommandPaletteOpen: boolean;
  activeDetailsTab: 'overview' | 'env' | 'yaml' | 'deps';
}

interface UIActions {
  toggleFilterSidebar: () => void;
  setFilterSidebarOpen: (v: boolean) => void;
  setDetailsPanelOpen: (v: boolean) => void;
  setWarningsPanelOpen: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setActiveDetailsTab: (tab: UIState['activeDetailsTab']) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  isFilterSidebarOpen: true,
  isDetailsPanelOpen: false,
  isWarningsPanelOpen: false,
  isCommandPaletteOpen: false,
  activeDetailsTab: 'overview',

  toggleFilterSidebar: () =>
    set((s) => ({ isFilterSidebarOpen: !s.isFilterSidebarOpen })),
  setFilterSidebarOpen: (v) => set({ isFilterSidebarOpen: v }),
  setDetailsPanelOpen: (v) => set({ isDetailsPanelOpen: v }),
  setWarningsPanelOpen: (v) => set({ isWarningsPanelOpen: v }),
  setCommandPaletteOpen: (v) => set({ isCommandPaletteOpen: v }),
  setActiveDetailsTab: (tab) => set({ activeDetailsTab: tab }),
}));
