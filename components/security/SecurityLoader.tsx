'use client';

import dynamic from 'next/dynamic';
import { LoadingIndicator } from '@/components/ui/loading-indicator';

/**
 * CSR loader — dynamically imports SecurityPage so the security workspace
 * bundle is only downloaded when the user visits /security.
 */
const SecurityPage = dynamic(
  () => import('@/components/security/SecurityPage').then(m => ({ default: m.SecurityPage })),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center">
        <div className="text-center space-y-3">
          <LoadingIndicator size="lg" className="justify-center" />
          <p className="text-sm text-muted-foreground">Loading security workspace…</p>
        </div>
      </div>
    ),
  }
);

export function SecurityLoader() {
  return <SecurityPage />;
}
