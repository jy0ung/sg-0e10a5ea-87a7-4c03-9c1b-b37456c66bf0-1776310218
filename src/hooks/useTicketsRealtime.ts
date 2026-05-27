import { useCallback } from 'react';
import { useSupabaseChannel } from '@flc/supabase';

interface Options {
  /** Tenant filter. The channel is a no-op when null/undefined. */
  companyId: string | null | undefined;
  /** Disable subscription entirely (e.g. while the user is not yet authenticated). */
  enabled?: boolean;
  /** Called once per change event from any of the watched tables. */
  onChange: () => void;
  /**
   * Distinguishes channels when multiple ticket views are mounted on the same
   * page (e.g. RequestQueue + RequestHistory). Defaults to "default".
   */
  scope?: string;
}

/**
 * Live updates for the Internal Service Request module. Subscribes to the
 * three Postgres tables that drive any ticket-listing UI:
 *
 *   tickets          — INSERT/UPDATE/DELETE — covers new submissions,
 *                      status changes, assignment, resolution, cancellation.
 *   ticket_activity  — INSERT only — covers comments and audit events
 *                      (approval decisions write here too).
 *   ticket_attachments — INSERT/DELETE — covers files added/removed after
 *                        the initial submission.
 *
 * All subscriptions are scoped to company_id so a tenant only sees their
 * own traffic, matching the tickets RLS policy. The hook hands a single
 * onChange callback up to the caller, who decides which React Query keys
 * to invalidate — the queue's filter-bound key, the history's archived
 * key, the requester's "my tickets" key, etc.
 *
 * This is intentionally a "fire invalidation, let React Query refetch"
 * pattern rather than applying payload deltas to the cache directly. The
 * tradeoff: one network round-trip per event instead of zero, but no
 * tricky cache reconciliation when filters/pagination don't match the
 * incoming row. Matches the existing useApprovalInboxItems hook.
 */
export function useTicketsRealtime({ companyId, enabled = true, onChange, scope = 'default' }: Options) {
  // Stable handler so useSupabaseChannel doesn't re-subscribe on every render
  // just because the caller passed a fresh arrow function.
  const handler = useCallback(() => {
    if (!companyId) return;
    onChange();
  }, [companyId, onChange]);

  useSupabaseChannel({
    name: `tickets-realtime:${scope}:${companyId ?? 'anon'}`,
    enabled: enabled && !!companyId,
    subscriptions: [
      { event: '*',      table: 'tickets',            filter: `company_id=eq.${companyId ?? ''}` },
      { event: 'INSERT', table: 'ticket_activity',    filter: `company_id=eq.${companyId ?? ''}` },
      { event: '*',      table: 'ticket_attachments', filter: `company_id=eq.${companyId ?? ''}` },
    ],
    onChange: handler,
  });
}
