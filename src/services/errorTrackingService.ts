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
  private currentUserId?: string;
  private currentEmail?: string;
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs = 50;

  init(dsn?: string) {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (dsn) {
      // Sentry integration point — when a DSN is provided, initialize Sentry here:
      // Sentry.init({ dsn, integrations: [...], tracesSampleRate: 0.2 });
      loggingService.info("Error tracking initialized with DSN", {}, "ErrorTracking");
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

    // When Sentry is integrated:
    // Sentry.captureException(error, { extra: enrichedContext, tags: { component: context?.component } });
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: ErrorContext) {
    loggingService[level](message, {
      userId: this.currentUserId,
      ...context?.additionalData,
    }, context?.component || "ErrorTracking");
  }

  setUser(userId: string, email?: string) {
    this.currentUserId = userId;
    this.currentEmail = email;
    // Sentry.setUser({ id: userId, email });
  }

  clearUser() {
    this.currentUserId = undefined;
    this.currentEmail = undefined;
    // Sentry.setUser(null);
  }

  addBreadcrumb(category: string, message: string, level: "info" | "warning" | "error" = "info") {
    this.breadcrumbs.push({ category, message, level, timestamp: new Date().toISOString() });
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  getBreadcrumbs(): readonly Breadcrumb[] {
    return this.breadcrumbs;
  }
}

export const errorTrackingService = new ErrorTrackingService();