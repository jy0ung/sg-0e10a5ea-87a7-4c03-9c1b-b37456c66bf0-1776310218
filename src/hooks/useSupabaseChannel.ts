import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// One hook to replace the inline supabase.channel(...).on(...).subscribe()
// boilerplate currently duplicated in ApprovalInbox, Notifications,
// SalesContext, and several Auto Aging surfaces. Reduces three concerns to
// one: name the channel, declare the subscriptions, handle the events.
//
// Each subscription is a postgres_changes binding. The handler is called
// for every event that matches its (event, schema, table, filter). The
// subscription auto-cleans on unmount.
//
//   useSupabaseChannel({
//     name: `approval-inbox:${companyId}`,
//     enabled: !!companyId,
//     subscriptions: [
//       { event: '*', table: 'leave_requests', filter: `company_id=eq.${companyId}` },
//       { event: '*', table: 'payroll_runs',   filter: `company_id=eq.${companyId}` },
//       { event: '*', table: 'appraisals',     filter: `company_id=eq.${companyId}` },
//     ],
//     onChange: () => queryClient.invalidateQueries({ queryKey }),
//   });
//
// Per-subscription onChange is also supported when an INSERT needs a
// different optimistic update than an UPDATE (see Notifications.tsx).

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface ChannelSubscription<TRow = Record<string, unknown>> {
  event?: RealtimeEvent;
  schema?: string;
  table: string;
  filter?: string;
  // Per-subscription handler. Overrides the channel-wide onChange.
  onChange?: (payload: SupabasePayload<TRow>) => void;
}

export interface SupabasePayload<TRow = Record<string, unknown>> {
  schema: string;
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: TRow;
  old: TRow;
}

export interface UseSupabaseChannelOptions<TRow = Record<string, unknown>> {
  name: string;
  enabled?: boolean;
  subscriptions: ChannelSubscription<TRow>[];
  // Channel-wide handler. Called for every subscription that does not
  // declare its own onChange.
  onChange?: (payload: SupabasePayload<TRow>) => void;
}

export function useSupabaseChannel<TRow = Record<string, unknown>>(
  options: UseSupabaseChannelOptions<TRow>,
): void {
  const { name, enabled = true, subscriptions, onChange } = options;

  // The subscriptions array is rebuilt on every render. We re-subscribe
  // when its serialized shape changes so the effect dependency list stays
  // primitive and the channel doesn't churn on every render.
  const subscriptionKey = JSON.stringify(
    subscriptions.map((s) => ({
      event: s.event ?? '*',
      schema: s.schema ?? 'public',
      table: s.table,
      filter: s.filter ?? null,
    })),
  );

  useEffect(() => {
    if (!enabled) return;

    let channel = supabase.channel(name);
    for (const sub of subscriptions) {
      const handler = sub.onChange ?? onChange;
      if (!handler) continue;
      // The supabase-js typings narrow the second arg by event literal,
      // so we cast through unknown to keep the call site one-shot.
      channel = channel.on(
        // deno-lint-ignore no-explicit-any
        'postgres_changes' as unknown as any,
        {
          event: sub.event ?? '*',
          schema: sub.schema ?? 'public',
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        (payload: unknown) => handler(payload as SupabasePayload<TRow>),
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // subscriptionKey captures the structural shape of `subscriptions`;
    // including the array directly would re-subscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled, subscriptionKey, onChange]);
}
