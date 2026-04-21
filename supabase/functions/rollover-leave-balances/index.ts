/**
 * rollover-leave-balances
 *
 * Called once per year (e.g. via a pg_cron schedule or manual trigger) to:
 *   1. Read all leave_types for the company (carry_forward flag + default_days).
 *   2. For every active employee in the company:
 *      a. Read their current-year balance.
 *      b. Compute carry-forward days (min(unused, max_carry) if carry_forward=true, else 0).
 *      c. Upsert a leave_balance row for the new year:
 *         entitled_days = default_days + carry_forward_days
 *         used_days     = 0
 *
 * Request body: { company_id: string; from_year: number; to_year: number; max_carry_days?: number }
 *
 * Authorization: requires a valid JWT from a super_admin or company_admin.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

const MAX_CARRY_DEFAULT = 5;

interface RolloverPayload {
  company_id: string;
  from_year: number;
  to_year: number;
  max_carry_days?: number;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller identity
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

    // Admin client (bypasses RLS)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Confirm caller is super_admin or company_admin
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, company_id')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !['super_admin', 'company_admin'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Only administrators can run leave rollovers' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: RolloverPayload = await req.json();
    const { company_id, from_year, to_year, max_carry_days = MAX_CARRY_DEFAULT } = body;

    // Validate input
    if (!company_id || !from_year || !to_year || to_year !== from_year + 1) {
      return new Response(
        JSON.stringify({ error: 'Invalid payload: to_year must equal from_year + 1' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // company_admin can only rollover their own company
    if (callerProfile.role === 'company_admin' && callerProfile.company_id !== company_id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: company mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Fetch all leave types for the company
    const { data: leaveTypes, error: ltError } = await admin
      .from('leave_types')
      .select('id, default_days, carry_forward')
      .eq('company_id', company_id);

    if (ltError) throw ltError;

    // 2. Fetch all active employees for the company
    const { data: employees, error: empError } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', company_id)
      .eq('status', 'active');

    if (empError) throw empError;

    // 3. Fetch all from_year balances for the company in one query
    const employeeIds = (employees ?? []).map(e => e.id);
    const { data: fromBalances, error: balError } = await admin
      .from('leave_balances')
      .select('employee_id, leave_type_id, entitled_days, used_days')
      .eq('year', from_year)
      .in('employee_id', employeeIds);

    if (balError) throw balError;

    // Build lookup: employee_id → leave_type_id → { entitled, used }
    type BalanceKey = `${string}:${string}`;
    const balanceMap = new Map<BalanceKey, { entitled_days: number; used_days: number }>();
    for (const b of (fromBalances ?? [])) {
      const key: BalanceKey = `${b.employee_id}:${b.leave_type_id}`;
      balanceMap.set(key, { entitled_days: b.entitled_days, used_days: b.used_days });
    }

    // 4. Build upsert rows for to_year
    const upsertRows: {
      employee_id: string;
      leave_type_id: string;
      year: number;
      entitled_days: number;
      used_days: number;
    }[] = [];

    for (const emp of (employees ?? [])) {
      for (const lt of (leaveTypes ?? [])) {
        const key: BalanceKey = `${emp.id}:${lt.id}`;
        const prev = balanceMap.get(key);
        const prevUnused = prev ? Math.max(0, prev.entitled_days - prev.used_days) : 0;
        const carryDays  = lt.carry_forward ? Math.min(prevUnused, max_carry_days) : 0;

        upsertRows.push({
          employee_id:   emp.id,
          leave_type_id: lt.id,
          year:          to_year,
          entitled_days: (lt.default_days ?? 0) + carryDays,
          used_days:     0,
        });
      }
    }

    // 5. Upsert in batches of 500 to stay within request limits
    const BATCH = 500;
    let totalUpserted = 0;
    for (let i = 0; i < upsertRows.length; i += BATCH) {
      const batch = upsertRows.slice(i, i + BATCH);
      const { error: upsertError } = await admin
        .from('leave_balances')
        .upsert(batch, { onConflict: 'employee_id,leave_type_id,year' });
      if (upsertError) throw upsertError;
      totalUpserted += batch.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        from_year,
        to_year,
        employees_processed: (employees ?? []).length,
        leave_types_processed: (leaveTypes ?? []).length,
        rows_upserted: totalUpserted,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
