import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { deriveHrmsAccess } from '@/lib/hrms/access';
import { listAssignedHrmsRoles } from '@/services/hrmsRoleService';

export function useHrmsAccess() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['hrms-access', user?.companyId, user?.id, user?.employeeId],
    queryFn: async () => {
      const result = await listAssignedHrmsRoles(user!.companyId, user!.id, user?.employeeId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!user?.companyId && !!user?.id,
  });

  const access = useMemo(() => deriveHrmsAccess(query.data ?? []), [query.data]);

  return {
    ...access,
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}