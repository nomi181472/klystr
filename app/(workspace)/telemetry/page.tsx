import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = {
  title: 'Telemetry — Klystr',
  description: 'Kubernetes telemetry and observability workspace.',
};

export default function TelemetryPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={<Activity />}
        title="Telemetry coming soon"
        description="Cluster metrics, traces, and observability insights will be available here."
        className="w-full max-w-xl"
      />
    </div>
  );
}
