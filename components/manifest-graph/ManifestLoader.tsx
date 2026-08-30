'use client';

import dynamic from 'next/dynamic';
import { LoadingIndicator } from '@/components/ui/loading-indicator';

/**
 * CSR loader — dynamically imports ManifestGraphWorkspace so the manifest
 * graph engine bundle is only downloaded when the user visits /manifests.
 */
const ManifestGraphWorkspace = dynamic(
  () => import('@/components/manifest-graph/ManifestGraphWorkspace').then(m => ({ default: m.ManifestGraphWorkspace })),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center">
        <div className="text-center space-y-3">
          <LoadingIndicator size="lg" className="justify-center" />
          <p className="text-sm text-muted-foreground">Loading manifest workspace…</p>
        </div>
      </div>
    ),
  }
);

export function ManifestLoader() {
  return <ManifestGraphWorkspace />;
}
