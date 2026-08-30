'use client';

import type { ConnectionSettings } from '@/lib/types';
import { ImageVerificationBadge } from '@/components/image-analysis/ImageVerificationBadge';

export default function TopologyVerificationExtension({
  identity,
  activeContext,
  connectionSettings,
}: {
  identity: string;
  activeContext: string | null;
  connectionSettings: ConnectionSettings;
}) {
  return (
    <ImageVerificationBadge
      identities={[identity]}
      activeContext={activeContext}
      connectionSettings={connectionSettings}
      compact
    />
  );
}
