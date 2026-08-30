'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ShellSdkBridge } from '@/components/providers/ShellSdkBridge';

/**
 * Single CSR boundary that wraps all client-side context providers.
 * Imported by the root layout (SSR) so the layout itself needs no 'use client'.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryProvider>
        <ShellSdkBridge />
        <TooltipProvider delay={200}>
          {children}
        </TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
