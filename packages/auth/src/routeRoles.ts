import type { AppRole } from '@flc/types';
import {
  PORTAL_QUEUE_ROLES as ACCESS_PORTAL_QUEUE_ROLES,
  PORTAL_SETUP_ROLES as ACCESS_PORTAL_SETUP_ROLES,
} from './accessControl';
import {
  HRMS_ADMIN_ROLES,
  HRMS_APPRAISAL_PARTICIPANT_ROLES,
  HRMS_APPROVAL_INBOX_ROLES,
  HRMS_PAYROLL_ROLES,
  HRMS_SELF_SERVICE_ROLES,
} from './hrmsConfig';

/**
 * Route-level role groups used by both the main UBS app and dedicated HRMS host.
 *
 * RLS and section permissions remain authoritative. These constants only define
 * the coarse route-entry gates used before domain-specific checks run.
 */
export const ADMIN_ONLY: readonly AppRole[] = ['super_admin', 'company_admin'] as const;

export const ADMIN_AND_DIRECTOR: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
] as const;

export const EXECUTIVE: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
] as const;

export const MANAGER_AND_UP: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'manager',
] as const;

// Financial reporting: matches the GL RLS policy (accounting_periods_admin_write).
export const ACCOUNTS_AND_UP: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'accounts',
] as const;

export const HRMS_ADMIN: readonly AppRole[] = HRMS_ADMIN_ROLES;

export const HRMS_PAYROLL: readonly AppRole[] = HRMS_PAYROLL_ROLES;

export const HRMS_APPROVAL_INBOX: readonly AppRole[] = HRMS_APPROVAL_INBOX_ROLES;

export const HRMS_LEAVE: readonly AppRole[] = HRMS_SELF_SERVICE_ROLES;

export const HRMS_APPRAISALS: readonly AppRole[] = HRMS_APPRAISAL_PARTICIPANT_ROLES;

export const PORTAL_QUEUE_ROLES: readonly AppRole[] = ACCESS_PORTAL_QUEUE_ROLES;
export const PORTAL_SETUP_ROLES: readonly AppRole[] = ACCESS_PORTAL_SETUP_ROLES;
