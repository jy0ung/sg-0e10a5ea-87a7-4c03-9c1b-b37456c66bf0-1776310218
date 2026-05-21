import { PORTAL_QUEUE_ROLES } from '@/config/routeRoles';
import type { ProfileRow } from '@/services/profileService';

const REQUEST_OWNER_ROLES = new Set<string>(PORTAL_QUEUE_ROLES);

export function getRequestAssignees(profiles: ProfileRow[]) {
  return profiles
    .filter((profile) => profile.status === 'active' && REQUEST_OWNER_ROLES.has(profile.role))
    .sort((left, right) => left.name.localeCompare(right.name));
}
