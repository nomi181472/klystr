import { SecurityLoader } from '@/components/security/SecurityLoader';
import { RegisteredPluginHost } from '@/components/plugins/RegisteredPluginHost';

export const metadata = {
  title: 'Security — Klystr',
  description: 'Telemetry for Kubernetes security posture, exposure, and risk context.',
};

/**
 * SSR page shell. No 'use client'.
 * SecurityLoader (CSR) owns the dynamic import + loading state.
 */
export default function SecurityRoute() {
  return (
    <div className="security-workspace h-full">
      <RegisteredPluginHost pluginId="security" fallback={<SecurityLoader />} />
    </div>
  );
}
