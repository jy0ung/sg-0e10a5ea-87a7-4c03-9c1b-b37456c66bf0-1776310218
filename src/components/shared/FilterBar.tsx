import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  title: string;
  description?: string;
  countLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible filter panel used by HRMS data pages.
 * Wraps filter controls with a toggle header showing title, description, and record count.
 */
export function FilterBar({
  title,
  description,
  countLabel,
  defaultOpen = true,
  children,
  className,
}: FilterBarProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-xl border bg-card shadow-sm', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none truncate">{title}</p>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
