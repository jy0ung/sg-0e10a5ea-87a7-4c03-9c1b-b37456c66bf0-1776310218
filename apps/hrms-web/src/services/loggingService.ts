// Re-export shim — implementation lives in @flc/platform-services.
// Kept so existing '@/services/loggingService' import paths continue to work.
export { loggingService, redactString, sanitizeLogContext } from '@flc/platform-services';
export type { LogLevel, LogEntry } from '@flc/platform-services';
