// Compatibility re-export: profile and account access behavior is owned by @flc/auth.
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
} from '@flc/auth';
export type {
  CompanyOption,
  ListProfilesResult,
  ProfileRow,
  UpdateProfileContext,
  UpdateProfileInput,
} from '@flc/auth';
