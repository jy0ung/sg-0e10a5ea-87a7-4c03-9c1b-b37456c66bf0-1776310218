import type { AppRole } from '@/types';

/**
 * Canonical HRMS role sets — import from here instead of duplicating in every page.
 */

/** Can manage employees, attendance, appraisals, announcements, and view leave calendar. */
export const HRMS_MANAGER_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'director', 'general_manager', 'manager',
];

/** Can create/finalise/mark-paid payroll runs. */
export const HRMS_PAYROLL_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'general_manager',
];

/** Can review (approve/reject) leave requests of others. */
export const HRMS_LEAVE_APPROVER_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'general_manager', 'manager',
];

/** Can access any HRMS route (applies leave, views calendar). */
export const HRMS_ACCESS_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'accounts',
];

/** Roles whose IC/contact numbers are shown unmasked in the directory. */
export const PII_VIEW_ROLES: AppRole[] = [
  'super_admin', 'company_admin',
];

/** Can manage HRMS admin configuration: departments, job titles, leave types, holidays, approval flows. */
export const HRMS_ADMIN_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'general_manager', 'manager',
];
