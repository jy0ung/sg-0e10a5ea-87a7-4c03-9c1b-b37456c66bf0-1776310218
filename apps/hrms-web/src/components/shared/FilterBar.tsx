import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  /** Short title for the filter panel (e.g. "Attendance filters"). */
  title: string;
  /** Optional one-line description shown below the title. */
  description?: string;
  /** Badge text shown on the right (e.g. "42 records", "3 visible"). */
  countLabel: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Lean shared filter-panel shell.
 *
 * Renders a card with a standard header row (icon chip + title/description +
 * count badge) and slots `children` below for the actual controls.
 * Replaces the copy-pasted filter-panel header pattern across Approval Inbox,
 * Leave Calendar, and Attendance Log.
 */
export function FilterBar({ title, description, countLabel, children, className }: FilterBarProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-3 shadow-sm', className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
            {description && (
              <p className="text-xs leading-tight text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums">
          {countLabel}
        </span>
      </div>
      {children}
    </div>
  );
}
