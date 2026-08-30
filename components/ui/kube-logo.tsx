'use client';

import { cn } from '@/lib/utils';

interface KubeLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function KubeLogo({ size = 'md', className }: KubeLogoProps) {
  const sizes = {
    xs: 'h-3.5 w-3.5',
    sm: 'h-5 w-5',
    md: 'h-9 w-9',
    lg: 'h-16 w-16',
  };

  return (
    <div className={cn('relative rounded-full border border-primary/50 bg-primary/10 shadow-lg shadow-primary/15', sizes[size], className)} aria-label="Klystr loading">
      <svg viewBox="0 0 24 24" className="h-full w-full text-primary" fill="none" stroke="currentColor" strokeWidth={1.4}>
        <circle cx="12" cy="12" r="7.5" className="opacity-60" />
        <circle cx="12" cy="12" r="3" className="fill-primary/30" />
        <g className="kube-logo-orbit">
          <circle cx="19.5" cy="12" r="1.8" className="fill-primary stroke-primary" />
        </g>
      </svg>
    </div>
  );
}
