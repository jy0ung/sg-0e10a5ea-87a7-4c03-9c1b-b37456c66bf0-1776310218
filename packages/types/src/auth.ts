// ===== User & Auth =====
export type AppRole =
  | 'super_admin'
  | 'company_admin'
  | 'director'
  | 'general_manager'
  | 'manager'
  | 'sales'
  | 'accounts'
  | 'analyst'
  | 'creator_updater'
  | 'portal_admin'
  | 'portal_manager'
  | 'portal_staff';
export type AccessScope = 'self' | 'branch' | 'company' | 'global';

export const DEFAULT_APP_ROLE: AppRole = 'creator_updater';

export const ROLE_DEFAULT_SCOPE: Record<AppRole, AccessScope> = {
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
};

export interface User {
  id: string;
  employeeId?: string | null;
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  branchId?: string;
  avatar?: string;
  accessScope: AccessScope;
}

export interface Company {
  id: string;
  name: string;
  code: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  companyId: string;
}
