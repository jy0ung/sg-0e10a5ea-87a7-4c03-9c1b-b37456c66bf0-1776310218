import type { AppRole } from '@/types';

/**
 * Canonical HRMS role sets — import from here instead of duplicating in every page.
 */

/**
 * Self-service HRMS access for all staff roles.
 * These users can request leave, view calendars, inspect attendance, see appraisals, and read announcements.
 */
export const HRMS_SELF_SERVICE_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'director', 'general_manager', 'manager',
  'sales', 'accounts', 'analyst', 'creator_updater',
];

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

/** Can access the cross-entity approval inbox and action assigned approvals. */
export const HRMS_APPROVAL_INBOX_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'accounts',
];

/** Legacy alias for HRMS self-service access. Use HRMS_SELF_SERVICE_ROLES in new code. */
export const HRMS_ACCESS_ROLES: AppRole[] = HRMS_SELF_SERVICE_ROLES;

/** Can participate in appraisal cycles through self review, manager review, or acknowledgement. */
export const HRMS_APPRAISAL_PARTICIPANT_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst', 'creator_updater',
];

/** Roles whose IC/contact numbers are shown unmasked in the directory. */
export const PII_VIEW_ROLES: AppRole[] = [
  'super_admin', 'company_admin',
];

/** Can manage HRMS admin configuration: departments, job titles, leave types, holidays, approval flows. */
export const HRMS_ADMIN_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'general_manager', 'manager',
];
