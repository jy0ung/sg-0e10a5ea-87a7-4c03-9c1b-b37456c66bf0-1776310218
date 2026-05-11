import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; path?: string }[];
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="mb-4 rounded-lg border bg-card px-4 py-3 shadow-sm">
      {breadcrumbs && (
        <nav aria-label="breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {breadcrumbs.map((bc, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 text-border" />}
              {bc.path ? (
                <Link
                  to={bc.path}
                  className="hover:text-foreground transition-colors"
                >
                  {bc.label}
                </Link>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>
                  {bc.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
