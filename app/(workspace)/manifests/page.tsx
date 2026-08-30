import { ManifestLoader } from '@/components/manifest-graph/ManifestLoader';
import { RegisteredPluginHost } from '@/components/plugins/RegisteredPluginHost';

export const metadata = {
  title: 'Manifests — Klystr',
  description: 'Telemetered manifest view for drift, relationships, and deployment intent.',
};

/**
 * SSR page shell. No 'use client'.
 * ManifestLoader (CSR) owns the dynamic import + loading state.
 */
export default function ManifestsRoute() {
  return (
    <div className="h-full">
      <RegisteredPluginHost pluginId="manifests" fallback={<ManifestLoader />} />
    </div>
  );
}
