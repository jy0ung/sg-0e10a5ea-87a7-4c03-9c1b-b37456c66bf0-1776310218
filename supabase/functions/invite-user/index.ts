import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface InvitePayload {
  email: string;
  name: string;
  role: string;
  company_id: string;
  access_scope?: string;
}

Deno.serve(async (req: Request) => {
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

    // Check caller has admin role
    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('role')
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
    const { email, name, role, company_id, access_scope } = body;

    if (!email || !name || !role || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, name, role, company_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Determine the signup redirect URL
    // Use the site URL from env or the request origin
    const siteUrl = Deno.env.get('SITE_URL')
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

      await adminClient
        .from('profiles')
        .update({
          name,
          role,
          company_id,
          access_scope: finalScope,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inviteData.user.id);
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
