'use client';

import dynamic from 'next/dynamic';
import { LoadingIndicator } from '@/components/ui/loading-indicator';

/**
 * CSR loader — dynamically imports TopologyView so the ReactFlow +
 * graph engine bundle is only downloaded when the user visits /topology.
 * Must be a client component because ssr:false requires a CSR boundary.
 */
const TopologyView = dynamic(
  () => import('@/components/home/TopologyView').then(m => ({ default: m.TopologyView })),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center">
        <div className="text-center space-y-3">
          <LoadingIndicator size="lg" className="justify-center" />
          <p className="text-sm text-muted-foreground">Loading topology view…</p>
        </div>
      </div>
    ),
  }
);

export function TopologyLoader() {
  return <TopologyView />;
}
