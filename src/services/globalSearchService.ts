import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

// Wraps the `global_search(p_query, p_limit)` RPC introduced in
// migration 20260524020000_global_search.sql. Replaces the four parallel
// queries previously issued by Cmd+K (searchVehicles, customers list
// filter, sales_orders list filter, listProfiles + client-side filter).
//
// RLS does the company / role isolation; this service is a thin typed
// wrapper. Profiles results are naturally suppressed for non-admins by
// the existing profiles SELECT policy.

export type GlobalSearchEntityType =
  | 'vehicle'
  | 'customer'
  | 'sales_order'
  | 'profile';

export interface GlobalSearchHit {
  entityType: GlobalSearchEntityType;
  entityId: string;
  label: string;
  description: string | null;
  href: string;
  rankScore: number;
}

interface GlobalSearchRow {
  entity_type: GlobalSearchEntityType;
  entity_id: string;
  label: string;
  description: string | null;
  href: string;
  rank_score: number;
}

type GlobalSearchClient = {
  rpc: (
    name: 'global_search',
    args: { p_query: string; p_limit: number },
  ) => Promise<{ data: GlobalSearchRow[] | null; error: Error | null }>;
};

const client = supabase as unknown as GlobalSearchClient;

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT_PER_TYPE = 6;

/**
 * Server-side Cmd+K. Returns up to `limit` matches per entity type, then
 * orders by rank_score DESC, label ASC. Empty array for queries shorter
 * than 2 characters (matches the previous client-side guard).
 */
export async function globalSearch(
  query: string,
  limit: number = DEFAULT_LIMIT_PER_TYPE,
): Promise<GlobalSearchHit[]> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return [];

  const { data, error } = await client.rpc('global_search', {
    p_query: term,
    p_limit: limit,
  });

  if (error) {
    loggingService.warn(
      'global_search RPC failed',
      { error: error.message, query: term },
      'GlobalSearchService',
    );
    return [];
  }
  if (!data) return [];

  return data.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.label,
    description: row.description,
    href: row.href,
    rankScore: row.rank_score,
  }));
}
