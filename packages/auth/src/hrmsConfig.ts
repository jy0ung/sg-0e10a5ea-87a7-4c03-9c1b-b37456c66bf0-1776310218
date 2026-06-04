import type { AppRole } from '@flc/types';

/**
 * HRMS app-role sets used by both the main UBS app and dedicated HRMS host.
 * HRMS organisational roles remain separate runtime data; these constants only
 * define coarse app-role eligibility for route and UI affordance checks.
 */
export const HRMS_SELF_SERVICE_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'manager',
  'sales',
  'accounts',
  'analyst',
  'creator_updater',
] as const;

export const HRMS_MANAGER_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'manager',
] as const;

export const HRMS_PAYROLL_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'general_manager',
] as const;

export const HRMS_LEAVE_APPROVER_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'general_manager',
  'manager',
] as const;

export const HRMS_APPROVAL_INBOX_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'manager',
  'accounts',
] as const;

/** Legacy alias for HRMS self-service access. Use HRMS_SELF_SERVICE_ROLES in new code. */
export const HRMS_ACCESS_ROLES: readonly AppRole[] = HRMS_SELF_SERVICE_ROLES;

export const HRMS_APPRAISAL_PARTICIPANT_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'manager',
  'sales',
  'accounts',
  'analyst',
  'creator_updater',
] as const;

export const PII_VIEW_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
] as const;

export const HRMS_ADMIN_ROLES: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'general_manager',
  'manager',
] as const;
