'use client';

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import { KubeLogo } from '@/components/ui/kube-logo';
import { MobileAdvisory } from '@/components/layout/MobileAdvisory';
import { Loader2 } from 'lucide-react';

interface MobileGateProps {
  children: React.ReactNode;
}

const DESKTOP_MIN_WIDTH = 1024;

function subscribeToResize(callback: () => void) {
  window.addEventListener('resize', callback);
  window.addEventListener('orientationchange', callback);
  return () => {
    window.removeEventListener('resize', callback);
    window.removeEventListener('orientationchange', callback);
  };
}

function getViewportWidth(): number {
  return window.innerWidth;
}

function getServerViewportWidth(): number {
  return 1280;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function MobileGate({ children }: MobileGateProps) {
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const windowWidth = useSyncExternalStore(
    subscribeToResize,
    getViewportWidth,
    getServerViewportWidth
  );

  const [localBypassed, setLocalBypassed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem('klystr_mobile_bypass') === 'true';
    } catch {
      return false;
    }
  });

  const [scanCompleted, setScanCompleted] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(15);
  const [diagnosticStep, setDiagnosticStep] = useState(0);

  const isMobileViewport = windowWidth < DESKTOP_MIN_WIDTH || (isMobileUserAgent() && windowWidth < DESKTOP_MIN_WIDTH);

  // Run the diagnostic loading sequence when mobile is active and scan has not completed
  useEffect(() => {
    if (!isMobileViewport || localBypassed || scanCompleted) {
      return;
    }

    const t0 = setTimeout(() => {
      setLoadingProgress(35);
      setDiagnosticStep(1);
    }, 450);

    const t1 = setTimeout(() => {
      setLoadingProgress(70);
      setDiagnosticStep(2);
    }, 950);

    const t2 = setTimeout(() => {
      setLoadingProgress(100);
      setDiagnosticStep(3);
    }, 1450);

    const t3 = setTimeout(() => {
      setScanCompleted(true);
    }, 1850);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isMobileViewport, localBypassed, scanCompleted]);

  const handleBypass = useCallback(() => {
    try {
      sessionStorage.setItem('klystr_mobile_bypass', 'true');
    } catch {
      // ignore storage restriction
    }
    setLocalBypassed(true);
  }, []);

  const handleRecheck = useCallback(() => {
    setLoadingProgress(15);
    setDiagnosticStep(0);
    setScanCompleted(false);
  }, []);

  // SSR initial render: keep desktop shell clean, hide from mobile viewports via CSS
  if (!isMounted) {
    return (
      <>
        <div className="hidden lg:block h-full w-full">{children}</div>
        <div className="lg:hidden min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <KubeLogo size="lg" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Verifying workstation environment...</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Desktop or user bypassed gate: render full application
  if (!isMobileViewport || localBypassed) {
    return <>{children}</>;
  }

  // Mobile detected: Step 1 - Show High-Tech Diagnostic Loading
  if (!scanCompleted) {
    const diagnosticMessages = [
      'Scanning display geometry & spatial canvas dimensions...',
      'Evaluating client-side ELK graph layout & WebWorker threads...',
      'Assessing Kubernetes control plane mutation ergonomics...',
      'Environment evaluation complete. Preparing technical advisory...',
    ];

    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm flex flex-col items-center text-center gap-6 relative z-10">
          {/* Pulsing Kube Logo */}
          <div className="relative">
            <div className="absolute -inset-3 rounded-2xl bg-primary/20 blur-md animate-pulse" />
            <KubeLogo size="lg" className="relative z-10" />
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-[11px] font-mono text-primary uppercase tracking-wider">
              <Loader2 className="w-3 h-3 animate-spin" />
              System Capability Scan
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Initializing Klystr Workstation
            </h1>
            <p className="text-xs text-muted-foreground">
              Verifying hardware acceleration & control plane requirements
            </p>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full space-y-2">
            <div className="w-full bg-secondary/80 rounded-full h-1.5 overflow-hidden border border-border">
              <div
                className="bg-primary h-full transition-all duration-300 ease-out rounded-full shadow-xs"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
              <span>CHECKING ARCHITECTURE</span>
              <span>{loadingProgress}%</span>
            </div>
          </div>

          {/* Diagnostic Step Checklist */}
          <div className="w-full bg-card/80 border border-border/80 rounded-lg p-3 text-left font-mono text-[11px] space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Viewport Width:</span>
              <span className="text-foreground font-semibold">
                {windowWidth}px {windowWidth < DESKTOP_MIN_WIDTH ? '(Mobile)' : '(Desktop)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Layout Solver:</span>
              <span className="text-foreground">ELKjs / Worker Engine</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Required Profile:</span>
              <span className="text-foreground font-semibold">Workstation ≥ 1024px</span>
            </div>

            <div className="pt-2 border-t border-border/60 flex items-center gap-2 text-primary font-sans text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="truncate">{diagnosticMessages[diagnosticStep]}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mobile detected: Step 2 - Diplomatic, Technical & Critical Advisory Screen
  return (
    <MobileAdvisory
      onRecheck={handleRecheck}
      onBypass={handleBypass}
      detectedWidth={windowWidth}
    />
  );
}
