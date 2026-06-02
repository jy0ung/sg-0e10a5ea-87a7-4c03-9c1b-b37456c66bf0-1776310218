import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorTrackingService } from '@flc/platform-services';

interface Props {
  children: ReactNode;
  /** Label used in logs + UI so it is clear which panel failed. */
  scope: string;
  /**
   * Optional key whose change resets the boundary. Set this to the id of the
   * record being shown (e.g. selected ticket id) so navigating to a different
   * row clears a stuck error and gives the user a fresh render.
   */
  resetKey?: string | number | null;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Component-level error boundary for a single panel inside a route. The
 * fallback is inline (no centered card, no full-screen takeover) so the
 * surrounding layout — list, filters, toolbar — keeps working when one panel
 * blows up.
 *
 * `resetKey` exists for the common case where the selected entity changes:
 * a stuck render error for ticket A shouldn't poison the panel forever, and
 * the user picking ticket B implicitly asks for a retry.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    errorTrackingService.captureException(error, {
      component: 'PanelErrorBoundary',
      action: 'componentDidCatch',
      additionalData: {
        scope: this.props.scope,
        componentStack: info.componentStack,
      },
    });
  }

  override componentDidUpdate(prevProps: Props) {
    if (
      this.state.hasError
      && prevProps.resetKey !== this.props.resetKey
    ) {
      this.reset();
    }
  }

  reset = () => this.setState({ hasError: false, error: null });

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            This panel hit an unexpected error.
          </p>
          <p className="text-xs text-muted-foreground">
            The rest of the page is still working. You can retry, or select a different item from the list.
          </p>
        </div>
        {this.state.error && (
          <div className="max-h-32 w-full max-w-md overflow-auto rounded-md bg-secondary p-2 text-left font-mono text-xs text-muted-foreground">
            {this.state.error.message}
          </div>
        )}
        <Button size="sm" variant="default" onClick={this.reset}>
          Try again
        </Button>
      </div>
    );
  }
}
