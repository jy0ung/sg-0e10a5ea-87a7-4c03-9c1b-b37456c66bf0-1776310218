/**
 * webhook-deliverer — Supabase Edge Function (Phase 6a)
 *
 * Drains the public.webhook_outbox queue. Claims a batch of due rows
 * (next_retry_at <= now() and status in ('pending', 'failed')), POSTs the
 * payload to the endpoint URL with an HMAC-SHA256 signature, and either
 * marks the row delivered or schedules an exponential-backoff retry.
 *
 * Invocation:
 *   • Operator cron (e.g. pg_cron schedule '*\/1 * * * *' invokes this via
 *     supabase functions invoke; or a Cloudflare cron triggers the HTTPS
 *     endpoint with the service-role bearer).
 *   • POST body is empty; an optional ?limit=N query param caps the batch
 *     size (default 25, hard max 100).
 *
 * Authorization:
 *   Service-role only. Any non-service-role caller is rejected.
 *
 * Backoff:
 *   attempt 1 → 1 min, 2 → 5 min, 3 → 15 min, 4 → 1 h, 5 → 6 h,
 *   6 → 24 h, 7 → 48 h, 8 → 96 h → status='dead'.
 *
 * Signing:
 *   Header `X-Webhook-Signature: t=<unix>,v1=<hex(hmac_sha256(secret, t.body))>`
 *   The receiver MUST recompute and constant-time compare to defend against
 *   replays older than ~5 minutes.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRequestLogging, type EdgeLogger } from '../_shared/logger.ts';

const BACKOFF_SECONDS = [60, 300, 900, 3600, 21600, 86400, 172800, 345600];
const MAX_ATTEMPTS    = BACKOFF_SECONDS.length;

interface OutboxRow {
  id:               string;
  endpoint_id:      string;
  company_id:       string;
  event_type:       string;
  payload:          Record<string, unknown>;
  attempts:         number;
  endpoint_url:     string;
  endpoint_secret:  string;
  endpoint_active:  boolean;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function signingHeader(timestamp: number, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
}

interface DeliveryOutcome {
  ok:           boolean;
  status:       number | null;
  errorMessage: string | null;
}

async function deliver(row: OutboxRow, log: EdgeLogger): Promise<DeliveryOutcome> {
  const ts   = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id:         row.id,
    event_type: row.event_type,
    company_id: row.company_id,
    emitted_at: new Date().toISOString(),
    data:       row.payload,
  });
  const sig = await hmacHex(row.endpoint_secret, `${ts}.${body}`);

  try {
    const res = await fetch(row.endpoint_url, {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'X-Webhook-Signature':  signingHeader(ts, sig),
        'X-Webhook-Event':      row.event_type,
        'X-Webhook-Delivery-Id': row.id,
      },
      body,
      // Cap the receiver's response time so a hung endpoint can't stall
      // the worker. AbortController is the portable knob in Deno/Edge.
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      log.info('delivery.ok', { delivery_id: row.id, endpoint_id: row.endpoint_id, status: res.status });
      return { ok: true, status: res.status, errorMessage: null };
    }

    log.warn('delivery.non_2xx', { delivery_id: row.id, endpoint_id: row.endpoint_id, status: res.status });
    return { ok: false, status: res.status, errorMessage: `HTTP ${res.status}` };
  } catch (err) {
    const msg = (err as Error)?.message ?? 'fetch failed';
    log.error('delivery.fetch_failed', { delivery_id: row.id, endpoint_id: row.endpoint_id, error: msg });
    return { ok: false, status: null, errorMessage: msg };
  }
}

Deno.serve(withRequestLogging('webhook-deliverer', async ({ req, log }) => {
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer     = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url   = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25));

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Claim a batch atomically: set status='delivering' so a concurrent run
  // doesn't grab the same rows. PostgREST RPC could express this more
  // tightly, but a simple UPDATE…RETURNING is sufficient at this volume.
  const { data: claimed, error: claimErr } = await admin
    .from('webhook_outbox')
    .update({ status: 'delivering', updated_at: new Date().toISOString() })
    .in('status', ['pending', 'failed'])
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(limit)
    .select(`
      id, endpoint_id, company_id, event_type, payload, attempts,
      endpoint:webhook_endpoints!inner ( url, secret, active )
    `);

  if (claimErr) {
    log.error('outbox.claim_failed', { error: claimErr.message });
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows: OutboxRow[] = (claimed ?? []).map((r: Record<string, unknown>) => {
    const ep = (r.endpoint as Record<string, unknown>) ?? {};
    return {
      id:              String(r.id),
      endpoint_id:     String(r.endpoint_id),
      company_id:      String(r.company_id),
      event_type:      String(r.event_type),
      payload:         (r.payload as Record<string, unknown>) ?? {},
      attempts:        Number(r.attempts ?? 0),
      endpoint_url:    String(ep.url ?? ''),
      endpoint_secret: String(ep.secret ?? ''),
      endpoint_active: Boolean(ep.active),
    };
  });

  log.info('batch.claimed', { count: rows.length });

  let delivered = 0;
  let failed    = 0;

  for (const row of rows) {
    // Skip deactivated endpoints — schedule far into the future so they
    // drop out of the worker's hot path until reactivated.
    if (!row.endpoint_active) {
      await admin.from('webhook_outbox').update({
        status:        'pending',
        next_retry_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updated_at:    new Date().toISOString(),
      }).eq('id', row.id);
      continue;
    }

    const outcome = await deliver(row, log);
    const nextAttempt = row.attempts + 1;

    if (outcome.ok) {
      delivered++;
      await admin.from('webhook_outbox').update({
        status:               'delivered',
        attempts:             nextAttempt,
        last_response_status: outcome.status,
        delivered_at:         new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      }).eq('id', row.id);
      await admin.from('webhook_endpoints').update({
        last_success_at:      new Date().toISOString(),
        consecutive_failures: 0,
        updated_at:           new Date().toISOString(),
      }).eq('id', row.endpoint_id);
    } else {
      failed++;
      const isDead         = nextAttempt >= MAX_ATTEMPTS;
      const backoffSeconds = BACKOFF_SECONDS[Math.min(nextAttempt, BACKOFF_SECONDS.length) - 1] ?? 0;
      await admin.from('webhook_outbox').update({
        status:               isDead ? 'dead' : 'failed',
        attempts:             nextAttempt,
        last_error:           outcome.errorMessage,
        last_response_status: outcome.status,
        next_retry_at:        isDead
          ? new Date().toISOString()
          : new Date(Date.now() + backoffSeconds * 1000).toISOString(),
        updated_at:           new Date().toISOString(),
      }).eq('id', row.id);
      // Service role bypasses RLS; bump the per-endpoint failure counter
      // and last_failure_at so the admin UI can flag unhealthy endpoints.
      await admin.from('webhook_endpoints')
        .update({
          last_failure_at:      new Date().toISOString(),
          consecutive_failures: row.attempts + 1,
          updated_at:           new Date().toISOString(),
        })
        .eq('id', row.endpoint_id);
    }
  }

  return new Response(JSON.stringify({
    claimed:   rows.length,
    delivered,
    failed,
  }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  });
}));
