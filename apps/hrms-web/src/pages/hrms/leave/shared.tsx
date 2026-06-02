import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { LeaveRequest } from '@/types';
import { formatDays, fmtDateRange, getStatusConfig } from './utils';

// ── StatusBadge ─────────────────────────────────────────────────────────────

export function StatusBadge({ req }: { req: LeaveRequest }) {
  const { label, stage, className, stageClassName } = getStatusConfig(req);
  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5">
      <Badge variant="outline" className={`shrink-0 text-xs font-medium ${className}`}>
        {label}
      </Badge>
      {stage && (
        <span className={`hidden max-w-32 truncate text-right text-xs sm:block ${stageClassName}`}>
          {stage}
        </span>
      )}
    </div>
  );
}

// ── RequestCard ──────────────────────────────────────────────────────────────

export function RequestCard({
  req,
  onSelect,
}: {
  req: LeaveRequest;
  onSelect: (r: LeaveRequest) => void;
}) {
  const { label, stage, className, stageClassName } = getStatusConfig(req);
  const accentColor =
    req.status === 'pending'
      ? 'border-l-amber-400'
      : req.status === 'approved'
        ? 'border-l-emerald-500'
        : req.status === 'rejected'
          ? 'border-l-red-400'
          : 'border-l-border';

  return (
    <button type="button" className="w-full text-left" onClick={() => onSelect(req)}>
      <div
        className={[
          'grid gap-2 rounded-md border border-l-4 bg-card px-2.5 py-2 transition-colors hover:bg-accent/25 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
          accentColor,
        ].join(' ')}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="truncate text-sm font-medium leading-tight">{req.leaveTypeName ?? 'Leave'}</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDays(req.days)} day{req.days !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {fmtDateRange(req.startDate, req.endDate)}
          </p>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
          {stage ? (
            <span className={`min-w-0 truncate text-xs ${stageClassName}`}>{stage}</span>
          ) : (
            <span className="text-xs text-muted-foreground">No approval updates</span>
          )}
          <Badge variant="outline" className={`shrink-0 text-[11px] font-medium ${className}`}>
            {label}
          </Badge>
        </div>
      </div>
    </button>
  );
}

// ── SectionHeading ───────────────────────────────────────────────────────────

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
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {count != null && count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${colorClass ?? 'bg-muted text-muted-foreground'}`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

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
    <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
      {icon ?? <span className="text-base opacity-40">—</span>}
      <span>{title}</span>
      {action && <span className="ml-1">{action}</span>}
    </div>
  );
}

// ── LoadingSkeleton ──────────────────────────────────────────────────────────

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-md border bg-muted/30" />
      ))}
    </div>
  );
}

// ── InlineAlert ──────────────────────────────────────────────────────────────

export function InlineAlert({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-blue-200 bg-blue-50/50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300',
    warning:
      'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400',
    error:
      'border-red-200 bg-red-50/60 text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400',
  };
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${styles[variant]}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
