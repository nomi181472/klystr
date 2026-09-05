'use client';

import dynamic from 'next/dynamic';
import { Activity } from 'lucide-react';

const TelemetryWorkspace = dynamic(
  () => import('./TelemetryWorkspace'),
  { 
    ssr: false, 
    loading: () => (
      <div className="flex h-full w-full flex-col items-center justify-center space-y-4 bg-white dark:bg-neutral-950">
        <Activity className="h-8 w-8 animate-pulse text-neutral-400" />
        <p className="text-sm text-neutral-500">Loading live telemetry graph...</p>
      </div>
    )
  }
);

export function TelemetryLoader() {
  return <TelemetryWorkspace />;
}
