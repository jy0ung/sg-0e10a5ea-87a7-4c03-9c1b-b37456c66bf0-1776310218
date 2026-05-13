/**
 * Centralized HRMS React Query key factories.
 *
 * Rules:
 * - All HRMS query keys must be defined here, not inline in pages.
 * - Keys are always tuples prefixed with 'hrms' so they can be bulk-invalidated.
 * - Use `as const` so TypeScript narrows the literal tuple type.
 */

// ─── Leave ────────────────────────────────────────────────────────────────────

export const leaveKeys = {
  all: (companyId: string) =>
    ['hrms', 'leave', companyId] as const,
  requests: (companyId: string, filters?: unknown) =>
    [...leaveKeys.all(companyId), 'requests', filters] as const,
  myRequests: (employeeId: string, companyId: string) =>
    ['hrms', 'leave', companyId, 'my-requests', employeeId] as const,
  balances: (employeeId: string, year: number) =>
    ['hrms', 'leave', 'balances', employeeId, year] as const,
  types: (companyId: string) =>
    ['hrms', 'leave', 'types', companyId] as const,
  holidays: (companyId: string) =>
    ['hrms', 'leave', 'holidays', companyId] as const,
  employeeInfo: (companyId: string, employeeId: string) =>
    ['hrms', 'leave', 'employee-info', companyId, employeeId] as const,
  approvalPreview: (companyId: string, employeeId: string) =>
    ['hrms', 'leave', 'approval-preview', companyId, employeeId] as const,
};

// ─── Approval ────────────────────────────────────────────────────────────────

export const approvalKeys = {
  inbox: (companyId: string, reviewerId?: string) =>
    ['hrms', 'approval', 'inbox', companyId, reviewerId] as const,
  flows: (companyId: string) =>
    ['hrms', 'approval', 'flows', companyId] as const,
  hrmsRoles: (companyId: string) =>
    ['hrms', 'approval', 'hrms-roles', companyId] as const,
};

// ─── Payroll ──────────────────────────────────────────────────────────────────

export const payrollKeys = {
  all: (companyId: string) =>
    ['hrms', 'payroll', companyId] as const,
  runs: (companyId: string) =>
    [...payrollKeys.all(companyId), 'runs'] as const,
  items: (runId: string) =>
    ['hrms', 'payroll', 'items', runId] as const,
  myPayslips: (employeeId: string) =>
    ['hrms', 'payroll', 'my-payslips', employeeId] as const,
};

// ─── Appraisal ───────────────────────────────────────────────────────────────

export const appraisalKeys = {
  all: (companyId: string) =>
    ['hrms', 'appraisals', companyId] as const,
  items: (appraisalId: string) =>
    ['hrms', 'appraisals', 'items', appraisalId] as const,
  myItems: (employeeId: string) =>
    ['hrms', 'appraisals', 'my-items', employeeId] as const,
};

// ─── Attendance ───────────────────────────────────────────────────────────────

export const attendanceKeys = {
  all: (companyId: string) =>
    ['hrms', 'attendance', companyId] as const,
  records: (companyId: string, employeeId?: string, dateFrom?: string, dateTo?: string) =>
    [...attendanceKeys.all(companyId), 'records', employeeId, dateFrom, dateTo] as const,
};

// ─── Employee ─────────────────────────────────────────────────────────────────

export const employeeKeys = {
  directory: (companyId: string) =>
    ['hrms', 'employees', companyId, 'directory'] as const,
  forSelect: (companyId: string) =>
    ['hrms', 'employees', companyId, 'for-select'] as const,
};

// ─── Announcement ────────────────────────────────────────────────────────────

export const announcementKeys = {
  all: (companyId: string) =>
    ['hrms', 'announcements', companyId] as const,
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const settingsKeys = {
  departments: (companyId: string) =>
    ['hrms', 'settings', 'departments', companyId] as const,
  jobTitles: (companyId: string) =>
    ['hrms', 'settings', 'job-titles', companyId] as const,
  leaveTypes: (companyId: string) =>
    ['hrms', 'settings', 'leave-types', companyId] as const,
  holidays: (companyId: string) =>
    ['hrms', 'settings', 'holidays', companyId] as const,
  hrmsRoles: (companyId: string) =>
    ['hrms', 'settings', 'hrms-roles', companyId] as const,
  hrmsRoleEmployees: (companyId: string) =>
    ['hrms', 'settings', 'hrms-role-employees', companyId] as const,
};
