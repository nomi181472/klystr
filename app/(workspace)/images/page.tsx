import { ImageAnalysisPage } from '@/components/image-analysis/ImageAnalysisPage';
import { RegisteredPluginHost } from '@/components/plugins/RegisteredPluginHost';

export const metadata = {
  title: 'Image Analysis — Klystr',
  description: 'Operational telemetry for container image risk, inventory, and runtime posture.',
};

/**
 * SSR page shell. No 'use client'.
 * All interactivity lives inside ImageAnalysisPage (CSR).
 */
export default function ImagesRoute() {
  return (
    <div className="h-full">
      <RegisteredPluginHost pluginId="images" fallback={<ImageAnalysisPage />} />
    </div>
  );
}
