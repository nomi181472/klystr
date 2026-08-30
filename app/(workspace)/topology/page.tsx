import { TopologyLoader } from '@/components/home/TopologyLoader';
import { RegisteredPluginHost } from '@/components/plugins/RegisteredPluginHost';

export const metadata = {
  title: 'Topology — Klystr',
  description: 'Operational telemetry and dependency visibility across Kubernetes resource topology.',
};

/**
 * SSR page shell. No 'use client'.
 * TopologyLoader (CSR) owns the dynamic import + loading state.
 */
export default function TopologyPage() {
  return <RegisteredPluginHost pluginId="topology" fallback={<TopologyLoader />} />;
}
