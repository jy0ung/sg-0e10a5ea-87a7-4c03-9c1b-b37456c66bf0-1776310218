import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { Badge } from './badge';
import { cn } from './lib/utils';

export type FilterBarVariant = 'collapsible' | 'compact';

export interface FilterBarProps {
  title: string;
  description?: string;
  countLabel?: string;
  defaultOpen?: boolean;
  variant?: FilterBarVariant;
  children: ReactNode;
  className?: string;
}

export function FilterBar({
  title,
  description,
  countLabel,
  defaultOpen = true,
  variant = 'collapsible',
  children,
  className,
}: FilterBarProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (variant === 'compact') {
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
          {countLabel && (
            <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums">
              {countLabel}
            </span>
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border bg-card shadow-sm', className)}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-none">{title}</p>
            {description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {countLabel && (
            <Badge variant="secondary" className="text-xs font-normal">
              {countLabel}
            </Badge>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}
