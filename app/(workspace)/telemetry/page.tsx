import { TelemetryLoader } from '@/components/telemetry/TelemetryLoader';

export const metadata = {
  title: 'Telemetry — Klystr',
  description: 'Kubernetes telemetry and observability workspace.',
};

export default function TelemetryPage() {
  return (
    <div className="h-full w-full">
      <TelemetryLoader />
    </div>
  );
}
