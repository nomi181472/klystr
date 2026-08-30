'use client';

import { cn } from '@/lib/utils';
import { KubeLogo } from '@/components/ui/kube-logo';

interface LoadingIndicatorProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export function LoadingIndicator({ size = 'md', label, className }: LoadingIndicatorProps) {
  const sizes: Record<NonNullable<LoadingIndicatorProps['size']>, 'xs' | 'sm' | 'md' | 'lg'> = {
    xs: 'xs',
    sm: 'sm',
    md: 'md',
    lg: 'lg',
  };

  return (
    <div className={cn('flex items-center gap-3', className)} role="status" aria-label={label ?? 'Loading'}>
      <KubeLogo size={sizes[size]} />
      {label && <span className="app-muted text-sm">{label}</span>}
    </div>
  );
}
