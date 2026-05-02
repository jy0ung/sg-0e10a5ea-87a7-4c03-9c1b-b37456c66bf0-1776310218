/**
 * @deprecated Use domain-specific services from `@/services/hrms/` directly.
 * This barrel re-exports everything for backward compatibility.
 *
 * Domain services:
 *   employeeService   — src/services/hrms/employeeService.ts
 *   leaveService      — src/services/hrms/leaveService.ts
 *   attendanceService — src/services/hrms/attendanceService.ts
 *   payrollService    — src/services/hrms/payrollService.ts
 *   appraisalService  — src/services/hrms/appraisalService.ts
 *   announcementService — src/services/hrms/announcementService.ts
 */
export * from './hrms/employeeService';
export * from './hrms/leaveService';
export * from './hrms/attendanceService';
export * from './hrms/payrollService';
export * from './hrms/appraisalService';
export * from './hrms/announcementService';
