import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface DeleteUserPayload {
  user_id: string;
  action?: 'delete' | 'update_status';
  status?: 'active' | 'inactive';
  reason?: string | null;
}

const ADMIN_ROLES = ['super_admin', 'company_admin'];
const LONG_BAN_DURATION = '876000h';

interface AuthBanResult {
  attempted: boolean;
  updated: boolean;
  error: string | null;
}

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
    const action = body.action ?? 'delete';
    const nextStatus = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

    if (!targetUserId || !isUuid(targetUserId)) {
      return jsonResponse({ error: 'Missing or invalid user_id' }, 400, corsHeaders);
    }

    if (action !== 'delete' && action !== 'update_status') {
      return jsonResponse({ error: 'Unsupported user account action' }, 400, corsHeaders);
    }

    if (action === 'update_status' && nextStatus !== 'active' && nextStatus !== 'inactive') {
      return jsonResponse({ error: 'Status must be active or inactive' }, 400, corsHeaders);
    }

    if (targetUserId === caller.id) {
      return jsonResponse({ error: action === 'update_status' ? 'You cannot change your own account status' : 'You cannot delete your own account' }, 400, corsHeaders);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('id, role, company_id, status')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
      return jsonResponse({ error: action === 'update_status' ? 'Only administrators can change user account status' : 'Only administrators can delete users' }, 403, corsHeaders);
    }

    if (callerProfile.status !== 'active') {
      return jsonResponse({ error: 'Your administrator account is not active' }, 403, corsHeaders);
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

    if (callerProfile.role === 'company_admin') {
      if (!callerProfile.company_id || callerProfile.company_id !== targetProfile.company_id) {
        return jsonResponse({ error: 'Forbidden: company mismatch' }, 403, corsHeaders);
      }

      if (targetProfile.role === 'super_admin' || targetProfile.access_scope === 'global') {
        return jsonResponse({ error: action === 'update_status' ? 'Company administrators cannot change global user account status' : 'Company administrators cannot delete global users' }, 403, corsHeaders);
      }
    }

    if (action === 'update_status') {
      if (targetProfile.role === 'super_admin' && callerProfile.role !== 'super_admin') {
        return jsonResponse({ error: 'Only super admins can change super admin account status' }, 403, corsHeaders);
      }

      if (targetProfile.role === 'super_admin' && nextStatus === 'inactive') {
        const { count, error: countError } = await adminClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'super_admin')
          .eq('status', 'active')
          .neq('id', targetUserId);

        if (countError) {
          return jsonResponse({ error: countError.message }, 500, corsHeaders);
        }

        if ((count ?? 0) < 1) {
          return jsonResponse({ error: 'At least one active super admin account is required' }, 409, corsHeaders);
        }
      }

      const authBanResult: AuthBanResult = { attempted: false, updated: false, error: null };
      const { data: targetAuth, error: targetAuthError } = await adminClient.auth.admin.getUserById(targetUserId);
      if (targetAuthError || !targetAuth.user) {
        authBanResult.error = targetAuthError?.message ?? 'Auth user not found';
      } else {
        authBanResult.attempted = true;
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: nextStatus === 'inactive' ? LONG_BAN_DURATION : 'none',
        });
        if (authUpdateError) {
          authBanResult.error = authUpdateError.message;
        } else {
          authBanResult.updated = true;
        }
      }

      const { error: updateError } = await adminClient
        .from('profiles')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', targetUserId);

      if (updateError) {
        if (nextStatus === 'inactive' && authBanResult.updated) {
          await adminClient.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
        }
        return jsonResponse({ error: updateError.message }, 500, corsHeaders);
      }

      await adminClient.from('audit_logs').insert({
        user_id: caller.id,
        action: 'update',
        entity_type: 'profile',
        entity_id: targetUserId,
        changes: {
          component: 'delete-user edge function account status action',
          email: targetProfile.email,
          previous_status: targetProfile.status,
          next_status: nextStatus,
          auth_ban_attempted: authBanResult.attempted,
          auth_ban_updated: authBanResult.updated,
          auth_ban_error: authBanResult.error,
          reason,
        },
        table_name: 'user_actions',
      });

      return jsonResponse({
        message: `${targetProfile.email} ${nextStatus === 'inactive' ? 'deactivated' : 'reactivated'}`,
        status: nextStatus,
        auth_ban_updated: authBanResult.updated,
        auth_ban_error: authBanResult.error,
      }, 200, corsHeaders);
    }

    if (targetProfile.role === 'super_admin') {
      return jsonResponse({ error: 'Super admin accounts cannot be deleted here' }, 403, corsHeaders);
    }

    if (targetProfile.access_scope === 'global' && callerProfile.role !== 'super_admin') {
      return jsonResponse({ error: 'Company administrators cannot delete global users' }, 403, corsHeaders);
    }

    const { data: targetAuth, error: targetAuthError } = await adminClient.auth.admin.getUserById(targetUserId);
    if (targetAuthError || !targetAuth.user) {
      return jsonResponse({ error: targetAuthError?.message ?? 'Auth user not found' }, 404, corsHeaders);
    }

    const isDeactivated = targetProfile.status === 'inactive';
    if (targetAuth.user.last_sign_in_at && !isDeactivated) {
      return jsonResponse(
        { error: 'This user has already signed in. Deactivate the user before deleting their account.' },
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

    return jsonResponse({ message: `Deleted user ${targetProfile.email}` }, 200, corsHeaders);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500,
      corsHeaders,
    );
  }
});