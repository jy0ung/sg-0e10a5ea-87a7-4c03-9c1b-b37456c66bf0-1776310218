import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { LeaveRequest } from '@/types';
import { getStatusConfig } from './utils';

export function StatusBadge({ req }: { req: LeaveRequest }) {
  const { label, stage, className, stageClassName } = getStatusConfig(req);
  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5">
      <Badge variant="outline" className={`shrink-0 text-xs font-medium ${className}`}>{label}</Badge>
      {stage && (
        <span className={`hidden max-w-32 truncate text-right text-xs sm:block ${stageClassName}`}>
          {stage}
        </span>
      )}
    </div>
  );
}

export function SectionHeading({
  title,
  count,
  colorClass,
}: {
  title: string;
  count?: number;
  colorClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {count != null && count > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${colorClass ?? 'bg-muted text-muted-foreground'}`}>
          {count}
        </span>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
      {icon ?? <span className="text-base">📋</span>}
      <span>{title}</span>
      {action && <span className="ml-1">{action}</span>}
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/30" />
      ))}
    </div>
  );
}

export function InlineAlert({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-blue-200 bg-blue-50/50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300',
    warning: 'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400',
    error: 'border-red-200 bg-red-50/60 text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400',
  };
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${styles[variant]}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
