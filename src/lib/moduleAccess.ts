import { platformModules } from '@/data/demo-data';
import type { PlatformModule } from '@/types';

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

const SECTION_TO_MODULE_ID: Record<string, string> = {
  'Auto Aging': 'auto-aging',
  'Sales': 'sales',
  'Inventory': 'inventory',
  'Purchasing': 'purchasing',
  'Reports': 'reports',
  'HRMS': 'hrms',
  'Admin': 'admin',
};

const MODULE_ROUTE_PREFIXES: Array<{ moduleId: string; prefixes: string[] }> = [
  { moduleId: 'auto-aging', prefixes: ['/auto-aging'] },
  { moduleId: 'sales', prefixes: ['/sales'] },
  { moduleId: 'inventory', prefixes: ['/inventory'] },
  { moduleId: 'purchasing', prefixes: ['/purchasing'] },
  { moduleId: 'reports', prefixes: ['/reports'] },
  { moduleId: 'hrms', prefixes: ['/hrms'] },
  { moduleId: 'admin', prefixes: ['/admin'] },
  { moduleId: 'support', prefixes: ['/portal'] },
];

export function isModuleToggleable(module: PlatformModule): boolean {
  return Boolean(module.path) && module.status === 'active' && !CORE_MODULE_IDS.has(module.id);
}

export function resolvePlatformModules(settings: ModuleSettingRecord[]): ResolvedPlatformModule[] {
  const settingMap = new Map(settings.map(setting => [setting.module_id, setting.is_active]));

  return platformModules.map(module => {
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
  const match = MODULE_ROUTE_PREFIXES.find(({ prefixes }) => (
    prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ));

  return match?.moduleId ?? null;
}

export function getModuleIdForSection(sectionName: string): string | null {
  return SECTION_TO_MODULE_ID[sectionName] ?? null;
}