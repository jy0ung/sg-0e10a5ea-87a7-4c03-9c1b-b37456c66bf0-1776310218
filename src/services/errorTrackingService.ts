import * as Sentry from "@sentry/react";
import { loggingService } from "./loggingService";

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  additionalData?: Record<string, unknown>;
}

interface Breadcrumb {
  category: string;
  message: string;
  level: "info" | "warning" | "error";
  timestamp: string;
}

class ErrorTrackingService {
  private isInitialized = false;
  private hasSentry = false;
  private currentUserId?: string;
  private currentEmail?: string;
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs = 50;

  init(dsn?: string) {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (dsn) {
      try {
        Sentry.init({
          dsn,
          // Keep traces modest — we can raise this in staging.
          tracesSampleRate: 0.1,
          // Error replay is disabled by default to avoid PII leakage until
          // we have a reviewed privacy config.
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          environment: import.meta.env.VITE_APP_ENV ?? "development",
          release: import.meta.env.VITE_APP_RELEASE,
          // Drop common noise.
          ignoreErrors: [
            "ResizeObserver loop limit exceeded",
            "ResizeObserver loop completed with undelivered notifications",
            "Non-Error promise rejection captured",
          ],
        });
        this.hasSentry = true;
        loggingService.info("Error tracking initialized with Sentry", {}, "ErrorTracking");
      } catch (err) {
        loggingService.error(
          "Failed to initialize Sentry — falling back to local-only tracking",
          { error: (err as Error).message },
          "ErrorTracking",
        );
      }
    } else {
      loggingService.info("Error tracking running in local-only mode (no DSN)", {}, "ErrorTracking");
    }
  }

  captureException(error: Error, context?: ErrorContext) {
    const enrichedContext = {
      stack: error.stack,
      userId: this.currentUserId,
      breadcrumbs: this.breadcrumbs.slice(-10),
      ...context?.additionalData,
    };

    loggingService.error(error.message, enrichedContext, context?.component || "ErrorBoundary");

    if (this.hasSentry) {
      Sentry.captureException(error, {
        extra: enrichedContext,
        tags: {
          component: context?.component ?? "unknown",
          action: context?.action ?? "unknown",
        },
      });
    }
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: ErrorContext) {
    loggingService[level](message, {
      userId: this.currentUserId,
      ...context?.additionalData,
    }, context?.component || "ErrorTracking");

    if (this.hasSentry) {
      Sentry.captureMessage(message, level === "warning" ? "warning" : level);
    }
  }

  setUser(userId: string, email?: string) {
    this.currentUserId = userId;
    this.currentEmail = email;
    if (this.hasSentry) {
      Sentry.setUser({ id: userId, email });
    }
  }

  clearUser() {
    this.currentUserId = undefined;
    this.currentEmail = undefined;
    if (this.hasSentry) {
      Sentry.setUser(null);
    }
  }

  addBreadcrumb(category: string, message: string, level: "info" | "warning" | "error" = "info") {
    this.breadcrumbs.push({ category, message, level, timestamp: new Date().toISOString() });
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
    if (this.hasSentry) {
      Sentry.addBreadcrumb({ category, message, level });
    }
  }

  getBreadcrumbs(): readonly Breadcrumb[] {
    return this.breadcrumbs;
  }
}

export const errorTrackingService = new ErrorTrackingService();