import { supabase } from "@/integrations/supabase/client";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  timestamp: string;
  component?: string;
}

const REDACTED = "[redacted]";
const MAX_SANITIZE_DEPTH = 5;
const SENSITIVE_KEY_FRAGMENTS = [
  "authorization",
  "cookie",
  "email",
  "icno",
  "nric",
  "password",
  "phone",
  "refresh",
  "secret",
  "session",
  "token",
  "jwt",
] as const;

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some(fragment => normalized.includes(fragment));
}

export function redactString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\b(access_token|refresh_token|token|password|secret|api_key|apikey)=([^\s&]+)/gi, `$1=${REDACTED}`);
}

function sanitizeLogValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_SANITIZE_DEPTH) return "[truncated]";

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    const enriched = value as Error & { code?: unknown; status?: unknown; details?: unknown; hint?: unknown };
    return {
      name: enriched.name,
      message: redactString(enriched.message),
      code: sanitizeLogValue(enriched.code, depth + 1, seen),
      status: sanitizeLogValue(enriched.status, depth + 1, seen),
      details: sanitizeLogValue(enriched.details, depth + 1, seen),
      hint: sanitizeLogValue(enriched.hint, depth + 1, seen),
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogValue(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? REDACTED : sanitizeLogValue(nestedValue, depth + 1, seen),
    ]),
  );
}

export function sanitizeLogContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return sanitizeLogValue(context) as Record<string, unknown>;
}

class LoggingService {
  private logLevel: LogLevel = "info";
  private logs: LogEntry[] = [];
  private maxLogs = 100;
  private isDevelopment = import.meta.env.DEV;
  private currentUserId?: string;

  constructor() {
    if (import.meta.env.PROD) {
      this.logLevel = "info";
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private async persistLog(entry: LogEntry) {
    // Only persist authenticated production logs; unauthenticated login-page
    // logs are kept client-side because RLS correctly rejects anonymous writes.
    if (!this.isDevelopment && entry.userId) {
      try {
        const { error } = await supabase.from("application_logs").insert({
          level: entry.level,
          message: entry.message,
          context: entry.context || null,
          user_id: entry.userId,
          component: entry.component || null,
          created_at: entry.timestamp,
        });
        
        if (error) {
          // Don't log errors about logging to avoid infinite loops
          console.warn("Failed to persist log to database:", error);
        }
      } catch (error) {
        console.warn("Failed to persist log:", error);
      }
    }
  }

  /** Called by AuthContext after a successful profile fetch. */
  setUserId(id: string) {
    this.currentUserId = id;
  }

  /** Called by AuthContext on logout. */
  clearUserId() {
    this.currentUserId = undefined;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    component?: string
  ): LogEntry {
    return {
      level,
      message: redactString(message),
      context: sanitizeLogContext(context),
      userId: this.currentUserId,
      timestamp: new Date().toISOString(),
      component,
    };
  }

  private addLog(entry: LogEntry) {
    if (!this.shouldLog(entry.level)) return;

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const styles = {
      info: "color: #3b82f6",
      warn: "color: #f59e0b",
      error: "color: #ef4444",
      debug: "color: #8b5cf6",
    };

    const style = styles[entry.level];
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.component ? ` [${entry.component}]` : ""}`;
    
    if (entry.context) {
      console.info(`%c${prefix} ${entry.message}`, style, entry.context);
    } else {
      console.info(`%c${prefix} ${entry.message}`, style);
    }

    this.persistLog(entry);
  }

  info(message: string, context?: Record<string, unknown>, component?: string) {
    const entry = this.createLogEntry("info", message, context, component);
    this.addLog(entry);
  }

  warn(message: string, context?: Record<string, unknown>, component?: string) {
    const entry = this.createLogEntry("warn", message, context, component);
    this.addLog(entry);
  }

  error(message: string, context?: Record<string, unknown>, component?: string) {
    const entry = this.createLogEntry("error", message, context, component);
    this.addLog(entry);
  }

  debug(message: string, context?: Record<string, unknown>, component?: string) {
    const entry = this.createLogEntry("debug", message, context, component);
    this.addLog(entry);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  logUserAction(action: string, details?: Record<string, unknown>) {
    this.info(`User action: ${action}`, details, "UserAction");
  }

  logApiCall(endpoint: string, method: string, duration?: number, error?: unknown) {
    if (error) {
      this.error(`API call failed: ${method} ${endpoint}`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
      }, "API");
    } else {
      this.info(`API call: ${method} ${endpoint}`, { duration }, "API");
    }
  }

  logDataMutation(
    table: string,
    operation: "insert" | "update" | "delete",
    recordId?: string,
    details?: Record<string, unknown>
  ) {
    this.info(`Data mutation: ${operation} on ${table}`, {
      recordId,
      ...details,
    }, "DataMutation");
  }

  logPerformance(metric: string, value: number, unit: string = "ms") {
    this.info(`Performance: ${metric}`, { value, unit }, "Performance");
  }
}

export const loggingService = new LoggingService();