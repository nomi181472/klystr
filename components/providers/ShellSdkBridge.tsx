'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getShellSdk } from '@/lib/shell-sdk/runtime';
import type { ShellCommand } from '@/lib/shell-sdk/contracts';
import { useConnectionStore } from '@/stores/connection-store';
import { useFilterStore } from '@/stores/filter-store';
import { useDiscoveryStore } from '@/stores/discovery-store';

export function ShellSdkBridge() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const sdk = getShellSdk();
    const publish = () => sdk.publish({
      connection: useConnectionStore.getState().settings,
      activeContext: useFilterStore.getState().activeContext,
      discoveredNamespaces: Object.keys(useDiscoveryStore.getState().progress),
    });

    publish();
    const unsubscribeConnection = useConnectionStore.subscribe(publish);
    const unsubscribeFilter = useFilterStore.subscribe(publish);
    const unsubscribeDiscovery = useDiscoveryStore.subscribe(publish);

    const handleCommand = (event: Event) => {
      const command = (event as CustomEvent<ShellCommand>).detail;
      if (command.type === 'topology.refresh') {
        void queryClient.invalidateQueries({ queryKey: ['topology'] });
      } else if (command.type === 'navigation.open' && command.path.startsWith('/')) {
        router.push(command.path);
      }
    };

    window.addEventListener('klystr:shell-command', handleCommand);
    return () => {
      unsubscribeConnection();
      unsubscribeFilter();
      unsubscribeDiscovery();
      window.removeEventListener('klystr:shell-command', handleCommand);
    };
  }, [queryClient, router]);

  return null;
}
