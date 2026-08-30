'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { useConnectionStore } from '@/stores/connection-store';
import { useDiscoveryStore } from '@/stores/discovery-store';
import { useFilterStore } from '@/stores/filter-store';
import { useGraphStore } from '@/stores/graph-store';
import type { ConnectionSettings, K8sContext } from '@/lib/types';

/**
 * SSR-safe wrapper around Header.
 * Self-sources all runtime data so the workspace layout stays a pure server component.
 */
export function WorkspaceHeader() {
  const queryClient = useQueryClient();

  const connectionSettings = useConnectionStore(s => s.settings);
  const settingsReady = useConnectionStore(s => s.hydrated);
  const hydrateConnection = useConnectionStore(s => s.hydrate);
  const applyConnection = useConnectionStore(s => s.apply);

  const autoRefreshInterval = useDiscoveryStore(s => s.autoRefreshInterval);
  const setAutoRefreshInterval = useDiscoveryStore(s => s.setAutoRefreshInterval);
  const warnings = useDiscoveryStore(s => s.warnings);

  const [contexts, setContexts] = useState<K8sContext[]>([]);

  // Hydrate localStorage settings once on mount
  useEffect(() => { hydrateConnection(); }, [hydrateConnection]);

  // Fetch available kube contexts once settings are ready
  useEffect(() => {
    if (!settingsReady) return;
    fetch('/api/contexts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(connectionSettings) })
      .then(res => res.json())
      .then(data => setContexts(data.contexts ?? []))
      .catch(() => setContexts([]));
  }, [connectionSettings, settingsReady]);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['topology'] });
  }, [queryClient]);

  const handleConnectionApply = useCallback(async (settings: ConnectionSettings) => {
    let appliedSettings = settings;
    if (settings.mode === 'live') {
      const response = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = await response.json() as { connection?: ConnectionSettings; error?: string };
      if (!response.ok || !payload.connection) throw new Error(payload.error ?? 'Unable to register the cluster connection.');
      appliedSettings = payload.connection;
      if (connectionSettings.connectionId && connectionSettings.connectionId !== appliedSettings.connectionId) {
        void fetch(`/api/connections?connectionId=${encodeURIComponent(connectionSettings.connectionId)}`, { method: 'DELETE' });
      }
    }
    const sourceChanged = settings.mode !== connectionSettings.mode;
    if (sourceChanged) {
      await queryClient.cancelQueries({ queryKey: ['topology', connectionSettings.mode] });
      useGraphStore.getState().clearInvestigation();
      const filters = useFilterStore.getState();
      filters.setActiveContext(null);
      // Namespace names belong to a specific data source. Carrying the demo
      // defaults (or a previous cluster's selection) into a new source can
      // produce a successfully connected but misleadingly empty topology.
      filters.setNamespaces([]);
      filters.setNamespaceSelection('all');
      // Applying the connection remounts the topology feature. Update the URL
      // synchronously so that remount cannot restore the stale namespace scope
      // before TopologyView's normal store-to-URL effect runs.
      const params = new URLSearchParams(window.location.search);
      params.delete('ns');
      params.delete('nsMode');
      const query = params.toString();
      window.history.replaceState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }
    applyConnection(appliedSettings);
    void queryClient.invalidateQueries({ queryKey: ['topology'] });
  }, [applyConnection, connectionSettings.connectionId, connectionSettings.mode, queryClient]);

  return (
    <Header
      contexts={contexts}
      onRefresh={handleRefresh}
      warningCount={warnings.length}
      warnings={warnings}
      connectionSettings={connectionSettings}
      onConnectionApply={handleConnectionApply}
      autoRefreshInterval={autoRefreshInterval}
      onAutoRefreshChange={setAutoRefreshInterval}
    />
  );
}
