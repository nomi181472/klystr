import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppProviders } from '@/components/providers/AppProviders';
import { MobileGate } from '@/components/layout/MobileGate';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Klystr — See. Understand. Operate.',
  description:
    'Overall telemetry and operational visibility across Kubernetes workloads, dependencies, and security posture.',
  icons: {
    icon: [
      { url: '/icon-light.svg', media: '(prefers-color-scheme: light)', type: 'image/svg+xml' },
      { url: '/icon-dark.svg', media: '(prefers-color-scheme: dark)', type: 'image/svg+xml' },
    ],
    apple: '/icon-dark.svg',
  },
};

/**
 * Root layout — pure server component.
 * No 'use client'. Fonts and metadata are injected at build time.
 * All client-side providers are wrapped in AppProviders (CSR boundary).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Logger default: true (enabled)
  // To disable: set LOGGER=false or LOGGER=0
  const loggerEnabled = process.env.LOGGER !== 'false' && process.env.LOGGER !== '0';
  
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `window.__KLYSTR_LOGGER_ENABLED__ = ${loggerEnabled};`,
        }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AppProviders>
          <MobileGate>
            {children}
          </MobileGate>
        </AppProviders>
      </body>
    </html>
  );
}
