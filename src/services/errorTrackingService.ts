import { loggingService } from "./loggingService";

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  additionalData?: Record<string, unknown>;
}

class ErrorTrackingService {
  private isInitialized = false;

  init(_dsn?: string) {
    // Error tracking disabled - Sentry not installed
    if (!this.isInitialized) {
      loggingService.info("Error tracking disabled", {}, "ErrorTracking");
      this.isInitialized = true;
    }
  }

  captureException(error: Error, context?: ErrorContext) {
    loggingService.error(error.message, {
      stack: error.stack,
      ...context?.additionalData,
    }, context?.component || "ErrorBoundary");
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: ErrorContext) {
    loggingService[level](message, context?.additionalData, context?.component || "ErrorTracking");
  }

  setUser(_userId: string, _email?: string) {
    // No-op - Sentry not installed
  }

  clearUser() {
    // No-op - Sentry not installed
  }

  addBreadcrumb(_category: string, _message: string, _level?: "info" | "warning" | "error") {
    // No-op - Sentry not installed
  }
}

export const errorTrackingService = new ErrorTrackingService();