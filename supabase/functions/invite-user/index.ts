import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { resolveInviteSiteUrl } from '../_shared/publicSiteUrl.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { withRequestLogging } from '../_shared/logger.ts';

interface InvitePayload {
  email: string;
  name: string;
  role: string;
  company_id: string;
  branch_id?: string | null;
  access_scope?: string;
  employee_id?: string | null;
  portal_access_only?: boolean;
}

function isMissingEmployeeLinkColumnError(message: string | null | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return text.includes('column profiles.employee_id does not exist') || text.includes('employee_id');
}

function isEmailDeliveryError(message: string | null | undefined): boolean {
  return /send(ing)? invite email|send(ing)? email|smtp|email/i.test(message ?? '');
}

// Durable rate limit: 10 invites per caller per hour. Backed by the
// `rate_limits` table via bump_rate_limit() so the budget survives isolate
// cold starts and is shared across replicas.
const RATE_MAX_CALLS = 10;
const RATE_WINDOW_SECONDS = 60 * 60;

Deno.serve(withRequestLogging('invite-user', async ({ req }) => {
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
    const supabaseApiUrl = Deno.env.get('SUPABASE_API_EXTERNAL_URL') || supabaseUrl;
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

    // Rate-limit: max 10 invites per authenticated user per hour.
    const limit = await checkRateLimit({
      callerId: caller.id,
      action: 'invite-user',
      maxCalls: RATE_MAX_CALLS,
      windowSeconds: RATE_WINDOW_SECONDS,
      supabaseUrl,
      serviceRoleKey,
    });
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: limit.message }),
        { status: 429, headers: { ...corsHeaders, ...limit.headers } },
      );
    }

    const forwardedHost = req.headers.get('x-forwarded-host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    const forwardedOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : null;

    // Prefer configured public URLs, but ignore loopback/internal values when
    // the request clearly came from a public browser origin.
    const siteUrl = resolveInviteSiteUrl({
      envSiteUrls: [
        Deno.env.get('APP_URL'),
        Deno.env.get('SITE_URL'),
        Deno.env.get('VITE_APP_URL'),
        Deno.env.get('VITE_SITE_URL'),
      ],
      requestOrigin: req.headers.get('origin') || forwardedOrigin,
    });

    // Create admin client with service role key (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Use the Supabase API origin for Admin Auth calls. Email action-link
    // origins are controlled by GoTrue site/external URL config plus redirectTo.
    const inviteClient = createClient(supabaseApiUrl, serviceRoleKey, {
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
    const { email, name, role, company_id, branch_id, access_scope, employee_id, portal_access_only } = body;

    if (!email || !name || !role || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, name, role, company_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const roleDefaultScopes: Record<string, string> = {
      super_admin: 'global',
      company_admin: 'company',
      director: 'company',
      general_manager: 'company',
      manager: 'branch',
      sales: 'self',
      accounts: 'company',
      analyst: 'company',
      creator_updater: 'branch',
      portal_admin: 'company',
      portal_manager: 'company',
      portal_staff: 'self',
    };
    if (!(role in roleDefaultScopes)) {
      return new Response(
        JSON.stringify({ error: `Invalid role: ${role}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const finalScope = access_scope || roleDefaultScopes[role] || 'company';
    const requiresBranch = finalScope !== 'global';

    if (requiresBranch && !branch_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: branch_id' }),
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

    if (branch_id) {
      const { data: selectedBranch, error: branchError } = await adminClient
        .from('branches')
        .select('id, company_id')
        .eq('id', branch_id)
        .eq('company_id', company_id)
        .maybeSingle();

      if (branchError) {
        return new Response(
          JSON.stringify({ error: `Failed to validate branch assignment: ${branchError.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (!selectedBranch) {
        return new Response(
          JSON.stringify({ error: 'Selected branch is not valid for this company' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const redirectTo = `${siteUrl.replace(/\/$/, '')}/signup`;

    let emailDeliveryStatus: 'sent' | 'link_generated' = 'sent';
    let inviteLink: string | null = null;

    // Invite the user via Supabase Admin API.
    let { data: inviteData, error: inviteError } = await inviteClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { name, role, company_id },
        redirectTo,
      },
    );

    if (inviteError) {
      if (!isEmailDeliveryError(inviteError.message)) {
        return new Response(
          JSON.stringify({ error: inviteError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const generated = await inviteClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { name, role, company_id },
          redirectTo,
        },
      });

      if (generated.error) {
        return new Response(
          JSON.stringify({ error: generated.error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      inviteData = generated.data;
      inviteError = null;
      emailDeliveryStatus = 'link_generated';
      inviteLink = generated.data.properties?.action_link ?? null;
    }

    // Update the profile with role, company_id, and access_scope
    // The handle_new_user trigger creates the profile row automatically
    if (inviteData.user) {
      const profilePatch = {
        id: inviteData.user.id,
        email,
        name,
        role,
        company_id,
        branch_id: branch_id ?? null,
        access_scope: finalScope,
        status: 'pending',
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

      await adminClient.from('audit_logs').insert({
        user_id: caller.id,
        action: 'create',
        entity_type: 'profile',
        entity_id: inviteData.user.id,
        changes: {
          component: 'invite-user edge function',
          email,
          role,
          company_id,
          branch_id,
          access_scope: finalScope,
          status: 'pending',
          portal_access_only: portal_access_only ?? false,
          email_delivery_status: emailDeliveryStatus,
        },
        table_name: 'user_actions',
      });
    }

    return new Response(
      JSON.stringify({
        message: emailDeliveryStatus === 'sent' ? `Invitation sent to ${email}` : `Invitation link generated for ${email}`,
        user_id: inviteData.user?.id,
        invite_link: inviteLink,
        email_delivery_status: emailDeliveryStatus,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));
