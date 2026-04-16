import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  timestamp: string;
  component?: string;
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
    // Only persist logs in production
    if (!this.isDevelopment) {
      try {
        const { error } = await supabase.from("application_logs").insert({
          level: entry.level,
          message: entry.message,
          context: entry.context || null,
          user_id: entry.userId || null,
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
      message,
      context,
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
      console.log(`%c${prefix} ${entry.message}`, style, entry.context);
    } else {
      console.log(`%c${prefix} ${entry.message}`, style);
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