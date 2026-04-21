import type { AppRole } from '@/types';

/**
 * Phase 2 #15: centralized route-level role lists.
 *
 * These replace the inline `roles={[...]}` arrays sprinkled across `main.tsx`
 * so that a single edit here changes route gating app-wide. The DB-backed
 * `role_sections` matrix remains authoritative for section visibility; these
 * arrays control which roles may even hit the route at all.
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

export const HRMS_ADMIN: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'general_manager',
  'manager',
] as const;

export const HRMS_PAYROLL: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'general_manager',
] as const;

export const HRMS_LEAVE: readonly AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'manager',
  'accounts',
] as const;
