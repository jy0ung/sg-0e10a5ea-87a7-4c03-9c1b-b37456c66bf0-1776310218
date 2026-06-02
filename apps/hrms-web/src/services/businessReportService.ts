// Re-export shim — implementation lives in @flc/platform-services.
// Kept so existing '@/services/businessReportService' import paths continue to work.
export { REPORT_PAGE_SIZE, REPORT_EXPORT_CAP, REPORTS } from '@flc/platform-services';
export type { ReportRow, ReportConfig } from '@flc/platform-services';
