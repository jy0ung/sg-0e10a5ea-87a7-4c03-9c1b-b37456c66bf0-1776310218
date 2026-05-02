import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface InvitePayload {
  email: string;
  name: string;
  role: string;
  company_id: string;
  access_scope?: string;
  employee_id?: string | null;
  portal_access_only?: boolean;
}

function isMissingEmployeeLinkColumnError(message: string | null | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return text.includes('column profiles.employee_id does not exist') || text.includes('employee_id');
}

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter
// Max 10 invites per caller per hour. Resets on isolate restart (acceptable).
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_CALLS = 10;
const rateLimitStore = new Map<string, number[]>();

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

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create a client with the caller's JWT to verify their identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Rate-limit: max 10 invites per authenticated user per hour
    if (isRateLimited(caller.id)) {
      return new Response(
        JSON.stringify({ error: 'Too many invite requests. Please wait before trying again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' } },
      );
    }

    // Create admin client with service role key (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check caller has admin role — use service role to bypass RLS
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !['super_admin', 'company_admin'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Only administrators can invite users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Parse request body
    const body: InvitePayload = await req.json();
    const { email, name, role, company_id, access_scope, employee_id, portal_access_only } = body;

    if (!email || !name || !role || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, name, role, company_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (callerProfile.role === 'company_admin') {
      if (callerProfile.company_id !== company_id) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: company mismatch' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (role === 'super_admin' || access_scope === 'global') {
        return new Response(
          JSON.stringify({ error: 'Company administrators cannot grant global access' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Determine the signup redirect URL
    // Use the site URL from env or the request origin
    const siteUrl = Deno.env.get('APP_URL')
      || Deno.env.get('SITE_URL')
      || Deno.env.get('VITE_APP_URL')
      || Deno.env.get('VITE_SITE_URL')
      || req.headers.get('origin')
      || 'http://localhost:3000';

    const redirectTo = `${siteUrl.replace(/\/$/, '')}/signup`;

    // Invite the user via Supabase Admin API
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { name, role, company_id },
        redirectTo,
      },
    );

    if (inviteError) {
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Update the profile with role, company_id, and access_scope
    // The handle_new_user trigger creates the profile row automatically
    if (inviteData.user) {
      const roleDefaultScopes: Record<string, string> = {
        super_admin: 'global',
        company_admin: 'company',
        director: 'company',
        general_manager: 'company',
        manager: 'branch',
        sales: 'self',
        accounts: 'company',
        analyst: 'company',
      };

      const finalScope = access_scope || roleDefaultScopes[role] || 'company';

      const profilePatch = {
        id: inviteData.user.id,
        email,
        name,
        role,
        company_id,
        access_scope: finalScope,
        status: 'active',
        portal_access_only: portal_access_only ?? false,
        updated_at: new Date().toISOString(),
        ...(employee_id ? { employee_id } : {}),
      };

      let { error: profileError } = await adminClient
        .from('profiles')
        .upsert(profilePatch, { onConflict: 'id' });

      if (profileError && employee_id && isMissingEmployeeLinkColumnError(profileError.message)) {
        const { employee_id: _employeeId, ...fallbackPatch } = profilePatch;
        const retry = await adminClient
          .from('profiles')
          .upsert(fallbackPatch, { onConflict: 'id' });
        profileError = retry.error;
      }

      if (profileError) {
        return new Response(
          JSON.stringify({ error: `Invitation created, but profile setup failed: ${profileError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        message: `Invitation sent to ${email}`,
        user_id: inviteData.user?.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
