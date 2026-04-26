import React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="glass-panel p-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface PageErrorStateProps {
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
}

function getErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function PageErrorState({
  title = 'Unable to load data',
  description = 'Retry the request. If the problem persists, sign out and sign back in.',
  error,
  onRetry,
}: PageErrorStateProps) {
  const message = getErrorMessage(error);

  return (
    <div className="glass-panel p-10 text-center" role="alert">
      <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {message ? `${description} (${message})` : description}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
