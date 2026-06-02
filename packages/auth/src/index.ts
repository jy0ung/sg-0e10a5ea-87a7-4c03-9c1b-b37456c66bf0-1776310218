export {
  AuthProvider,
  useAuth,
  ProtectedRoute,
} from './AuthContext';
export type {
  AuthLogger,
  AuthErrorTracker,
  Profile,
  AuthContextType,
} from './AuthContext';
export {
  PORTAL_ONLY_ROLES,
  PORTAL_QUEUE_ROLES,
  PORTAL_SETUP_ROLES,
  canAccessMainApp,
  canAccessSection,
  canManagePortalQueue,
  canManagePortalSetup,
  getSubjectRole,
  hasAppRole,
  hasPortalSpecificRole,
  isPortalOnlyUser,
  resolveAuthenticatedHomePath,
} from './accessControl';
export {
  ALL_SECTIONS,
  DEFAULT_ROLE_SECTIONS,
  ROLE_LABELS,
} from './rolePermissions';
export type { SectionName } from './rolePermissions';
export type { AccessSubject } from './accessControl';
export { fetchRoleSections, saveRoleSections } from './roleSectionService';
export type { RoleSectionRow, RoleSectionsMatrix } from './roleSectionService';
export {
  expiredResetLinkMessage,
  getAuthCallbackParams,
  getCallbackErrorMessage,
  getCurrentAuthUser,
  initializeInviteSignup,
  initializePasswordRecovery,
  invalidResetLinkMessage,
  isRecoverySession,
  resetLinkTimeoutMessage,
  signOutAuthSession,
  subscribeToPasswordRecovery,
  updateInvitedUserPasswordAndMetadata,
  updateRecoveryPassword,
} from './authFlows';
export { authService, getResetPasswordRedirectUrl } from './authService';
export type { AuthError, AuthUser } from './authService';
export type {
  AuthCallbackParams,
  InviteInitializationResult,
  PasswordRecoveryInitializationResult,
} from './authFlows';
export {
  canEditColumn,
  canViewColumn,
  getDefaultPermissionsForRole,
  getUserColumnPermissions,
  getUserPermissions,
  setUserColumnPermissions,
} from './permissionService';
export type {
  ColumnPermission,
  PermissionLevel,
  UserPermissions,
} from './permissionService';
export {
  changePassword,
  deactivateUser,
  deleteInvitedUser,
  inviteUser,
  listCompanyOptions,
  listProfiles,
  reactivateUser,
  setPortalAccess,
  updateOwnProfileName,
  updateProfile,
} from './profileService';
export type {
  CompanyOption,
  ListProfilesResult,
  ProfileRow,
  UpdateProfileContext,
  UpdateProfileInput,
} from './profileService';
