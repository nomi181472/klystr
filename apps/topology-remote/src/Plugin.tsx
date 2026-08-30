'use client';

import { TopologyView } from '@/components/home/TopologyView';

/** Module Federation entry point consumed by the Klystr shell. */
export default function TopologyPlugin() {
  return <TopologyView />;
}
