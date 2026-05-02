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

  const iosTokens = tokens.filter((t) => t.platform === 'ios');
  if (iosTokens.length > 0) {
    console.info(`[push] ${iosTokens.length} iOS token(s) pending APNs implementation`);
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    status: 200,
    headers: jsonHeaders,
  });
});
