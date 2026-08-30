import { RbacPage } from '@/components/rbac/RbacPage';
import { RegisteredPluginHost } from '@/components/plugins/RegisteredPluginHost';

export const metadata = {
  title: 'RBAC — Klystr',
  description: 'Operational visibility into Kubernetes identity, permissions, and access boundaries.',
};

/**
 * SSR page shell. No 'use client'.
 * All interactivity lives inside RbacPage (CSR).
 */
export default function RbacRoute() {
  return (
    <div className="h-full">
      <RegisteredPluginHost pluginId="rbac" fallback={<RbacPage />} />
    </div>
  );
}
