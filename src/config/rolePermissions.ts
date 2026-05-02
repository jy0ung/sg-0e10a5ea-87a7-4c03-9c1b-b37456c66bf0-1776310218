import type { AppRole } from '@/types';

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
 * Admins can override these via the permission matrix editor (persisted to localStorage).
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
};

const LS_KEY = 'flc_role_section_permissions';

export function loadRolePermissions(): Record<AppRole, SectionName[]> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<AppRole, SectionName[]>>;
      // Merge with defaults so any new roles/sections added in code are still present
      const merged = { ...DEFAULT_ROLE_SECTIONS };
      for (const role of Object.keys(parsed) as AppRole[]) {
        if (role in merged) {
          merged[role] = parsed[role]!;
        }
      }
      return merged;
    }
  } catch {
    // Ignore parse errors — fall back to defaults
  }
  return { ...DEFAULT_ROLE_SECTIONS };
}

export function saveRolePermissions(perms: Record<AppRole, SectionName[]>): void {
  localStorage.setItem(LS_KEY, JSON.stringify(perms));
}

export function resetRolePermissions(): void {
  localStorage.removeItem(LS_KEY);
}

/** Human-readable label for each role */
export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin',
  director: 'Director',
  general_manager: 'General Manager',
  manager: 'Manager',
  sales: 'Sales',
  accounts: 'Accounts',
  analyst: 'Analyst',
  creator_updater: 'Creator / Updater',
};
