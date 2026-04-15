import * as Sentry from "@sentry/browser";
import { loggingService } from "./loggingService";

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  additionalData?: Record<string, unknown>;
}

class ErrorTrackingService {
  private isInitialized = false;

  init(dsn?: string) {
    if (this.isInitialized) return;

    if (dsn) {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        beforeSend(event, hint) {
          if (import.meta.env.DEV) {
            return null;
          }
          return event;
        },
      });
      this.isInitialized = true;
      loggingService.info("Sentry initialized", { environment: import.meta.env.MODE }, "ErrorTracking");
    }
  }

  captureException(error: Error, context?: ErrorContext) {
    loggingService.error(error.message, {
      stack: error.stack,
      ...context?.additionalData,
    }, context?.component || "ErrorBoundary");

    if (this.isInitialized && !import.meta.env.DEV) {
      Sentry.withScope((scope) => {
        if (context?.component) {
          scope.setTag("component", context.component);
        }
        if (context?.action) {
          scope.setTag("action", context.action);
        }
        if (context?.userId) {
          scope.setUser({ id: context.userId });
        }
        if (context?.additionalData) {
          scope.setContext("additional", context.additionalData);
        }
        Sentry.captureException(error);
      });
    }
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: ErrorContext) {
    loggingService[level](message, context?.additionalData, context?.component || "ErrorTracking");

    if (this.isInitialized && !import.meta.env.DEV) {
      Sentry.withScope((scope) => {
        if (context?.component) {
          scope.setTag("component", context.component);
        }
        if (context?.userId) {
          scope.setUser({ id: context.userId });
        }
        Sentry.captureMessage(message, level);
      });
    }
  }

  setUser(userId: string, email?: string) {
    if (this.isInitialized) {
      Sentry.setUser({ id: userId, email });
    }
  }

  clearUser() {
    if (this.isInitialized) {
      Sentry.setUser(null);
    }
  }

  addBreadcrumb(category: string, message: string, level?: "info" | "warning" | "error") {
    if (this.isInitialized) {
      Sentry.addBreadcrumb({
        category,
        message,
        level,
        timestamp: Date.now() / 1000,
      });
    }
  }
}

export const errorTrackingService = new ErrorTrackingService();