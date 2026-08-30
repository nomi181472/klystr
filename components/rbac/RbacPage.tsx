'use client';

import { useShellSnapshot } from '@/lib/shell-sdk/runtime';
import { RbacView } from '@/components/rbac/RbacView';

/**
 * CSR wrapper — reads runtime state from stores so the /rbac page.tsx
 * can remain a pure server component.
 */
export function RbacPage() {
  const { connection: connectionSettings, activeContext } = useShellSnapshot();

  return (
    <RbacView
      key={connectionSettings.mode}
      activeContext={activeContext}
      connectionSettings={connectionSettings}
      namespaces={[]}
    />
  );
}
