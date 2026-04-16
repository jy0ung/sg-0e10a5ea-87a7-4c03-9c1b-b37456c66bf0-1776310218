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

    // Only initialize Sentry if DSN is provided and we're not in development
    if (dsn && dsn.trim() && !import.meta.env.DEV) {
      try {
        Sentry.init({
          dsn,
          environment: import.meta.env.MODE,
          tracesSampleRate: 0.1,
          beforeSend(event) {
            // Don't send events in development
            if (import.meta.env.DEV) {
              return null;
            }
            return event;
          },
        });
        this.isInitialized = true;
        loggingService.info("Sentry initialized", { environment: import.meta.env.MODE }, "ErrorTracking");
      } catch (error) {
        console.warn("Failed to initialize Sentry:", error);
        loggingService.warn("Failed to initialize Sentry", { error }, "ErrorTracking");
      }
    } else {
      loggingService.info("Sentry disabled (no DSN or in development mode)", {}, "ErrorTracking");
    }
  }

  captureException(error: Error, context?: ErrorContext) {
    loggingService.error(error.message, {
      stack: error.stack,
      ...context?.additionalData,
    }, context?.component || "ErrorBoundary");

    if (this.isInitialized && !import.meta.env.DEV) {
      try {
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
      } catch (sentryError) {
        console.warn("Failed to capture exception in Sentry:", sentryError);
      }
    }
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: ErrorContext) {
    loggingService[level](message, context?.additionalData, context?.component || "ErrorTracking");

    if (this.isInitialized && !import.meta.env.DEV) {
      try {
        Sentry.withScope((scope) => {
          if (context?.component) {
            scope.setTag("component", context.component);
          }
          if (context?.userId) {
            scope.setUser({ id: context.userId });
          }
          Sentry.captureMessage(message, level);
        });
      } catch (sentryError) {
        console.warn("Failed to capture message in Sentry:", sentryError);
      }
    }
  }

  setUser(userId: string, email?: string) {
    if (this.isInitialized) {
      try {
        Sentry.setUser({ id: userId, email });
      } catch (error) {
        console.warn("Failed to set Sentry user:", error);
      }
    }
  }

  clearUser() {
    if (this.isInitialized) {
      try {
        Sentry.setUser(null);
      } catch (error) {
        console.warn("Failed to clear Sentry user:", error);
      }
    }
  }

  addBreadcrumb(category: string, message: string, level?: "info" | "warning" | "error") {
    if (this.isInitialized) {
      try {
        Sentry.addBreadcrumb({
          category,
          message,
          level,
          timestamp: Date.now() / 1000,
        });
      } catch (error) {
        console.warn("Failed to add Sentry breadcrumb:", error);
      }
    }
  }
}

export const errorTrackingService = new ErrorTrackingService();