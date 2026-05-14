import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { deriveHrmsAccess, deriveFullHrmsAccess } from '@/lib/hrms/access';
import { listAssignedHrmsRoles } from '@/services/hrmsRoleService';

const HRMS_ADMIN_APP_ROLES = new Set(['super_admin', 'company_admin']);

export function useHrmsAccess() {
  const { user } = useAuth();

  const isHrmsAdmin = HRMS_ADMIN_APP_ROLES.has(user?.role ?? '');

  const query = useQuery({
    queryKey: ['hrms-access', user?.companyId, user?.id, user?.employeeId],
    queryFn: async () => {
      const result = await listAssignedHrmsRoles(user!.companyId, user!.id, user?.employeeId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!user?.companyId && !!user?.id && !isHrmsAdmin,
  });

  const access = useMemo(
    () => (isHrmsAdmin ? deriveFullHrmsAccess() : deriveHrmsAccess(query.data ?? [])),
    [isHrmsAdmin, query.data],
  );

  return {
    ...access,
    loading: !isHrmsAdmin && query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}