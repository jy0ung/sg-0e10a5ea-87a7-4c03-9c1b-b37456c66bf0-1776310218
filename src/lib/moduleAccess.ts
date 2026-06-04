// Compatibility re-export: module catalogue and module-gate resolution are owned by @flc/shell.
export {
  getModuleIdForPath,
  getModuleIdForSection,
  isModuleToggleable,
  resolvePlatformModules,
} from '@flc/shell';
export type { ModuleSettingRecord, ResolvedPlatformModule } from '@flc/shell';
