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
    <div className="mb-6">
      {breadcrumbs && (
        <nav aria-label="breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground mb-2 flex-wrap">
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
