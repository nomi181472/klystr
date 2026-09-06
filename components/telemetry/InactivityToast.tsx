'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InactivityNotice {
  id: string;
  podName: string;
  namespace?: string;
  ageLabel: string;
  timestamp: number;
}

interface InactivityToastProps {
  notices: InactivityNotice[];
  onDismiss: (id: string) => void;
}

export function InactivityToastStack({ notices, onDismiss }: InactivityToastProps) {
  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-full">
      {notices.slice(-4).map(notice => (
        <ToastItem key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ notice, onDismiss }: { notice: InactivityNotice; onDismiss: (id: string) => void }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const duration = 4500;
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress(p => {
        if (p <= step) {
          clearInterval(timer);
          onDismiss(notice.id);
          return 0;
        }
        return p - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [notice.id, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-lg border border-amber-500/30 bg-card/95 p-3 shadow-xl backdrop-blur-md transition-all duration-200",
        "animate-in fade-in slide-in-from-top-2"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30">
          <WifiOff className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              Disappearing node
            </span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400 font-mono">
              no traffic
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate" title={notice.podName}>
            Node <span className="font-semibold text-foreground font-mono">{notice.podName}</span> hidden due to no traffic ({notice.ageLabel})
          </p>
        </div>
        <button
          onClick={() => onDismiss(notice.id)}
          className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
          title="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expiration progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
        <div
          className="h-full bg-amber-500 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
