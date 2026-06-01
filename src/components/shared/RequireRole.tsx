import React from 'react';
import type { SectionName } from '@/config/rolePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleSectionMatrix } from '@/hooks/usePermissions';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { canAccessSection, hasAppRole } from '@flc/auth';

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
 * App, portal, and future platform roles are all represented by the shared
 * AppRole union in @flc/types. The database/RLS remains authoritative; this
 * guard only prevents users from landing on unsupported UI surfaces.
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
  const { user } = useAuth();
  const sectionMatrix = useRoleSectionMatrix();

  if (!hasAppRole(user, roles)) return <UnauthorizedAccess />;

  if (section && user) {
    if (!canAccessSection(user, sectionMatrix, section)) return <UnauthorizedAccess />;
  }

  return <>{children}</>;
}
