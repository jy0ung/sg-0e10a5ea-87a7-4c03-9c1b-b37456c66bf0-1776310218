import { useAuth } from '@/contexts/AuthContext';
import { loggingService } from '@/services/loggingService';

/**
 * Returns the authenticated user's company_id.
 * Returns empty string (never 'c1') if profile is missing — Supabase queries
 * with .eq('company_id', '') return zero rows, preventing cross-tenant data leaks.
 */
export function useCompanyId(): string {
  const { user } = useAuth();

  if (!user?.company_id) {
    loggingService.warn(
      'useCompanyId: authenticated user has no company_id — profile may be corrupted',
      {},
      'useCompanyId'
    );
    return '';
  }

  return user.company_id;
}
