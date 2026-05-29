import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformMismatchError } from '@/lib/platformErrors';

/**
 * Lightweight app-wide canary that detects when the deployed web app is
 * calling RPCs that don't exist in the production schema cache (the class
 * of failure that surfaced as the "Could not find the function
 * public.get_role_home_kpis(...)" outage).
 *
 * We pick `get_role_home_kpis` as the canary because:
 *   • It's the first RPC every authenticated user hits on Home.
 *   • It is gated by `auth.uid()`, so an unauthorized call still proves
 *     the function is registered — that's exactly what we want to know.
 *   • Anything stricter (a dedicated `health` RPC) would itself be
 *     subject to the same migration-not-applied risk.
 *
 * The hook treats every non-mismatch error as healthy. We only care about
 * the specific "schema cache" / "Could not find function" class. RLS
 * denials, network errors, or "Unauthorized" RAISE exceptions still mean
 * the platform is wired correctly — they just mean *this caller* isn't
 * allowed to see the data.
 */
export function usePlatformHealth(): { healthy: boolean; mismatch: boolean } {
  const { user } = useAuth();

  const { error } = useQuery({
    queryKey: ['platform-health-canary'],
    queryFn: async () => {
      const { error } = await supabase.rpc('get_role_home_kpis', {
        p_company_id: user?.company_id ?? '__healthcheck__',
        p_role: user?.role ?? 'creator_updater',
      });
      if (error && isPlatformMismatchError(error)) {
        throw error;
      }
      return true;
    },
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

  const mismatch = !!error && isPlatformMismatchError(error);
  return { healthy: !mismatch, mismatch };
}
