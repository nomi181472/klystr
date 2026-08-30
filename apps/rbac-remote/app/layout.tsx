import type { ReactNode } from 'react';
import { AppProviders } from '@/components/providers/AppProviders';
import '@/app/globals.css';
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en" className="dark h-full"><body className="h-full bg-background text-foreground"><AppProviders>{children}</AppProviders></body></html>; }
