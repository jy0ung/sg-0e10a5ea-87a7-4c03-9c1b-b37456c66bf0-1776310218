import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { errorTrackingService } from "@/services/errorTrackingService";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    errorTrackingService.captureException(error, {
      component: "ErrorBoundary",
      action: "componentDidCatch",
      additionalData: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-background text-foreground p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle className="text-destructive">Something went wrong</CardTitle>
              </div>
              <CardDescription>
                The application encountered an unexpected error. Please try refreshing the page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {this.state.error && (
                <div className="bg-secondary p-3 rounded-md text-sm text-muted-foreground font-mono overflow-auto max-h-32">
                  {this.state.error.message}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button 
                variant="default" 
                onClick={() => window.location.reload()}
                className="flex-1"
              >
                Reload Page
              </Button>
              <Button 
                variant="outline" 
                onClick={() => this.setState({ hasError: false, error: null })}
                className="flex-1"
              >
                Try Again
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}