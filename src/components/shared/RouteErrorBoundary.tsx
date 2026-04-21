import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { loggingService } from '@/services/loggingService';

interface Props {
  children: ReactNode;
  /** Optional label used in logs + UI so it is clear which route failed. */
  scope?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Phase 3 #19: nested, per-route error boundary.
 *
 * Unlike the root-level `ErrorBoundary`, this renders an inline card inside the
 * module layout so the rest of the app (sidebar, header, toasts) keeps working
 * when a single route crashes.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    loggingService.error(
      'RouteErrorBoundary caught error',
      {
        scope: this.props.scope ?? 'unknown',
        error: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      },
      'RouteErrorBoundary',
    );
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">
                This page failed to load{this.props.scope ? ` (${this.props.scope})` : ''}
              </CardTitle>
            </div>
            <CardDescription>
              Something went wrong rendering this route. You can retry or go back; the rest of the app is still working.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {this.state.error && (
              <div className="bg-secondary p-3 rounded-md text-sm text-muted-foreground font-mono overflow-auto max-h-40">
                {this.state.error.message}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="default" onClick={this.reset}>Try again</Button>
              <Button variant="outline" onClick={() => window.history.back()}>Go back</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
