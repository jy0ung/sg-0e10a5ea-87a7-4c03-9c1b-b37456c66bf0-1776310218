import type { AppRole } from '@flc/types';

export const ALL_SECTIONS = [
  'Platform',
  'Auto Aging',
  'Sales',
  'Inventory',
  'Purchasing',
  'Reports',
  'HRMS',
  'Admin',
] as const;

export type SectionName = typeof ALL_SECTIONS[number];

/**
 * Default section-level permissions for each role.
 * Admins can override these via the permission matrix editor persisted to role_sections.
 */
export const DEFAULT_ROLE_SECTIONS: Record<AppRole, SectionName[]> = {
  super_admin: [...ALL_SECTIONS],
  company_admin: [...ALL_SECTIONS],
  director: ['Platform', 'Auto Aging', 'Sales', 'Inventory', 'Purchasing', 'Reports', 'HRMS', 'Admin'],
  general_manager: ['Platform', 'Auto Aging', 'Sales', 'Inventory', 'Purchasing', 'Reports', 'HRMS', 'Admin'],
  manager: ['Platform', 'Auto Aging', 'Sales', 'Inventory', 'Reports', 'HRMS', 'Admin'],
  sales: ['Platform', 'Sales', 'HRMS', 'Admin'],
  accounts: ['Platform', 'Sales', 'Purchasing', 'Reports', 'HRMS', 'Admin'],
  analyst: ['Platform', 'Auto Aging', 'Sales', 'Inventory', 'Reports', 'HRMS', 'Admin'],
  creator_updater: ['Platform', 'Auto Aging', 'Sales', 'Inventory', 'Purchasing', 'HRMS', 'Admin'],
  portal_admin: ['Admin'],
  portal_manager: ['Admin'],
  portal_staff: [],
};

/** Human-readable label for each app role. */
export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin',
  director: 'Director',
  general_manager: 'General Manager',
  manager: 'Manager',
  sales: 'Sales',
  accounts: 'Accounts',
  analyst: 'Analyst (Legacy)',
  creator_updater: 'Creator / Updater',
  portal_admin: 'Portal Admin',
  portal_manager: 'Portal Manager',
  portal_staff: 'Portal Staff',
};
