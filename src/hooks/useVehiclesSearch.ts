import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  searchVehicles,
  getVehicleKpiSummary,
  type VehicleSearchParams,
  type VehicleSearchResult,
  type VehicleKpiSummary,
} from '@/services/vehicleService';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Phase 2 #17: server-side paginated vehicle fetching.
 *
 * Usage:
 *   const { data, isLoading } = useVehiclesSearch({ branch, search, limit, offset });
 *
 * Returns `{ rows, totalCount }`. The hook scopes automatically on the caller's
 * company + branch (via AuthContext) so pages don't have to pass these in.
 * Call `invalidateVehicleCaches()` after writes to drop the LRU entries.
 */
export function useVehiclesSearch(
  params: Omit<VehicleSearchParams, 'branch'> & { branch?: string | null } = {},
) {
  const companyId = useCompanyId();
  const { user } = useAuth();

  // Branch-scoped users are always pinned to their branch regardless of param.
  const effectiveBranch =
    user?.access_scope === 'branch' ? (user.branch_id ?? null) : (params.branch ?? null);

  return useQuery<VehicleSearchResult>({
    queryKey: ['vehicles-search', companyId, effectiveBranch, { ...params, branch: effectiveBranch }],
    queryFn: async () => {
      const { data, error } = await searchVehicles({ ...params, branch: effectiveBranch });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useVehicleKpiSummary(branch?: string | null) {
  const companyId = useCompanyId();
  const { user } = useAuth();

  const effectiveBranch =
    user?.access_scope === 'branch' ? (user.branch_id ?? null) : (branch ?? null);

  return useQuery<VehicleKpiSummary | null>({
    queryKey: ['vehicle-kpi', companyId, effectiveBranch],
    queryFn: async () => {
      const { data, error } = await getVehicleKpiSummary(effectiveBranch);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });
}
