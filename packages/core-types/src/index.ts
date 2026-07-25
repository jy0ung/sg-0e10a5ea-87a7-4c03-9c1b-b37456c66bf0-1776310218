/**
 * @flc/core-types
 * Shared domain types for UBS v2 rebuild (Phase 0 foundation).
 * Inferred strictly from existing codebase (packages/types, routeRoles.ts, PROJECT_CONTEXT.md, services).
 * Do not add new symbols without explicit design.
 */

import { z } from 'zod';

// === Roles (from routeRoles.ts + packages/types + PROJECT_CONTEXT) ===
export type AppRole =
  | 'super_admin'
  | 'company_admin'
  | 'director'
  | 'general_manager'
  | 'manager'
  | 'sales'
  | 'accounts'
  | 'analyst' // legacy
  | 'creator_updater'
  | 'portal_admin'
  | 'portal_manager'
  | 'portal_staff';

export const ROLE_DEFAULT_SCOPE: Record<AppRole, 'global' | 'company' | 'branch' | 'self'> = {
  super_admin: 'global',
  company_admin: 'company',
  director: 'company',
  general_manager: 'company',
  manager: 'branch',
  sales: 'self',
  accounts: 'company',
  analyst: 'company',
  creator_updater: 'branch',
  portal_admin: 'company',
  portal_manager: 'company',
  portal_staff: 'self',
} as const;

// Role groups (centralized from routeRoles.ts)
export const ADMIN_ONLY = ['super_admin', 'company_admin'] as const;
export const EXECUTIVE = ['super_admin', 'company_admin', 'director', 'general_manager'] as const;
export const MANAGER_AND_UP = [...EXECUTIVE, 'manager'] as const;
export const ACCOUNTS_AND_UP = [...EXECUTIVE, 'accounts'] as const;

// === Basic Domain Primitives (Zod helpers from lib/forms.ts pattern) ===
export const requiredString = z.string().min(1);
export const optionalString = z.string().optional();
export const optionalEmail = z.string().email().optional();
export const codeField = z.string().regex(/^[A-Z0-9_-]+$/);

// === Core Entity IDs (inferred) ===
export type CompanyId = string;
export type BranchId = string;
export type ProfileId = string; // auth.uid()
export type EmployeeId = string;
export type VehicleChassis = string;

// === Status Enums (from profiles, employees, sales_advisors, etc.) ===
export type ProfileStatus = 'pending' | 'active' | 'inactive' | 'resigned';
export type EmployeeStatus = 'active' | 'inactive' | 'resigned';

// === Access Scope (from ROLE_DEFAULT_SCOPE + RLS) ===
export type AccessScope = 'global' | 'company' | 'branch' | 'self';

// === Minimal Zod Schemas for Phase 0 validation contracts ===
export const ProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: optionalString,
  role: z.enum(['super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst', 'creator_updater', 'portal_admin', 'portal_manager', 'portal_staff']),
  company_id: z.string().nullable(),
  branch_id: z.string().nullable(),
  status: z.enum(['pending', 'active', 'inactive', 'resigned']),
  employee_id: z.string().nullable(),
  portal_access_only: z.boolean().default(false),
});

export type Profile = z.infer<typeof ProfileSchema>;
