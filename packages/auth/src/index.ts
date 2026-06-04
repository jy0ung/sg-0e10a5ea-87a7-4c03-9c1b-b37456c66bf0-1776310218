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
export {
  HRMS_ACCESS_ROLES,
  HRMS_ADMIN_ROLES,
  HRMS_APPRAISAL_PARTICIPANT_ROLES,
  HRMS_APPROVAL_INBOX_ROLES,
  HRMS_LEAVE_APPROVER_ROLES,
  HRMS_MANAGER_ROLES,
  HRMS_PAYROLL_ROLES,
  HRMS_SELF_SERVICE_ROLES,
  PII_VIEW_ROLES,
} from './hrmsConfig';
export type { AccessSubject } from './accessControl';
export {
  ACCOUNTS_AND_UP,
  ADMIN_AND_DIRECTOR,
  ADMIN_ONLY,
  EXECUTIVE,
  HRMS_ADMIN,
  HRMS_APPRAISALS,
  HRMS_APPROVAL_INBOX,
  HRMS_LEAVE,
  HRMS_PAYROLL,
  MANAGER_AND_UP,
} from './routeRoles';
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
