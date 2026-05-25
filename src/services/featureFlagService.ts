import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

/**
 * Feature-flag service — reads/writes the `feature_flags` table introduced
 * in migration 20260524000000. RLS gates writes to admins; reads are open
 * to authenticated company members + global rows.
 *
 * Resolution rule used by useFeatureFlag:
 *   1. (company_id, code) row if present
 *   2. otherwise (NULL company_id, code) row
 *   3. otherwise the default passed by the caller
 *
 * Generated Database types do not yet include this table; the cast is
 * isolated here so callers stay fully typed.
 */

export interface FeatureFlagRow {
  id: string;
  company_id: string | null;
  code: string;
  enabled: boolean;
  rollout_pct: number;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

type FeatureFlagsClient = {
  from: (table: 'feature_flags') => {
    select: (cols: string) => {
      or: (filter: string) => Promise<{
        data: FeatureFlagRow[] | null;
        error: Error | null;
      }>;
      eq: (col: string, val: string) => {
        order: (col: string, opts?: { ascending: boolean }) => Promise<{
          data: FeatureFlagRow[] | null;
          error: Error | null;
        }>;
      };
    };
    upsert: (
      row: Partial<FeatureFlagRow>,
      opts: { onConflict: string }
    ) => {
      select: (cols: string) => {
        single: () => Promise<{ data: FeatureFlagRow | null; error: Error | null }>;
      };
    };
  };
};

const client = supabase as unknown as FeatureFlagsClient;

export interface ResolvedFlag {
  code: string;
  enabled: boolean;
  rolloutPct: number;
  source: 'company' | 'global' | 'default';
}

/**
 * Load every flag row visible to the caller (company + global). The hook
 * resolves locally to keep the network round-trip count at one per session.
 */
export async function listFlagsForCaller(companyId: string | null): Promise<FeatureFlagRow[]> {
  // RLS scopes the response to caller's company + global rows; the filter is
  // belt-and-braces to keep the query cheap.
  const filter = companyId
    ? `company_id.eq.${companyId},company_id.is.null`
    : 'company_id.is.null';
  const { data, error } = await client
    .from('feature_flags')
    .select('*')
    .or(filter);

  if (error) {
    loggingService.warn('feature_flags load failed', { error: error.message });
    return [];
  }
  return data ?? [];
}

/**
 * Resolve a single flag against an already-loaded row set. Pure — safe to use
 * inside selectors and tests.
 */
export function resolveFlag(
  rows: FeatureFlagRow[],
  code: string,
  companyId: string | null,
  defaultValue: boolean,
): ResolvedFlag {
  const companyRow = companyId
    ? rows.find((r) => r.company_id === companyId && r.code === code)
    : undefined;
  if (companyRow) {
    return {
      code,
      enabled: companyRow.enabled,
      rolloutPct: companyRow.rollout_pct,
      source: 'company',
    };
  }
  const globalRow = rows.find((r) => r.company_id === null && r.code === code);
  if (globalRow) {
    return {
      code,
      enabled: globalRow.enabled,
      rolloutPct: globalRow.rollout_pct,
      source: 'global',
    };
  }
  return { code, enabled: defaultValue, rolloutPct: 100, source: 'default' };
}

/**
 * Stable hash of (userId, code) → 0..99. Used so percentage rollouts are
 * stable per user instead of flickering on every render.
 */
export function stableRolloutBucket(userId: string, code: string): number {
  let h = 5381;
  const key = `${userId}::${code}`;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

/**
 * Combine an enabled flag with the caller's rollout bucket. A 100% flag is
 * always on; a 0% flag is always off; in between the user falls inside the
 * rollout if their bucket < pct.
 */
export function isFlagOnForUser(
  flag: ResolvedFlag,
  userId: string | null,
): boolean {
  if (!flag.enabled) return false;
  if (flag.rolloutPct >= 100) return true;
  if (flag.rolloutPct <= 0) return false;
  if (!userId) return false;
  return stableRolloutBucket(userId, flag.code) < flag.rolloutPct;
}

/**
 * Admin-only mutation. RLS rejects calls from non-admins; the service does
 * not re-check, RLS is the security boundary.
 */
export async function upsertFlag(
  input: Pick<FeatureFlagRow, 'company_id' | 'code' | 'enabled' | 'rollout_pct'> &
    Pick<Partial<FeatureFlagRow>, 'description' | 'updated_by'>,
): Promise<FeatureFlagRow | null> {
  const onConflict = input.company_id ? 'company_id,code' : 'code';
  const { data, error } = await client
    .from('feature_flags')
    .upsert(input, { onConflict })
    .select('*')
    .single();
  if (error) {
    loggingService.error('feature_flags upsert failed', { error: error.message, code: input.code });
    throw error;
  }
  return data;
}
