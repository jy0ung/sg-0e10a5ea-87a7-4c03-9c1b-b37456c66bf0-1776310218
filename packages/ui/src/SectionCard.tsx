import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from './lib/utils';

export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  /** Optional "view all" style link in the header. */
  action?: { label: string; to?: string; onClick?: () => void };
  /** Header-right slot for custom controls (toggles, filters, badges). */
  headerRight?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Titled panel with optional icon + header action. Standardizes the dozens of
 * ad-hoc `glass-panel` + heading blocks across the suite.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  headerRight,
  className,
  bodyClassName,
  children,
}: SectionCardProps) {
  const actionContent = action && (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80">
      {action.label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </span>
  );

  return (
    <section className={cn('surface-card flex flex-col', className)}>
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && (
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            {description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {headerRight ?? (action?.to
          ? <Link to={action.to} className="flex-shrink-0">{actionContent}</Link>
          : action
            ? <button type="button" onClick={action.onClick} className="flex-shrink-0">{actionContent}</button>
            : null)}
      </header>
      <div className={cn('flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
