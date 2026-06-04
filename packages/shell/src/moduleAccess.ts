import type { PlatformModule } from '@flc/types';
import { getModuleGateForPath, getModuleGateForSection } from './platformRegistry';

export const platformModules: readonly PlatformModule[] = [
  { id: 'auto-aging', name: 'Auto Aging', description: 'Vehicle aging analysis across operational milestones', icon: 'Timer', status: 'active', path: '/auto-aging' },
  { id: 'sales', name: 'Sales Intelligence', description: 'Sales operations, transactions, and performance tracking', icon: 'TrendingUp', status: 'active', path: '/sales' },
  { id: 'inventory', name: 'Inventory Intelligence', description: 'Stock visibility, chassis movement, and transfer monitoring', icon: 'Package', status: 'active', path: '/inventory/stock' },
  { id: 'purchasing', name: 'Purchasing', description: 'Procurement invoice workflows and inbound purchasing activity', icon: 'Settings', status: 'active', path: '/purchasing/invoices' },
  { id: 'reports', name: 'Business Reports', description: 'Cross-module operational reporting, exports, and business summaries', icon: 'DollarSign', status: 'active', path: '/reports' },
  { id: 'admin', name: 'Administration', description: 'User access, configuration, master data, and governance tools', icon: 'UserCheck', status: 'active', path: '/admin/settings' },
  { id: 'hrms', name: 'HRMS', description: 'Dedicated workforce workspace for staff records, leave, attendance, payroll, appraisals, and announcements', icon: 'Briefcase', status: 'active', path: '/hrms/' },
  { id: 'support', name: 'Internal Requests', description: 'Internal request submission, status tracking, and service coordination workflows', icon: 'Users', status: 'active', path: '/portal/tickets/new' },
  { id: 'forecasting', name: 'Forecasting & AI Insights', description: 'Predictive analytics and AI recommendations', icon: 'Brain', status: 'planned' },
] as const;

export interface ModuleSettingRecord {
  company_id: string;
  module_id: string;
  is_active: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface ResolvedPlatformModule extends PlatformModule {
  isActive: boolean;
  isToggleable: boolean;
}

const CORE_MODULE_IDS = new Set(['admin']);

export function isModuleToggleable(module: PlatformModule): boolean {
  return Boolean(module.path) && module.status === 'active' && !CORE_MODULE_IDS.has(module.id);
}

export function resolvePlatformModules(settings: readonly ModuleSettingRecord[]): ResolvedPlatformModule[] {
  const settingMap = new Map(settings.map((setting) => [setting.module_id, setting.is_active]));

  return platformModules.map((module) => {
    const forcedActive = CORE_MODULE_IDS.has(module.id);
    const isActive = forcedActive
      ? true
      : module.status === 'planned'
        ? false
        : settingMap.get(module.id) ?? module.status === 'active';

    const status = module.status === 'planned'
      ? 'planned'
      : isActive
        ? 'active'
        : 'coming_soon';

    return {
      ...module,
      status,
      isActive,
      isToggleable: isModuleToggleable(module),
    };
  });
}

export function getModuleIdForPath(pathname: string): string | null {
  return getModuleGateForPath(pathname);
}

export function getModuleIdForSection(sectionName: string): string | null {
  return getModuleGateForSection(sectionName);
}
