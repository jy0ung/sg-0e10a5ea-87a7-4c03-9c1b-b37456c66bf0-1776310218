import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useColumnPermissions, canViewField, canEditField } from './useColumnPermissions';
import {
  DEFAULT_ROLE_SECTIONS,
  type SectionName,
} from '@/config/rolePermissions';
import { fetchRoleSections, type RoleSectionsMatrix } from '@/services/roleSectionService';
import type { AppRole } from '@/types';

/**
 * Unified permissions hook — the single surface every route/sidebar/component
 * should use to ask "can the current user do X?".
 *
 * Collapses three previously-independent gates:
 *   1. Role-based route access  (RequireRole + inline role arrays)
 *   2. Section visibility        (role_sections DB table)
 *   3. Column-level view/edit    (useColumnPermissions → permissionService)
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

/** React Query hook that loads the role→section matrix from the DB. */
export function useRoleSectionMatrix(): RoleSectionsMatrix {
  const { user } = useAuth();
  const companyId = user?.company_id ?? '';

  const { data } = useQuery({
    queryKey: ['role_sections', companyId],
    queryFn: () => fetchRoleSections(companyId).then((r) => r.data),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 min — permissions change rarely
  });

  return data ?? { ...DEFAULT_ROLE_SECTIONS };
}

export function usePermissions(): UnifiedPermissions {
  const { user } = useAuth();
  const { permissions: colPerms, isLoading } = useColumnPermissions();

  const role = (user?.role ?? null) as AppRole | null;
  const sectionMatrix = useRoleSectionMatrix();

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
