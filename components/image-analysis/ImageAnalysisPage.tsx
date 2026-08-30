'use client';

import { useShellSnapshot } from '@/lib/shell-sdk/runtime';
import { ImageAnalysisView } from '@/components/image-analysis/ImageAnalysisView';

/**
 * CSR wrapper — reads runtime state from stores so the /images page.tsx
 * can remain a pure server component.
 */
export function ImageAnalysisPage() {
  const { connection: connectionSettings, activeContext } = useShellSnapshot();

  return (
    <ImageAnalysisView
      key={connectionSettings.mode}
      activeContext={activeContext}
      connectionSettings={connectionSettings}
    />
  );
}
