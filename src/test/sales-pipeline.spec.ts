/**
 * Focused integration tests for the Sales Pipeline Foundation RPCs:
 *   • transition_sales_order_stage() — audited stage move with company scoping
 *   • get_sales_pipeline_summary()   — per-stage counts and values
 *   • get_sales_dashboard_summary()  — server-side Sales Dashboard KPIs
 *
 * Run with:
 *   RLS_E2E=1 \
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 \
 *   VITE_SUPABASE_ANON_KEY=<anon> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   RLS_USER_A_EMAIL=a@rls.test RLS_USER_A_PASSWORD=Test1234! \
 *   RLS_USER_B_EMAIL=b@rls.test RLS_USER_B_PASSWORD=Test1234! \
 *   npx vitest run --config vitest.rls.config.ts src/test/sales-pipeline.spec.ts
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const shouldRun = process.env.RLS_E2E === '1';
const describeIfLive = shouldRun ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Session {
  client: SupabaseClient;
  userId: string;
  companyId: string;
}

function makeServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key, { auth: { persistSession: false } });
}

async function signInAs(email: string, password: string): Promise<Session> {
  const url  = process.env.VITE_SUPABASE_URL ?? '';
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  const { data: profile, error: profErr } = await client
    .from('profiles')
    .select('company_id')
    .eq('id', data.user.id)
    .single();
  if (profErr || !profile?.company_id)
    throw new Error(`Profile/company missing for ${email}: ${profErr?.message}`);
  return { client, userId: data.user.id, companyId: profile.company_id as string };
}

// =============================================================================
// transition_sales_order_stage() — audited pipeline stage transition
// =============================================================================
describeIfLive('transition_sales_order_stage() — audited pipeline move', () => {
  let svc: SupabaseClient;
  let userA: Session;
  let userB: Session;

  const cleanup = {
    orderIds:  [] as string[],
    stageIds:  [] as string[],
    auditIds:  [] as string[],
  };

  beforeAll(async () => {
    svc   = makeServiceClient();
    userA = await signInAs(process.env.RLS_USER_A_EMAIL ?? 'a@rls.test', process.env.RLS_USER_A_PASSWORD ?? 'Test1234!');
    userB = await signInAs(process.env.RLS_USER_B_EMAIL ?? 'b@rls.test', process.env.RLS_USER_B_PASSWORD ?? 'Test1234!');
  });

  afterAll(async () => {
    if (cleanup.auditIds.length > 0) {
      await svc.from('audit_logs').delete().in('id', cleanup.auditIds);
    }
    if (cleanup.orderIds.length > 0) {
      await svc.from('sales_orders').delete().in('id', cleanup.orderIds);
    }
    if (cleanup.stageIds.length > 0) {
      await svc.from('deal_stages').delete().in('id', cleanup.stageIds);
    }
  });

  async function seedStage(companyId: string, name: string, order: number) {
    const { data, error } = await svc
      .from('deal_stages')
      .insert({ company_id: companyId, name, stage_order: order, color: '#aaaaaa' })
      .select('id')
      .single();
    if (error) throw new Error(`seedStage failed: ${error.message}`);
    cleanup.stageIds.push(data!.id);
    return data!.id;
  }

  async function seedOrder(companyId: string, suffix: string, stageId?: string) {
    const { data, error } = await svc
      .from('sales_orders')
      .insert({
        company_id:   companyId,
        order_no:     `PIPE-${suffix}`,
        salesman_name:'Pipeline Test',
        branch_code:  'KK',
        model:        'Saga',
        booking_date: '2026-05-01',
        stage_id:      stageId ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seedOrder failed: ${error.message}`);
    cleanup.orderIds.push(data!.id);
    return data!.id;
  }

  // -------------------------------------------------------------------------
  // Happy path: stage changes + audit log written
  // -------------------------------------------------------------------------
  it('transitions stage, writes audit_logs entry, returns action=transitioned', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const companyId = userA.companyId;

    const stage1 = await seedStage(companyId, `Enquiry-${suffix}`, 1);
    const stage2 = await seedStage(companyId, `Quoted-${suffix}`, 2);
    const orderId = await seedOrder(companyId, suffix, stage1);

    const { data: result, error } = await svc.rpc('transition_sales_order_stage', {
      p_order_id:   orderId,
      p_stage_id:   stage2,
      p_company_id: companyId,
      p_actor_id:   userA.userId,
    });

    expect(error).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('transitioned');
    expect((result as Record<string, unknown>).previous_stage_id).toBe(stage1);
    expect((result as Record<string, unknown>).new_stage_id).toBe(stage2);

    // Order updated
    const { data: order } = await svc.from('sales_orders').select('stage_id').eq('id', orderId).single();
    expect(order?.stage_id).toBe(stage2);

    // Audit log written
    const { data: logs } = await svc
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, changes')
      .eq('entity_id', orderId)
      .eq('action', 'stage_transition');
    expect((logs ?? []).length).toBeGreaterThanOrEqual(1);
    const log = logs![0];
    cleanup.auditIds.push(log.id);
    expect(log.entity_type).toBe('sales_order');
    expect((log.changes as Record<string, unknown>).previous_stage_id).toBe(stage1);
    expect((log.changes as Record<string, unknown>).new_stage_id).toBe(stage2);
  });

  // -------------------------------------------------------------------------
  // No-op: calling transition to current stage returns action=no_change
  // -------------------------------------------------------------------------
  it('returns action=no_change when transitioning to the current stage', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-noop`;
    const companyId = userA.companyId;

    const stage1 = await seedStage(companyId, `Enquiry-noop-${suffix}`, 1);
    const orderId = await seedOrder(companyId, suffix, stage1);

    const { data: result, error } = await svc.rpc('transition_sales_order_stage', {
      p_order_id:   orderId,
      p_stage_id:   stage1,
      p_company_id: companyId,
      p_actor_id:   null,
    });

    expect(error).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('no_change');
  });

  // -------------------------------------------------------------------------
  // Cross-company attack: userB's company cannot move userA's order
  // -------------------------------------------------------------------------
  it('raises exception when company_id does not match the order', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-xco`;
    const orderIdA = await seedOrder(userA.companyId, suffix);
    const stageB   = await seedStage(userB.companyId, `Stage-B-${suffix}`, 1);

    // Attempt cross-company move using userB's companyId against userA's order
    const { data, error } = await svc.rpc('transition_sales_order_stage', {
      p_order_id:   orderIdA,
      p_stage_id:   stageB,
      p_company_id: userB.companyId,
      p_actor_id:   null,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not found|access denied/i);
  });

  // -------------------------------------------------------------------------
  // Cross-company stage attack: target stage belongs to different company
  // -------------------------------------------------------------------------
  it('raises exception when target deal_stage belongs to a different company', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-xst`;
    const stageB   = await seedStage(userB.companyId, `Stage-B-${suffix}`, 1);
    const orderId  = await seedOrder(userA.companyId, suffix);

    const { data, error } = await svc.rpc('transition_sales_order_stage', {
      p_order_id:   orderId,
      p_stage_id:   stageB,       // stage belongs to company B
      p_company_id: userA.companyId,
      p_actor_id:   null,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/different company/i);
  });

  // -------------------------------------------------------------------------
  // Un-assign: NULL stage_id removes order from pipeline
  // -------------------------------------------------------------------------
  it('un-assigns order from pipeline when p_stage_id is null', async () => {
    const suffix  = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-unas`;
    const stage1  = await seedStage(userA.companyId, `Stage-unas-${suffix}`, 1);
    const orderId = await seedOrder(userA.companyId, suffix, stage1);

    const { data: result, error } = await svc.rpc('transition_sales_order_stage', {
      p_order_id:   orderId,
      p_stage_id:   null,
      p_company_id: userA.companyId,
      p_actor_id:   null,
    });

    expect(error).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('transitioned');
    expect((result as Record<string, unknown>).new_stage_id).toBeNull();

    const { data: order } = await svc.from('sales_orders').select('stage_id').eq('id', orderId).single();
    expect(order?.stage_id).toBeNull();
  });
});

// =============================================================================
// get_sales_pipeline_summary() — per-stage counts
// =============================================================================
describeIfLive('get_sales_pipeline_summary() — per-stage summary', () => {
  let svc: SupabaseClient;
  let userA: Session;

  const cleanup = { orderIds: [] as string[], stageIds: [] as string[] };

  beforeAll(async () => {
    svc   = makeServiceClient();
    userA = await signInAs(process.env.RLS_USER_A_EMAIL ?? 'a@rls.test', process.env.RLS_USER_A_PASSWORD ?? 'Test1234!');
  });

  afterAll(async () => {
    if (cleanup.orderIds.length > 0) await svc.from('sales_orders').delete().in('id', cleanup.orderIds);
    if (cleanup.stageIds.length > 0) await svc.from('deal_stages').delete().in('id', cleanup.stageIds);
  });

  it('returns per-stage counts including unassigned bucket and totals', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-psum`;
    const companyId = userA.companyId;

    // Seed two stages + 3 orders (2 in stage1, 1 in stage2, 1 unassigned)
    const { data: s1 } = await svc.from('deal_stages').insert({ company_id: companyId, name: `S1-${suffix}`, stage_order: 90, color: '#111' }).select('id').single();
    const { data: s2 } = await svc.from('deal_stages').insert({ company_id: companyId, name: `S2-${suffix}`, stage_order: 91, color: '#222' }).select('id').single();
    cleanup.stageIds.push(s1!.id, s2!.id);

    const insertOrder = async (stageId: string | null, price: number) => {
      const { data } = await svc.from('sales_orders').insert({
        company_id: companyId, order_no: `PSUM-${suffix}-${Math.random()}`,
        salesman_name: 'T', branch_code: 'KK', model: 'Saga',
        booking_date: '2026-05-01', stage_id: stageId,
        selling_price: price,
      }).select('id').single();
      cleanup.orderIds.push(data!.id);
    };

    await insertOrder(s1!.id, 50000);
    await insertOrder(s1!.id, 60000);
    await insertOrder(s2!.id, 70000);
    await insertOrder(null,   80000);   // unassigned

    const { data, error } = await svc.rpc('get_sales_pipeline_summary', {
      p_company_id: companyId,
      p_branch_code: null,
      p_from_date: '2026-05-01',
      p_to_date: '2026-05-31',
    });
    expect(error).toBeNull();

    const result = data as Record<string, unknown>;
    const byStage = result.by_stage as Record<string, unknown>[];
    const stage1Row = byStage.find(s => s.deal_stage_id === s1!.id);
    const stage2Row = byStage.find(s => s.deal_stage_id === s2!.id);

    expect(Number(stage1Row?.order_count)).toBe(2);
    expect(Number(stage1Row?.total_value)).toBe(110000);

    expect(Number(stage2Row?.order_count)).toBe(1);
    expect(Number(stage2Row?.total_value)).toBe(70000);

    const unassigned = result.unassigned as Record<string, unknown>;
    expect(Number(unassigned.order_count)).toBeGreaterThanOrEqual(1);
    expect(Number(unassigned.total_value)).toBeGreaterThanOrEqual(80000);

    const totals = result.totals as Record<string, unknown>;
    expect(Number(totals.order_count)).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// get_sales_dashboard_summary() — server-side Sales Dashboard KPIs
// =============================================================================
describeIfLive('get_sales_dashboard_summary() — server-side KPI summary', () => {
  let svc: SupabaseClient;
  let userA: Session;

  const cleanup = { orderIds: [] as string[] };

  beforeAll(async () => {
    svc   = makeServiceClient();
    userA = await signInAs(process.env.RLS_USER_A_EMAIL ?? 'a@rls.test', process.env.RLS_USER_A_PASSWORD ?? 'Test1234!');
  });

  afterAll(async () => {
    if (cleanup.orderIds.length > 0) await svc.from('sales_orders').delete().in('id', cleanup.orderIds);
  });

  it('returns mtd counts, branch breakdown, monthly trend, and outstanding_ar', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-dash`;
    const companyId = userA.companyId;

    // Seed two MTD orders (booking_date = today)
    const today = new Date().toISOString().split('T')[0];
    for (let i = 0; i < 2; i++) {
      const { data } = await svc.from('sales_orders').insert({
        company_id: companyId, order_no: `DASH-${suffix}-${i}`,
        salesman_name: 'T', branch_code: `BR${i}`, model: 'Saga',
        booking_date: today, selling_price: 80000,
      }).select('id').single();
      cleanup.orderIds.push(data!.id);
    }

    const { data, error } = await svc.rpc('get_sales_dashboard_summary', {
      p_company_id: companyId,
      p_branch_code: null,
    });
    expect(error).toBeNull();

    const result = data as Record<string, unknown>;
    const mtd = result.mtd as Record<string, unknown>;

    expect(Number(mtd.order_count)).toBeGreaterThanOrEqual(2);
    expect(typeof result.outstanding_ar).toBe('number');
    expect(Array.isArray(result.branch_breakdown)).toBe(true);
    expect(Array.isArray(result.monthly_trend)).toBe(true);
    expect(typeof result.vehicles_linked).toBe('number');

    // Monthly trend must include the current month
    const currentMonth = today.substring(0, 7);
    const trend = result.monthly_trend as Record<string, unknown>[];
    const currentEntry = trend.find(t => t.month_key === currentMonth);
    expect(currentEntry).toBeDefined();
    expect(Number(currentEntry?.order_count)).toBeGreaterThanOrEqual(2);
  });
});
