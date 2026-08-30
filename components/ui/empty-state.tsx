import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div className={cn('flex min-h-56 items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center', className)}>
      <div className="max-w-sm">
        {icon ? <div className="mx-auto grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">{icon}</div> : null}
        <h2 className="mt-3 text-sm font-semibold text-foreground">{title}</h2>
        {description ? <div className="mt-1 text-sm leading-5 text-muted-foreground">{description}</div> : null}
        {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
