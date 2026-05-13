import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listEmployeeDirectory,
  updateEmployee,
} from '@flc/hrms-services';
import { employeeKeys } from '../queryKeys';

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useEmployeeDirectory(companyId: string) {
  return useQuery({
    queryKey: employeeKeys.directory(companyId),
    queryFn: () => listEmployeeDirectory(companyId),
    enabled: Boolean(companyId),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useUpdateEmployee(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      actorId,
      input,
    }: {
      id: string;
      actorId: string;
      input: Parameters<typeof updateEmployee>[2];
    }) => updateEmployee(id, actorId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.directory(companyId) });
      void queryClient.invalidateQueries({ queryKey: employeeKeys.forSelect(companyId) });
    },
  });
}
