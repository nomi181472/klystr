'use client';

import { useShellSnapshot } from '@/lib/shell-sdk/runtime';
import { SecurityWorkspace } from '@/components/security/SecurityWorkspace';

/**
 * CSR wrapper — reads runtime state from stores so the /security page.tsx
 * can remain a pure server component.
 */
export function SecurityPage() {
  const { connection: connectionSettings, activeContext } = useShellSnapshot();

  return (
    <SecurityWorkspace
      key={connectionSettings.mode}
      activeContext={activeContext}
      connectionSettings={connectionSettings}
    />
  );
}
