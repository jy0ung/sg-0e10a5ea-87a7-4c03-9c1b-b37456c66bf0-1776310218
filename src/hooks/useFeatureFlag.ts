import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  isFlagOnForUser,
  listFlagsForCaller,
  resolveFlag,
  type FeatureFlagRow,
} from '@/services/featureFlagService';

const FLAGS_QUERY_KEY = ['feature_flags'] as const;
const ONE_MINUTE = 60_000;

/**
 * Loads the caller's visible flag rows (company + global) once per session
 * and caches them via React Query. Page-level hooks select against the
 * cached list; no per-flag network call.
 */
function useFlagRows(): { rows: FeatureFlagRow[]; isLoading: boolean } {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: [...FLAGS_QUERY_KEY, companyId ?? 'global'],
    queryFn: () => listFlagsForCaller(companyId),
    staleTime: 5 * ONE_MINUTE,
    gcTime: 30 * ONE_MINUTE,
    enabled: Boolean(user),
  });

  return { rows: data ?? [], isLoading };
}

/**
 * Returns true iff the given flag is on for the current user.
 *
 *   - SSR/anonymous: returns `defaultValue`.
 *   - No row in DB:  returns `defaultValue`.
 *   - Row present:   honours enabled + rollout_pct (stable hash per user).
 *
 * Use the rollout_pct field on the DB row to do percentage rollouts; the
 * resolution is stable per user across renders.
 */
export function useFeatureFlag(code: string, defaultValue = false): boolean {
  const { user } = useAuth();
  const { rows } = useFlagRows();

  const companyId = user?.company_id ?? null;
  const userId = user?.id ?? null;
  const resolved = resolveFlag(rows, code, companyId, defaultValue);
  return isFlagOnForUser(resolved, userId);
}

/**
 * Convenience selector for admin UIs that need to render the underlying row
 * (with enabled, rollout_pct, source). Falls back to a synthetic "default"
 * shape when no row exists.
 */
export function useFeatureFlagDetail(code: string, defaultValue = false) {
  const { user } = useAuth();
  const { rows, isLoading } = useFlagRows();
  const companyId = user?.company_id ?? null;
  const resolved = resolveFlag(rows, code, companyId, defaultValue);
  return { ...resolved, isLoading };
}
