/**
 * send-push-notification — Supabase Edge Function
 *
 * Sends a push notification to one or more users via FCM (Android) or APNs (iOS).
 * Called by a Supabase Database Webhook on `leave_requests` status changes, or
 * invoked directly from your server-side logic.
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
 *   FCM_SERVER_KEY   — Firebase Cloud Messaging server key (Android)
 *   SUPABASE_URL     — auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY — auto-provided
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { user_ids, title, body: msgBody, path } = body;
  if (!user_ids?.length || !title || !msgBody) {
    return new Response('Missing required fields: user_ids, title, body', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Fetch device tokens for all target users
  const { data: tokenRows, error } = await supabase
    .from('push_tokens')
    .select('user_id, token, platform')
    .in('user_id', user_ids);

  if (error) {
    console.error('[push] fetch tokens error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokens = (tokenRows ?? []) as PushToken[];
  const results: { token: string; ok: boolean; error?: string }[] = [];

  // ── Send via FCM (Android + web tokens) ────────────────────────────────────
  const fcmTokens = tokens.filter(t => t.platform === 'android').map(t => t.token);
  if (fcmTokens.length > 0) {
    const fcmKey = Deno.env.get('FCM_SERVER_KEY');
    if (fcmKey) {
      const fcmPayload = {
        registration_ids: fcmTokens,
        notification: { title, body: msgBody },
        data: path ? { path } : undefined,
      };
      const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `key=${fcmKey}`,
        },
        body: JSON.stringify(fcmPayload),
      });
      results.push({ token: 'fcm_batch', ok: fcmRes.ok });
    }
  }

  // ── iOS APNs tokens: log for future HTTP/2 APNs integration ─────────────────
  const iosTokens = tokens.filter(t => t.platform === 'ios');
  if (iosTokens.length > 0) {
    // TODO: Implement APNs HTTP/2 JWT-based push (requires deno-apns or fetch+jwt)
    console.info(`[push] ${iosTokens.length} iOS token(s) pending APNs implementation`);
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
