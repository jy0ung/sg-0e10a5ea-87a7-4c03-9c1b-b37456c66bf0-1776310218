import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useColumnPermissions, canViewField, canEditField } from './useColumnPermissions';
import {
  loadRolePermissions,
  type SectionName,
} from '@/config/rolePermissions';
import type { AppRole } from '@/types';

/**
 * Unified permissions hook — the single surface every route/sidebar/component
 * should use to ask "can the current user do X?".
 *
 * Collapses three previously-independent gates:
 *   1. Role-based route access  (RequireRole + inline role arrays)
 *   2. Section visibility        (rolePermissions localStorage matrix)
 *   3. Column-level view/edit    (useColumnPermissions → permissionService)
 *
 * Phase 2 wires this to the existing sources of truth. Phase 2 step 15 will
 * migrate the localStorage matrix into a DB-backed `role_sections` table; the
 * hook's shape stays the same so callers don't change.
 */

export interface UnifiedPermissions {
  /** Raw role from profile. */
  role: AppRole | null;
  /** True if the current session has a verified profile. */
  isAuthenticated: boolean;
  /** True if the user's role matches any of the allowed ones. */
  hasRole: (allowed: readonly AppRole[]) => boolean;
  /** True if the user's role may see the named section. */
  canAccessSection: (section: SectionName) => boolean;
  /** Column-level field visibility. */
  canViewField: (columnName: string) => boolean;
  /** Column-level field edit. */
  canEditField: (columnName: string) => boolean;
  /** Low-level flags from the column-permission service. */
  flags: {
    canViewDetails: boolean;
    canEdit: boolean;
    canBulkEdit: boolean;
  };
  /** Underlying fetches still loading. */
  isLoading: boolean;
}

export function usePermissions(): UnifiedPermissions {
  const { user } = useAuth();
  const { permissions: colPerms, isLoading } = useColumnPermissions();

  const role = (user?.role ?? null) as AppRole | null;

  // Section matrix is stored in localStorage today; loaded once per render.
  // Phase 2 step 15 replaces this with a React Query hook against `role_sections`.
  const sectionMatrix = useMemo(() => loadRolePermissions(), []);

  return useMemo<UnifiedPermissions>(() => {
    const hasRole = (allowed: readonly AppRole[]): boolean =>
      !!role && allowed.includes(role);

    const canAccessSection = (section: SectionName): boolean => {
      if (!role) return false;
      const allowed = sectionMatrix[role];
      return Array.isArray(allowed) && allowed.includes(section);
    };

    return {
      role,
      isAuthenticated: !!user,
      hasRole,
      canAccessSection,
      canViewField: (col: string) => canViewField(colPerms, col),
      canEditField: (col: string) => canEditField(colPerms, col),
      flags: {
        canViewDetails: colPerms.canViewDetails,
        canEdit: colPerms.canEdit,
        canBulkEdit: colPerms.canBulkEdit,
      },
      isLoading,
    };
  }, [role, user, sectionMatrix, colPerms, isLoading]);
}
