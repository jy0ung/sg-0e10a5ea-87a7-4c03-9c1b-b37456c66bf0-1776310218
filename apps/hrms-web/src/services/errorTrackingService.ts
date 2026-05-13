import * as Sentry from "@sentry/react";
import { loggingService, redactString, sanitizeLogContext } from "./loggingService";

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  additionalData?: Record<string, unknown>;
}

interface ErrorTrackingInitOptions {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
}

interface Breadcrumb {
  category: string;
  message: string;
  level: "info" | "warning" | "error";
  timestamp: string;
}

function createSanitizedError(error: Error): Error {
  const sanitized = new Error(redactString(error.message));
  sanitized.name = error.name;
  if (error.stack) {
    sanitized.stack = redactString(error.stack);
  }
  return sanitized;
}

function normalizeDsn(dsn?: string): string | undefined {
  const value = dsn?.trim();
  return value ? value : undefined;
}

function normalizeSampleRate(value: number | undefined): number {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.1;
}

export class ErrorTrackingService {
  private isInitialized = false;
  private hasSentry = false;
  private currentUserId?: string;
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs = 50;

  init(options: ErrorTrackingInitOptions | string = {}) {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const config = typeof options === "string" ? { dsn: options } : options;
    const dsn = normalizeDsn(config.dsn);

    if (dsn) {
      try {
        Sentry.init({
          dsn,
          integrations: [Sentry.browserTracingIntegration()],
          tracesSampleRate: normalizeSampleRate(config.tracesSampleRate),
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          environment: config.environment ?? "development",
          release: config.release,
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
          "Failed to initialize Sentry - falling back to local-only tracking",
          { error: (err as Error).message },
          "ErrorTracking",
        );
      }
    } else {
      loggingService.info("Error tracking running in local-only mode (no DSN)", {}, "ErrorTracking");
    }
  }

  captureException(error: Error, context?: ErrorContext) {
    const enrichedContext = sanitizeLogContext({
      stack: error.stack,
      userId: context?.userId ?? this.currentUserId,
      breadcrumbs: this.breadcrumbs.slice(-10),
      ...context?.additionalData,
    }) ?? {};

    const tags: Record<string, string> = {
      component: context?.component ?? "unknown",
      action: context?.action ?? "unknown",
    };

    loggingService.error(error.message, enrichedContext, context?.component || "ErrorBoundary");

    if (this.hasSentry) {
      Sentry.captureException(createSanitizedError(error), {
        extra: enrichedContext,
        tags,
      });
    }
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: ErrorContext) {
    const enrichedContext = sanitizeLogContext({
      userId: context?.userId ?? this.currentUserId,
      ...context?.additionalData,
    }) ?? {};
    const logLevel = level === "warning" ? "warn" : level;

    loggingService[logLevel](message, enrichedContext, context?.component || "ErrorTracking");

    if (this.hasSentry) {
      Sentry.captureMessage(redactString(message), {
        level: level === "warning" ? "warning" : level,
        extra: enrichedContext,
        tags: {
          component: context?.component ?? "unknown",
          action: context?.action ?? "unknown",
        },
      });
    }
  }

  setUser(userId: string) {
    this.currentUserId = userId;
    if (this.hasSentry) {
      Sentry.setUser({ id: userId });
    }
  }

  clearUser() {
    this.currentUserId = undefined;
    if (this.hasSentry) {
      Sentry.setUser(null);
    }
  }

  addBreadcrumb(category: string, message: string, level: "info" | "warning" | "error" = "info") {
    const redactedMessage = redactString(message);
    this.breadcrumbs.push({ category, message: redactedMessage, level, timestamp: new Date().toISOString() });
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
    if (this.hasSentry) {
      Sentry.addBreadcrumb({ category, message: redactedMessage, level });
    }
  }

  getBreadcrumbs(): readonly Breadcrumb[] {
    return this.breadcrumbs;
  }

  /** Send a numeric measurement to Sentry (e.g. Core Web Vitals). */
  logMetric(name: string, value: number): void {
    if (this.hasSentry) {
      Sentry.setMeasurement(name, value, 'millisecond');
    }
    loggingService.logPerformance(name, value, 'ms');
  }
}

export const errorTrackingService = new ErrorTrackingService();