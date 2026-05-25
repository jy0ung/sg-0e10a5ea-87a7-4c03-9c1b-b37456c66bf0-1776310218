import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  published: 'bg-success/15 text-success',
  published_with_review: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  active: 'bg-success/15 text-success',
  inactive: 'bg-muted text-muted-foreground',
  resigned: 'bg-muted text-muted-foreground',
  pending: 'bg-warning/15 text-warning',
  portal_only: 'bg-primary/15 text-primary',
  validated: 'bg-info/15 text-info',
  validating: 'bg-info/15 text-info',
  review_pending: 'bg-warning/15 text-warning',
  review_in_progress: 'bg-primary/15 text-primary',
  review_complete: 'bg-success/15 text-success',
  uploaded: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/15 text-destructive',
  error: 'bg-destructive/15 text-destructive',
  warning: 'bg-warning/15 text-warning',
  normalization_in_progress: 'bg-info/15 text-info',
  normalization_complete: 'bg-info/15 text-info',
  publish_in_progress: 'bg-primary/15 text-primary',
  coming_soon: 'bg-primary/15 text-primary',
  planned: 'bg-muted text-muted-foreground',
  missing: 'bg-warning/15 text-warning',
  negative: 'bg-destructive/15 text-destructive',
  duplicate: 'bg-muted text-muted-foreground',
  invalid: 'bg-destructive/15 text-destructive',
  format_error: 'bg-warning/15 text-warning',
  // Import review statuses
  in_review: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  resolved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  discarded: 'bg-red-600/15 text-red-700 dark:text-red-400',
  // Import review reasons
  incomplete: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  blocking: 'bg-red-600/15 text-red-700 dark:text-red-400',
  mixed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={cn('status-badge', style, className)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
