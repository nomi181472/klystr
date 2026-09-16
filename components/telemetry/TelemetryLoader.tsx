'use client';

import dynamic from 'next/dynamic';
import { LoadingIndicator } from '@/components/ui/loading-indicator';

const TelemetryWorkspace = dynamic(
  () => import('./TelemetryWorkspace'),
  { 
    ssr: false, 
    loading: () => (
      <div className="flex h-full w-full flex-col items-center justify-center space-y-4 bg-background">
        <LoadingIndicator size="lg" label="Loading live telemetry graph…" className="flex-col gap-3" />
      </div>
    )
  }
);

export function TelemetryLoader() {
  return <TelemetryWorkspace />;
}
