import { Blocks } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface PluginUnavailableProps {
  label: string;
  reason?: string;
}

export function PluginUnavailable({ label, reason }: PluginUnavailableProps) {
  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <EmptyState
        className="h-full min-h-72"
        icon={<Blocks />}
        title="This page is not available"
        description={reason ?? `${label} has been registered, but its feature deployment is not available yet.`}
      />
    </div>
  );
}
