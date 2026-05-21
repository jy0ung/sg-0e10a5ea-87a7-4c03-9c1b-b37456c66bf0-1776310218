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

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (non-service-role callers only)
// Max 20 push-notification requests per caller per minute.
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX_CALLS = 20;
const rateLimitStore = new Map<string, number[]>();
let cachedApnsJwt: { token: string; issuedAtSeconds: number } | null = null;

function isRateLimited(callerId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitStore.get(callerId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (timestamps.length >= RATE_MAX_CALLS) return true;
  timestamps.push(now);
  rateLimitStore.set(callerId, timestamps);
  return false;
}
// ---------------------------------------------------------------------------

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
): Promise<{ token: string; ok: boolean; error?: string }[]> {
  const bundleId = Deno.env.get('APNS_BUNDLE_ID');
  const jwt = await getApnsJwt();
  if (!bundleId || !jwt) {
    console.warn('[push] APNs secrets not set — skipping iOS notifications');
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
        console.error(`[push] APNs responded with HTTP ${res.status}`);
      }
      return { token: 'apns', ok: res.ok };
    } catch (apnsErr) {
      console.error('[push] APNs fetch failed:', (apnsErr as Error).message);
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

Deno.serve(async (req: Request) => {
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
    if (isRateLimited(caller.id)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: jsonHeaders,
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
    console.error('[push] fetch tokens error:', error);
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
      console.warn('[push] FCM_SERVER_KEY not set — skipping Android notifications');
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
          console.error(`[push] FCM responded with HTTP ${fcmRes.status}`);
        }
        results.push({ token: 'fcm_batch', ok: fcmRes.ok });
      } catch (fcmErr) {
        console.error('[push] FCM fetch failed:', (fcmErr as Error).message);
        results.push({ token: 'fcm_batch', ok: false, error: 'FCM request failed' });
      }
    }
  }

  const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
  if (iosTokens.length > 0) {
    results.push(...await sendApnsNotification(iosTokens, title, msgBody, path));
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    status: 200,
    headers: jsonHeaders,
  });
});
