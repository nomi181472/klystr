import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type SemanticStatus =
  | 'healthy'
  | 'running'
  | 'ready'
  | 'active'
  | 'bound'
  | 'available'
  | 'pass'
  | 'pending'
  | 'warning'
  | 'failed'
  | 'critical'
  | 'fail'
  | 'error'
  | 'unknown'
  | 'disabled'
  | 'stopped'
  | 'info'
  | 'unverified';

const toneMap: Record<SemanticStatus, StatusTone> = {
  healthy: 'success',
  running: 'success',
  ready: 'success',
  active: 'success',
  bound: 'success',
  available: 'success',
  pass: 'success',
  pending: 'warning',
  warning: 'warning',
  failed: 'danger',
  critical: 'danger',
  fail: 'danger',
  error: 'danger',
  unknown: 'neutral',
  disabled: 'neutral',
  stopped: 'neutral',
  info: 'info',
  unverified: 'warning',
};

const tones: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted/40 text-muted-foreground',
  info: 'border-info/30 bg-info/10 text-info',
  success: 'border-success/30 bg-success/10 text-success-foreground',
  warning: 'border-warning/35 bg-warning/10 text-warning-foreground',
  danger: 'border-destructive/35 bg-destructive/10 text-destructive-foreground',
};

const dotColors: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
};

interface StatusBadgeProps {
  status?: SemanticStatus | string;
  tone?: StatusTone;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StatusBadge({ status, tone, dot = false, children, className }: StatusBadgeProps) {
  const resolvedTone: StatusTone =
    tone ?? (status && status.toLowerCase() in toneMap ? toneMap[status.toLowerCase() as SemanticStatus] : 'neutral');
  const content = children ?? status;

  return (
    <Badge variant="outline" className={cn('gap-1.5 capitalize', tones[resolvedTone], className)}>
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dotColors[resolvedTone])} />}
      {content}
    </Badge>
  );
}

