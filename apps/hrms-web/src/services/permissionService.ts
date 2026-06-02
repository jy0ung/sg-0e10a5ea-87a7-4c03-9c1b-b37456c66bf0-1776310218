// Compatibility re-export: column permission behavior is owned by @flc/auth.
export {
  canEditColumn,
  canViewColumn,
  getDefaultPermissionsForRole,
  getUserColumnPermissions,
  getUserPermissions,
  setUserColumnPermissions,
} from '@flc/auth';
export type {
  ColumnPermission,
  PermissionLevel,
  UserPermissions,
} from '@flc/auth';
