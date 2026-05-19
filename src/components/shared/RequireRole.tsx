import React from 'react';
import { AppRole } from '@/types';
import type { SectionName } from '@/config/rolePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleSectionMatrix } from '@/hooks/usePermissions';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

/**
 * Route-level guard that renders children only when the current user
 * holds one of the required roles AND (optionally) has section-level
 * access via the role_sections DB table.
 *
 * When `section` is provided, the user must pass BOTH the role check
 * AND the section check.  This prevents admins from hiding a section
 * via the role_sections editor while the route guard still allows
 * direct URL navigation.
 *
 * The `roles` prop accepts `readonly string[]` rather than the narrower
 * `readonly AppRole[]` so that portal-only role identifiers
 * (`portal_admin`, `portal_manager`, `portal_staff`) — which live outside
 * the main AppRole union — can be passed without a type-cast at every
 * call site.  Runtime behaviour is unchanged: hasRole() compares the
 * user's profile.role string against the provided list.
 */
export function RequireRole({
  roles,
  section,
  children,
}: {
  roles: readonly string[];
  section?: SectionName;
  children: React.ReactNode;
}) {
  const { user, hasRole } = useAuth();
  const sectionMatrix = useRoleSectionMatrix();

  if (!hasRole(roles as AppRole[])) return <UnauthorizedAccess />;

  if (section && user) {
    const allowed = sectionMatrix[user.role as AppRole] ?? [];
    if (!allowed.includes(section)) return <UnauthorizedAccess />;
  }

  return <>{children}</>;
}
