import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getUserPermissions, type UserPermissions, type PermissionLevel } from '@/services/permissionService';

/**
 * React hook that fetches and caches the current user's column-level
 * permissions for the vehicles table. Results are cached for 5 minutes.
 */
export function useColumnPermissions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['columnPermissions', user?.id],
    queryFn: () => getUserPermissions(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  const permissions: UserPermissions = {
    columns: data?.columns ?? new Map<string, PermissionLevel>(),
    canViewDetails: data?.canViewDetails ?? false,
    canEdit: data?.canEdit ?? false,
    canBulkEdit: data?.canBulkEdit ?? false,
  };

  return { permissions, isLoading };
}

/** Can the user see this column at all? */
export function canViewField(perms: UserPermissions, columnName: string): boolean {
  // canEdit implies full view access (director, GM, manager, admins)
  if (perms.canEdit) return true;
  // Empty column map with no edit = analyst (implicit view-all)
  if (perms.columns.size === 0) return true;
  const perm = perms.columns.get(columnName);
  return perm === 'view' || perm === 'edit';
}

/** Can the user edit this specific column? */
export function canEditField(perms: UserPermissions, columnName: string): boolean {
  // Empty column map + canEdit = full access (super_admin, company_admin)
  if (perms.columns.size === 0 && perms.canEdit) return true;
  const perm = perms.columns.get(columnName);
  return perm === 'edit';
}
