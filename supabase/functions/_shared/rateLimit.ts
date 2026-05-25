/**
 * Shared rate-limit helper for edge functions. Replaces the in-memory
 * sliding-window stores in invite-user, send-push-notification, and
 * rollover-leave-balances, which lose state on isolate cold starts and
 * cannot share across replicas.
 *
 * Backed by the `rate_limits` table and `bump_rate_limit()` RPC introduced
 * in migration 20260524010000_rate_limits.sql. Atomic and durable.
 *
 * Usage:
 *
 *   const limit = await checkRateLimit({
 *     callerId: caller.id,
 *     action: 'invite-user',
 *     maxCalls: 10,
 *     windowSeconds: 3600,
 *     supabaseUrl: Deno.env.get('SUPABASE_URL')!,
 *     serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 *   });
 *   if (!limit.allowed) {
 *     return new Response(
 *       JSON.stringify({ error: limit.message }),
 *       { status: 429, headers: { ...corsHeaders, ...limit.headers } },
 *     );
 *   }
 */

// deno-lint-ignore no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitInput {
  callerId: string;
  action: string;
  maxCalls: number;
  windowSeconds: number;
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  /** Headers to merge into a 429 response. */
  headers: Record<string, string>;
  /** Human-readable message. Only useful when !allowed. */
  message: string;
}

/**
 * Calls bump_rate_limit() with service-role credentials. Fails open (returns
 * allowed=true) if the RPC errors — we prefer a brief budget overshoot to
 * blocking real requests on infrastructure hiccups. The error is logged via
 * console.warn for ops follow-up.
 */
export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
  const {
    callerId,
    action,
    maxCalls,
    windowSeconds,
    supabaseUrl,
    serviceRoleKey,
  } = input;

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // deno-lint-ignore no-explicit-any
  const { data, error } = await (client as any).rpc('bump_rate_limit', {
    p_caller_id: callerId,
    p_action: action,
    p_max_calls: maxCalls,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.warn(`[rateLimit] bump_rate_limit failed for action="${action}": ${error.message}`);
    return failOpen(action, maxCalls, windowSeconds);
  }

  // RPC returns a single-row set; data is either an array or a single row
  // depending on the supabase-js version. Normalize.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    console.warn(`[rateLimit] bump_rate_limit returned no rows for action="${action}"`);
    return failOpen(action, maxCalls, windowSeconds);
  }

  const allowed: boolean = Boolean(row.allowed);
  const remaining: number = Math.max(0, Number(row.remaining ?? 0));
  const resetAtIso: string = row.reset_at
    ? new Date(row.reset_at).toISOString()
    : new Date(Date.now() + windowSeconds * 1000).toISOString();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-RateLimit-Limit': String(maxCalls),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': resetAtIso,
  };
  if (!allowed) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((new Date(resetAtIso).getTime() - Date.now()) / 1000),
    );
    headers['Retry-After'] = String(retryAfterSec);
  }

  return {
    allowed,
    remaining,
    resetAt: resetAtIso,
    headers,
    message: allowed
      ? ''
      : `Rate limit exceeded for ${action}. Try again after ${resetAtIso}.`,
  };
}

function failOpen(action: string, maxCalls: number, windowSeconds: number): RateLimitDecision {
  const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();
  return {
    allowed: true,
    remaining: maxCalls,
    resetAt,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': String(maxCalls),
      'X-RateLimit-Remaining': String(maxCalls),
      'X-RateLimit-Reset': resetAt,
      'X-RateLimit-Failover': 'bump_rate_limit_unavailable',
    },
    message: '',
  };
}
