/**
 * send-push-notification — Supabase Edge Function
 *
 * Sends a push notification to one or more users via FCM (Android) or APNs (iOS).
 * Called by a Supabase Database Webhook on `leave_requests` status changes, or
 * invoked directly from server-side logic.
 *
 * Expected request body:
 * {
 *   "user_ids": ["uuid1", "uuid2"],
 *   "title":    "Leave Approved",
 *   "body":     "Your 3-day leave request has been approved.",
 *   "path":     "/leave/history"   // optional deep-link path
 * }
 *
 * Environment secrets (set in Supabase Dashboard → Settings → Edge Functions):
 *   FCM_SERVER_KEY             — Firebase Cloud Messaging server key (Android)
 *   APNS_TEAM_ID               — Apple Developer Team ID (iOS)
 *   APNS_KEY_ID                — APNs Auth Key ID (iOS)
 *   APNS_PRIVATE_KEY           — APNs .p8 private key PEM; escaped \n is accepted (iOS)
 *   APNS_BUNDLE_ID             — iOS app bundle identifier / APNs topic (iOS)
 *   APNS_USE_SANDBOX           — "true" to use api.sandbox.push.apple.com (optional)
 *   SUPABASE_URL               — auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-provided
 *   SUPABASE_ANON_KEY          — auto-provided
 *   ALLOWED_ORIGINS            — comma-separated CORS allow-list (optional)
 *
 * Authorization model (Phase 0 hotfix):
 *   1. Service role callers (DB webhooks) are trusted — identified by the
 *      `Authorization: Bearer <service_role_key>` header.
 *   2. End-user callers must present a valid user JWT; their `profiles.role`
 *      must be in {super_admin, company_admin, general_manager, manager} and
 *      every requested `user_id` must belong to the caller's company (or the
 *      caller must have global access_scope).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { withRequestLogging, type EdgeLogger } from '../_shared/logger.ts';

interface RequestBody {
  user_ids: string[];
  title:    string;
  body:     string;
  path?:    string;
}

interface PushToken {
  user_id:  string;
  token:    string;
  platform: 'ios' | 'android' | 'web';
}

const NOTIFY_ROLES = new Set([
  'super_admin',
  'company_admin',
  'general_manager',
  'manager',
]);

// Durable rate limit for non-service-role callers: 20 push requests per
// minute. Service-role callers (DB webhooks, edge functions calling this
// function) are exempt. Backed by the `rate_limits` table via
// bump_rate_limit().
const RATE_MAX_CALLS = 20;
const RATE_WINDOW_SECONDS = 60;

let cachedApnsJwt: { token: string; issuedAtSeconds: number } | null = null;

function base64Url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function getApnsJwt() {
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const keyId = Deno.env.get('APNS_KEY_ID');
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
  if (!teamId || !keyId || !privateKey) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && nowSeconds - cachedApnsJwt.issuedAtSeconds < 50 * 60) {
    return cachedApnsJwt.token;
  }

  const encodedHeader = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const encodedPayload = base64Url(JSON.stringify({ iss: teamId, iat: nowSeconds }));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  cachedApnsJwt = {
    token: `${signingInput}.${base64Url(signature)}`,
    issuedAtSeconds: nowSeconds,
  };
  return cachedApnsJwt.token;
}

async function sendApnsNotification(
  tokens: string[],
  title: string,
  msgBody: string,
  path: string | undefined,
  log: EdgeLogger,
): Promise<{ token: string; ok: boolean; error?: string }[]> {
  const bundleId = Deno.env.get('APNS_BUNDLE_ID');
  const jwt = await getApnsJwt();
  if (!bundleId || !jwt) {
    log.warn('apns.skipped', { reason: 'secrets_missing' });
    return tokens.map(() => ({ token: 'apns', ok: false, error: 'APNs is not configured' }));
  }

  const host = Deno.env.get('APNS_USE_SANDBOX') === 'true'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';
  const payload = {
    aps: {
      alert: { title, body: msgBody },
      sound: 'default',
    },
    ...(path ? { path } : {}),
  };

  const results = await Promise.all(tokens.map(async (token) => {
    try {
      const res = await fetch(`${host}/3/device/${token}`, {
        method: 'POST',
        headers: {
          'authorization': `bearer ${jwt}`,
          'apns-topic': bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        log.error('apns.http_error', { status: res.status });
      }
      return { token: 'apns', ok: res.ok };
    } catch (apnsErr) {
      log.error('apns.fetch_failed', { error: (apnsErr as Error).message });
      return { token: 'apns', ok: false, error: 'APNs request failed' };
    }
  }));

  return results;
}

// ---------------------------------------------------------------------------
// Startup assertion — warn once on cold start if FCM key is absent so the
// issue surfaces in function logs rather than silently dropping notifications.
// ---------------------------------------------------------------------------
if (!Deno.env.get('FCM_SERVER_KEY')) {
  console.warn(
    '[push:startup] FCM_SERVER_KEY is not configured — Android push ' +
    'notifications will be silently skipped. Set the secret in Supabase ' +
    'Dashboard → Settings → Edge Functions and redeploy.',
  );
}

Deno.serve(withRequestLogging('send-push-notification', async ({ req, log }) => {
  const corsHeaders = buildCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }
  const bearer = authHeader.slice('Bearer '.length).trim();

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const { user_ids, title, body: msgBody, path } = body;
  if (!Array.isArray(user_ids) || user_ids.length === 0 || !title || !msgBody) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: user_ids, title, body' }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const isServiceRole = bearer === serviceRoleKey;

  if (!isServiceRole) {
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, company_id, access_scope')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !NOTIFY_ROLES.has(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    // Rate limit user JWT callers — DB webhooks (service role) are exempt
    const limit = await checkRateLimit({
      callerId: caller.id,
      action: 'send-push-notification',
      maxCalls: RATE_MAX_CALLS,
      windowSeconds: RATE_WINDOW_SECONDS,
      supabaseUrl,
      serviceRoleKey,
    });
    if (!limit.allowed) {
      return new Response(JSON.stringify({ error: limit.message }), {
        status: 429,
        headers: { ...corsHeaders, ...limit.headers },
      });
    }

    if (callerProfile.access_scope !== 'global') {
      const { data: recipients, error: rcpErr } = await admin
        .from('profiles')
        .select('id, company_id')
        .in('id', user_ids);
      if (rcpErr) {
        return new Response(JSON.stringify({ error: rcpErr.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
      const foreign = (recipients ?? []).filter(
        (r) => r.company_id !== callerProfile.company_id,
      );
      const missing = user_ids.filter(
        (id) => !(recipients ?? []).some((r) => r.id === id),
      );
      if (foreign.length > 0 || missing.length > 0) {
        return new Response(
          JSON.stringify({ error: 'One or more recipients are outside your company scope' }),
          { status: 403, headers: jsonHeaders },
        );
      }
    }
  }

  const { data: tokenRows, error } = await admin
    .from('push_tokens')
    .select('user_id, token, platform')
    .in('user_id', user_ids);

  if (error) {
    log.error('push.fetch_tokens_failed', { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const tokens = (tokenRows ?? []) as PushToken[];
  const results: { token: string; ok: boolean; error?: string }[] = [];

  const fcmTokens = tokens.filter((t) => t.platform === 'android').map((t) => t.token);
  if (fcmTokens.length > 0) {
    const fcmKey = Deno.env.get('FCM_SERVER_KEY');
    if (!fcmKey) {
      log.warn('fcm.skipped', { reason: 'FCM_SERVER_KEY not set' });
    } else {
      const fcmPayload = {
        registration_ids: fcmTokens,
        notification: { title, body: msgBody },
        data: path ? { path } : undefined,
      };
      try {
        const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `key=${fcmKey}`,
          },
          body: JSON.stringify(fcmPayload),
        });
        if (!fcmRes.ok) {
          // Log status only — never log the key or response body (may echo key errors)
          log.error('fcm.http_error', { status: fcmRes.status });
        }
        results.push({ token: 'fcm_batch', ok: fcmRes.ok });
      } catch (fcmErr) {
        log.error('fcm.fetch_failed', { error: (fcmErr as Error).message });
        results.push({ token: 'fcm_batch', ok: false, error: 'FCM request failed' });
      }
    }
  }

  const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
  if (iosTokens.length > 0) {
    results.push(...await sendApnsNotification(iosTokens, title, msgBody, path, log));
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    status: 200,
    headers: jsonHeaders,
  });
}));
