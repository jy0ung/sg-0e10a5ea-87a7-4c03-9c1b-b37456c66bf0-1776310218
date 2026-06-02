import { canManagePortalQueue } from '@/lib/portalAccess';
import type { ProfileRow } from '@flc/auth';

// Anyone with PORTAL_QUEUE_ROLES (the queue managers) is a valid request
// assignee — they're the people who triage and resolve incoming requests.
// canManagePortalQueue is the single source of truth for that role set.
export function getRequestAssignees(profiles: ProfileRow[]) {
  return profiles
    .filter((profile) => profile.status === 'active' && canManagePortalQueue(profile))
    .sort((left, right) => left.name.localeCompare(right.name));
}
