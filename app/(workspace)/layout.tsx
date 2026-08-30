import type { ReactNode } from 'react';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { WorkspaceNav } from '@/components/layout/WorkspaceNav';

/**
 * SSR shell shared by all workspace pages (/topology, /rbac, /images, /manifests, /security).
 * No 'use client' — this is a pure server component.
 * WorkspaceHeader and WorkspaceNav are CSR and bring their own interactivity.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden">
      <WorkspaceHeader />
      <WorkspaceNav />
      <main className="min-h-0 flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
