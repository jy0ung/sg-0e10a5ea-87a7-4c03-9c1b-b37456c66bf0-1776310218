import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface DeleteUserPayload {
  user_id: string;
}

const ADMIN_ROLES = ['super_admin', 'company_admin'];

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const body: DeleteUserPayload = await req.json();
    const targetUserId = body.user_id;

    if (!targetUserId || !isUuid(targetUserId)) {
      return jsonResponse({ error: 'Missing or invalid user_id' }, 400, corsHeaders);
    }

    if (targetUserId === caller.id) {
      return jsonResponse({ error: 'You cannot delete your own account' }, 400, corsHeaders);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('id, role, company_id')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
      return jsonResponse({ error: 'Only administrators can delete invited users' }, 403, corsHeaders);
    }

    const { data: targetProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, email, name, role, company_id, access_scope, status')
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500, corsHeaders);
    }

    if (!targetProfile) {
      return jsonResponse({ error: 'User profile not found' }, 404, corsHeaders);
    }

    if (targetProfile.role === 'super_admin') {
      return jsonResponse({ error: 'Super admin accounts cannot be deleted here' }, 403, corsHeaders);
    }

    if (callerProfile.role === 'company_admin') {
      if (!callerProfile.company_id || callerProfile.company_id !== targetProfile.company_id) {
        return jsonResponse({ error: 'Forbidden: company mismatch' }, 403, corsHeaders);
      }

      if (targetProfile.access_scope === 'global') {
        return jsonResponse({ error: 'Company administrators cannot delete global users' }, 403, corsHeaders);
      }
    }

    const { data: targetAuth, error: targetAuthError } = await adminClient.auth.admin.getUserById(targetUserId);
    if (targetAuthError || !targetAuth.user) {
      return jsonResponse({ error: targetAuthError?.message ?? 'Auth user not found' }, 404, corsHeaders);
    }

    if (targetAuth.user.last_sign_in_at) {
      return jsonResponse(
        { error: 'This user has already signed in. Deactivate the user instead of deleting their account.' },
        409,
        corsHeaders,
      );
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500, corsHeaders);
    }

    await adminClient.from('audit_logs').insert({
      user_id: caller.id,
      action: 'delete',
      entity_type: 'profile',
      entity_id: targetUserId,
      changes: {
        component: 'delete-user edge function',
        email: targetProfile.email,
        status: targetProfile.status,
      },
      table_name: 'user_actions',
    });

    return jsonResponse({ message: `Deleted invited user ${targetProfile.email}` }, 200, corsHeaders);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500,
      corsHeaders,
    );
  }
});