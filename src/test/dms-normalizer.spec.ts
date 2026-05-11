/**
 * Focused integration tests for normalize_dms_sales_order() Postgres function.
 *
 * Tests run against a live local Supabase stack using the service role client
 * to seed staging data and a regular authenticated user session to verify that
 * the function is NOT callable directly by authenticated users (security definer
 * is invoked via rpc() which respects caller auth, but the function itself runs
 * as the definer — so we test via the service role for happy-path and confirm
 * the function enforces its own pre-conditions).
 *
 * How to run:
 *   RLS_E2E=1 \
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 \
 *   VITE_SUPABASE_ANON_KEY=<anon> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   RLS_USER_A_EMAIL=a@rls.test RLS_USER_A_PASSWORD=Test1234! \
 *   npx vitest run --config vitest.rls.config.ts
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
  const url = process.env.VITE_SUPABASE_URL ?? '';
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeIfLive('normalize_dms_sales_order() — staged-data normalizer', () => {
  let svc: SupabaseClient;
  let userA: Session;

  // Track IDs for cleanup
  const cleanup = {
    rawIds: [] as string[],
    matchIds: [] as string[],
    orderIds: [] as string[],
  };

  beforeAll(async () => {
    svc = makeServiceClient();
    userA = await signInAs(
      process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    );
  });

  afterAll(async () => {
    // Delete in dependency order (events cascade from matches)
    if (cleanup.matchIds.length > 0) {
      await svc.from('source_reconciliation_matches').delete().in('id', cleanup.matchIds);
    }
    if (cleanup.rawIds.length > 0) {
      await svc.from('dms_raw_sales_orders').delete().in('id', cleanup.rawIds);
    }
    if (cleanup.orderIds.length > 0) {
      await svc.from('sales_orders').delete().in('id', cleanup.orderIds);
    }
  });

  // -------------------------------------------------------------------------
  // Happy path: accepted match + existing sales order → canonical write-back
  // -------------------------------------------------------------------------
  it('normalizes an accepted dms_raw_sales_orders row into a matching sales_orders row', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const companyId = userA.companyId;

    // 1. Seed a canonical sales_orders row (no DMS fields yet)
    const { data: order, error: orderErr } = await svc
      .from('sales_orders')
      .insert({
        company_id: companyId,
        order_no: `NORM-SO-${suffix}`,
        salesman_name: 'Normalizer Test',
        branch_code: 'SEEDBRANCH', // NOT NULL constraint; DMS 'if_null' won't overwrite this
        booking_date: '2025-06-01', // NOT NULL constraint; DMS 'if_null' won't overwrite this
        model: 'Saga',
        variant: '1.3 MT',
      })
      .select('id')
      .single();
    expect(orderErr).toBeNull();
    cleanup.orderIds.push(order!.id);

    // 2. Seed a dms_raw_sales_orders staging row
    const { data: raw, error: rawErr } = await svc
      .from('dms_raw_sales_orders')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/manfacturer/order/pageorders',
        dms_so_no: `SO-${suffix}`,
        dms_so_no_id: `SOID-${suffix}`,
        dms_customer_id: `CUST-${suffix}`,
        dms_customer_business_id: `CUSTBIZ-${suffix}`,
        branch_code: 'KK',
        order_date: '2026-01-15T08:00:00Z',
        order_status: 'confirmed',
        payload_hash: `hash-${suffix}`,
        raw_payload: { test: true },
      })
      .select('id')
      .single();
    expect(rawErr).toBeNull();
    cleanup.rawIds.push(raw!.id);

    // 3. Seed an accepted reconciliation match linking raw → canonical
    const { data: match, error: matchErr } = await svc
      .from('source_reconciliation_matches')
      .insert({
        company_id: companyId,
        object_type: 'sales_order',
        source_system: 'dms',
        source_table: 'dms_raw_sales_orders',
        source_record_id: raw!.id,
        canonical_table: 'sales_orders',
        canonical_record_id: order!.id,
        match_status: 'accepted',
        confidence_score: 1.0,
        match_rule: 'test_seed',
      })
      .select('id')
      .single();
    expect(matchErr).toBeNull();
    cleanup.matchIds.push(match!.id);

    // 4. Call the normalizer via service role RPC
    const { data: result, error: rpcErr } = await svc.rpc('normalize_dms_sales_order', {
      p_raw_id: raw!.id,
    });
    expect(rpcErr).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('normalized');
    expect((result as Record<string, unknown>).sales_order_id).toBe(order!.id);

    // 5. Assert canonical row has DMS reference columns set
    const { data: updated, error: fetchErr } = await svc
      .from('sales_orders')
      .select('dms_so_no, dms_so_no_id, dms_customer_id, dms_customer_business_id, branch_code, booking_date, dms_last_synced_at')
      .eq('id', order!.id)
      .single();
    expect(fetchErr).toBeNull();
    expect(updated?.dms_so_no).toBe(`SO-${suffix}`);
    expect(updated?.dms_so_no_id).toBe(`SOID-${suffix}`);
    expect(updated?.dms_customer_id).toBe(`CUST-${suffix}`);
    expect(updated?.dms_customer_business_id).toBe(`CUSTBIZ-${suffix}`);
    // 'if_null' rule: branch_code and booking_date were already set, so DMS must NOT overwrite them
    expect(updated?.branch_code).toBe('SEEDBRANCH');
    expect(updated?.booking_date).toBe('2025-06-01');
    expect(updated?.dms_last_synced_at).not.toBeNull();

    // 6. Assert raw row is back-linked
    const { data: rawUpdated } = await svc
      .from('dms_raw_sales_orders')
      .select('canonical_sales_order_id')
      .eq('id', raw!.id)
      .single();
    expect(rawUpdated?.canonical_sales_order_id).toBe(order!.id);

    // 7. Assert a 'normalized' audit event was appended
    const { data: events } = await svc
      .from('source_reconciliation_events')
      .select('event_type, event_payload')
      .eq('match_id', match!.id)
      .eq('event_type', 'normalized');
    expect((events ?? []).length).toBeGreaterThanOrEqual(1);
    expect((events![0].event_payload as Record<string, unknown>).action).toBe('normalized');
  });

  // -------------------------------------------------------------------------
  // if_null guard: branch_code and booking_date already set → not overwritten
  // -------------------------------------------------------------------------
  it('respects if_null rule: does not overwrite existing branch_code or booking_date', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-b`;
    const companyId = userA.companyId;

    const { data: order } = await svc
      .from('sales_orders')
      .insert({
        company_id: companyId,
        order_no: `NORM-SO-${suffix}`,
        salesman_name: 'Normalizer Test',
        branch_code: 'EXISTING_BRANCH', // already set
        booking_date: '2025-12-01',      // already set
        model: 'Saga',
        variant: '1.3 MT',
      })
      .select('id')
      .single();
    cleanup.orderIds.push(order!.id);

    const { data: raw } = await svc
      .from('dms_raw_sales_orders')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/manfacturer/order/pageorders',
        dms_so_no: `SO-${suffix}`,
        dms_so_no_id: `SOID-${suffix}`,
        dms_customer_id: `CUST-${suffix}`,
        branch_code: 'DMS_BRANCH',   // different from existing
        order_date: '2026-03-20T08:00:00Z',
        order_status: 'confirmed',
        payload_hash: `hash-${suffix}`,
        raw_payload: { test: true },
      })
      .select('id')
      .single();
    cleanup.rawIds.push(raw!.id);

    const { data: match } = await svc
      .from('source_reconciliation_matches')
      .insert({
        company_id: companyId,
        object_type: 'sales_order',
        source_system: 'dms',
        source_table: 'dms_raw_sales_orders',
        source_record_id: raw!.id,
        canonical_table: 'sales_orders',
        canonical_record_id: order!.id,
        match_status: 'accepted',
        confidence_score: 1.0,
        match_rule: 'test_seed',
      })
      .select('id')
      .single();
    cleanup.matchIds.push(match!.id);

    await svc.rpc('normalize_dms_sales_order', { p_raw_id: raw!.id });

    const { data: updated } = await svc
      .from('sales_orders')
      .select('branch_code, booking_date')
      .eq('id', order!.id)
      .single();

    // UBS values must be preserved — DMS must NOT overwrite
    expect(updated?.branch_code).toBe('EXISTING_BRANCH');
    expect(updated?.booking_date).toBe('2025-12-01');
  });

  // -------------------------------------------------------------------------
  // Idempotency: calling normalizer twice must not change values
  // -------------------------------------------------------------------------
  it('is idempotent: calling the normalizer twice yields the same canonical values', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-c`;
    const companyId = userA.companyId;

    const { data: order } = await svc
      .from('sales_orders')
      .insert({
        company_id: companyId,
        order_no: `NORM-SO-${suffix}`,
        salesman_name: 'Normalizer Test',
        branch_code: 'KK',
        booking_date: '2025-07-15',
        model: 'Saga',
        variant: '1.3 MT',
      })
      .select('id')
      .single();
    cleanup.orderIds.push(order!.id);

    const { data: raw } = await svc
      .from('dms_raw_sales_orders')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/manfacturer/order/pageorders',
        dms_so_no: `SO-${suffix}`,
        dms_so_no_id: `SOID-${suffix}`,
        dms_customer_id: `CUST-${suffix}`,
        branch_code: 'KK',
        order_date: '2026-02-10T08:00:00Z',
        order_status: 'confirmed',
        payload_hash: `hash-${suffix}`,
        raw_payload: { test: true },
      })
      .select('id')
      .single();
    cleanup.rawIds.push(raw!.id);

    const { data: match } = await svc
      .from('source_reconciliation_matches')
      .insert({
        company_id: companyId,
        object_type: 'sales_order',
        source_system: 'dms',
        source_table: 'dms_raw_sales_orders',
        source_record_id: raw!.id,
        canonical_table: 'sales_orders',
        canonical_record_id: order!.id,
        match_status: 'accepted',
        confidence_score: 1.0,
        match_rule: 'test_seed',
      })
      .select('id')
      .single();
    cleanup.matchIds.push(match!.id);

    // Call twice
    await svc.rpc('normalize_dms_sales_order', { p_raw_id: raw!.id });
    const { error: secondErr } = await svc.rpc('normalize_dms_sales_order', { p_raw_id: raw!.id });
    expect(secondErr).toBeNull();

    // Values should be stable
    const { data: updated } = await svc
      .from('sales_orders')
      .select('dms_so_no_id, branch_code, booking_date')
      .eq('id', order!.id)
      .single();
    expect(updated?.dms_so_no_id).toBe(`SOID-${suffix}`);
    // 'if_null' rule: branch_code already set to 'KK' in seed; DMS 'KK' would not change it
    expect(updated?.branch_code).toBe('KK');
    // 'if_null' rule: booking_date already set; DMS order_date must NOT overwrite it
    expect(updated?.booking_date).toBe('2025-07-15');

    // Two normalized events should exist
    const { data: events } = await svc
      .from('source_reconciliation_events')
      .select('id')
      .eq('match_id', match!.id)
      .eq('event_type', 'normalized');
    expect((events ?? []).length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Pre-condition: no accepted match → exception
  // -------------------------------------------------------------------------
  it('raises an exception when no accepted reconciliation match exists', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-d`;
    const companyId = userA.companyId;

    const { data: raw } = await svc
      .from('dms_raw_sales_orders')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/manfacturer/order/pageorders',
        dms_so_no: `SO-${suffix}`,
        dms_so_no_id: `SOID-${suffix}`,
        payload_hash: `hash-${suffix}`,
        raw_payload: { test: true },
        order_status: 'confirmed',
      })
      .select('id')
      .single();
    cleanup.rawIds.push(raw!.id);

    // No match seeded — call should fail
    const { data, error } = await svc.rpc('normalize_dms_sales_order', { p_raw_id: raw!.id });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
    expect(error?.message).toMatch(/accepted reconciliation match/i);
  });

  // -------------------------------------------------------------------------
  // Unmatched path: accepted match exists but no canonical sales_orders row
  // -------------------------------------------------------------------------
  it('returns action=unmatched when no canonical sales_orders row can be found', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-e`;
    const companyId = userA.companyId;

    const { data: raw } = await svc
      .from('dms_raw_sales_orders')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/manfacturer/order/pageorders',
        dms_so_no: `SO-NOMATCH-${suffix}`,
        dms_so_no_id: `SOID-NOMATCH-${suffix}`,
        payload_hash: `hash-${suffix}`,
        raw_payload: { test: true },
        order_status: 'pending',
      })
      .select('id')
      .single();
    cleanup.rawIds.push(raw!.id);

    // Accepted match but canonical_record_id is NULL and no sales_order matches by dms_so_no
    const { data: match } = await svc
      .from('source_reconciliation_matches')
      .insert({
        company_id: companyId,
        object_type: 'sales_order',
        source_system: 'dms',
        source_table: 'dms_raw_sales_orders',
        source_record_id: raw!.id,
        match_status: 'accepted',
        confidence_score: 0.5,
        match_rule: 'test_unmatched',
      })
      .select('id')
      .single();
    cleanup.matchIds.push(match!.id);

    const { data: result, error } = await svc.rpc('normalize_dms_sales_order', {
      p_raw_id: raw!.id,
    });
    expect(error).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('unmatched');
    expect(typeof (result as Record<string, unknown>).reason).toBe('string');
  });
});

// =============================================================================
// normalize_dms_vehicle_stock() — staged-data vehicle normalizer
// =============================================================================
describeIfLive('normalize_dms_vehicle_stock() — staged-data normalizer', () => {
  let svc: SupabaseClient;
  let userA: Session;

  const cleanup = {
    rawStockIds: [] as string[],
    rawDeliveryIds: [] as string[],
    matchIds: [] as string[],
    vehicleIds: [] as string[],
  };

  beforeAll(async () => {
    svc = makeServiceClient();
    userA = await signInAs(
      process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    );
  });

  afterAll(async () => {
    if (cleanup.matchIds.length > 0) {
      await svc.from('source_reconciliation_matches').delete().in('id', cleanup.matchIds);
    }
    if (cleanup.rawDeliveryIds.length > 0) {
      await svc.from('dms_raw_deliveries').delete().in('id', cleanup.rawDeliveryIds);
    }
    if (cleanup.rawStockIds.length > 0) {
      await svc.from('dms_raw_vehicle_stock').delete().in('id', cleanup.rawStockIds);
    }
    if (cleanup.vehicleIds.length > 0) {
      await svc.from('vehicles').delete().in('id', cleanup.vehicleIds);
    }
  });

  // Helper: seed a minimal valid vehicles row
  async function seedVehicle(companyId: string, suffix: string, overrides: Record<string, unknown> = {}) {
    const { data, error } = await svc
      .from('vehicles')
      .insert({
        company_id: companyId,
        chassis_no: `CHASSIS-${suffix}`,
        branch_code: 'KK',
        model: 'Saga',
        stage: 'Arrived',
        ...overrides,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seedVehicle failed: ${error.message}`);
    cleanup.vehicleIds.push(data!.id);
    return data!.id;
  }

  async function seedRawStock(companyId: string, suffix: string, overrides: Record<string, unknown> = {}) {
    const { data, error } = await svc
      .from('dms_raw_vehicle_stock')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/vsStock/findStockList',
        dms_vs_stock_id: `VS-${suffix}`,
        chassis_no: `CHASSIS-${suffix}`,
        stock_status: 'AR',
        model_code: 'SAGA',
        config_code: '1.3MT',
        color_code: 'WHITE',
        branch_code: 'SDK',
        payload_hash: `hash-vs-${suffix}`,
        raw_payload: { test: true },
        ...overrides,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seedRawStock failed: ${error.message}`);
    cleanup.rawStockIds.push(data!.id);
    return data!.id;
  }

  async function seedMatch(companyId: string, rawId: string, vehicleId: string | null) {
    const { data, error } = await svc
      .from('source_reconciliation_matches')
      .insert({
        company_id: companyId,
        object_type: 'vehicle',
        source_system: 'dms',
        source_table: 'dms_raw_vehicle_stock',
        source_record_id: rawId,
        canonical_table: vehicleId ? 'vehicles' : null,
        canonical_record_id: vehicleId,
        match_status: 'accepted',
        confidence_score: 1.0,
        match_rule: 'test_seed',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seedMatch failed: ${error.message}`);
    cleanup.matchIds.push(data!.id);
    return data!.id;
  }

  // -------------------------------------------------------------------------
  // Happy path: DMS reference columns written; if_null preserved
  // -------------------------------------------------------------------------
  it('writes dms_vs_stock_id and dms_last_synced_at (always); preserves existing chassis_no and model (if_null)', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-vs`;
    const companyId = userA.companyId;

    const vehicleId = await seedVehicle(companyId, suffix, {
      chassis_no: `CHASSIS-${suffix}`, // already set; if_null must NOT overwrite
      model: 'ExistingModel',           // already set
      color: null,                      // null; DMS color_code should be written
      variant: null,                    // null; DMS config_code should be written
    });
    const rawId = await seedRawStock(companyId, suffix);
    await seedMatch(companyId, rawId, vehicleId);

    const { data: result, error: rpcErr } = await svc.rpc('normalize_dms_vehicle_stock', {
      p_raw_id: rawId,
    });
    expect(rpcErr).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('normalized');
    expect((result as Record<string, unknown>).vehicle_id).toBe(vehicleId);

    const { data: v } = await svc
      .from('vehicles')
      .select('dms_vs_stock_id, dms_last_synced_at, chassis_no, model, variant, color')
      .eq('id', vehicleId)
      .single();

    // always rules
    expect(v?.dms_vs_stock_id).toBe(`VS-${suffix}`);
    expect(v?.dms_last_synced_at).not.toBeNull();
    // if_null: existing values preserved
    expect(v?.chassis_no).toBe(`CHASSIS-${suffix}`);
    expect(v?.model).toBe('ExistingModel');
    // if_null: null values filled by DMS
    expect(v?.variant).toBe('1.3MT');
    expect(v?.color).toBe('WHITE');
  });

  // -------------------------------------------------------------------------
  // Delivery date integration: if_null_or_older
  // -------------------------------------------------------------------------
  it('applies delivery_date from dms_raw_deliveries when vehicle has no delivery_date', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-del`;
    const companyId = userA.companyId;

    const vehicleId = await seedVehicle(companyId, suffix, {
      delivery_date: null, // null; DMS delivered_at should be written
    });
    const rawId = await seedRawStock(companyId, suffix + 'x', { chassis_no: `CHASSIS-${suffix}` });
    await seedMatch(companyId, rawId, vehicleId);

    // Seed a delivery row for the same vehicle
    const { data: del, error: delErr } = await svc
      .from('dms_raw_deliveries')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/car/order/pageDelivery',
        dms_delivery_id: `DEL-${suffix}`,
        chassis_no: `CHASSIS-${suffix}`,
        delivered_at: '2026-03-15T10:00:00Z',
        delivery_status: 'delivered',
        payload_hash: `hash-del-${suffix}`,
        raw_payload: { test: true },
      })
      .select('id')
      .single();
    expect(delErr).toBeNull();
    cleanup.rawDeliveryIds.push(del!.id);

    const { error: rpcErr } = await svc.rpc('normalize_dms_vehicle_stock', {
      p_raw_id: rawId,
      p_delivery_id: del!.id,
    });
    expect(rpcErr).toBeNull();

    const { data: v } = await svc
      .from('vehicles')
      .select('delivery_date, dms_vs_stock_id')
      .eq('id', vehicleId)
      .single();

    expect(v?.delivery_date).toBe('2026-03-15');
    expect(v?.dms_vs_stock_id).toBe(`VS-${suffix}x`);
  });

  // -------------------------------------------------------------------------
  // stage_override guard: DMS stock_status must not overwrite stage_override
  // -------------------------------------------------------------------------
  it('does not overwrite stage when stage_override is set', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-ov`;
    const companyId = userA.companyId;

    // Use a valid stage_override (recompute_vehicle_stage trigger derives stage from it)
    const vehicleId = await seedVehicle(companyId, suffix, {
      stage_override: 'complete',  // trigger will set stage='complete' on insert
    });
    const rawId = await seedRawStock(companyId, suffix, { stock_status: 'AR' });
    await seedMatch(companyId, rawId, vehicleId);

    // Verify pre-condition: trigger set stage = 'complete' on insert
    const { data: pre } = await svc.from('vehicles').select('stage, stage_override').eq('id', vehicleId).single();
    expect(pre?.stage_override).toBe('complete');

    await svc.rpc('normalize_dms_vehicle_stock', { p_raw_id: rawId });

    const { data: v } = await svc
      .from('vehicles')
      .select('stage, stage_override')
      .eq('id', vehicleId)
      .single();

    // stage_override must be untouched (normalizer never writes it)
    expect(v?.stage_override).toBe('complete');
    // stage is managed by the recompute trigger; normalizer must not corrupt it
    expect(v?.stage).not.toBe('Arrived');
  });

  // -------------------------------------------------------------------------
  // Unmatched path: no canonical vehicle found
  // -------------------------------------------------------------------------
  it('returns action=unmatched when no canonical vehicles row can be found', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-nm`;
    const companyId = userA.companyId;

    const rawId = await seedRawStock(companyId, suffix, {
      dms_vs_stock_id: `VS-NOMATCH-${suffix}`,
      chassis_no: `CHASSIS-NOMATCH-${suffix}`,
    });

    // Match with no canonical_record_id — chassis_no won't match any vehicle
    await seedMatch(companyId, rawId, null);

    const { data: result, error } = await svc.rpc('normalize_dms_vehicle_stock', {
      p_raw_id: rawId,
    });
    expect(error).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('unmatched');
  });
});

// =============================================================================
// normalize_dms_customer() — staged-data customer normalizer
// =============================================================================
describeIfLive('normalize_dms_customer() — staged-data normalizer', () => {
  let svc: SupabaseClient;
  let userA: Session;

  const cleanup = {
    rawIds: [] as string[],
    matchIds: [] as string[],
    customerIds: [] as string[],
  };

  beforeAll(async () => {
    svc = makeServiceClient();
    userA = await signInAs(
      process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    );
  });

  afterAll(async () => {
    if (cleanup.matchIds.length > 0) {
      await svc.from('source_reconciliation_matches').delete().in('id', cleanup.matchIds);
    }
    if (cleanup.rawIds.length > 0) {
      await svc.from('dms_raw_sales_orders').delete().in('id', cleanup.rawIds);
    }
    if (cleanup.customerIds.length > 0) {
      await svc.from('customers').delete().in('id', cleanup.customerIds);
    }
  });

  async function seedCustomer(companyId: string, suffix: string, overrides: Record<string, unknown> = {}) {
    const { data, error } = await svc
      .from('customers')
      .insert({ company_id: companyId, name: `Test Customer ${suffix}`, ...overrides })
      .select('id')
      .single();
    if (error) throw new Error(`seedCustomer failed: ${error.message}`);
    cleanup.customerIds.push(data!.id);
    return data!.id;
  }

  async function seedRawOrder(companyId: string, suffix: string, overrides: Record<string, unknown> = {}) {
    const { data, error } = await svc
      .from('dms_raw_sales_orders')
      .insert({
        company_id: companyId,
        source_endpoint: '/api/2b/dms.retail/car/order/pageOrder',
        dms_so_no: `SO-CUST-${suffix}`,
        dms_so_no_id: `SOID-CUST-${suffix}`,
        dms_customer_id: `CUSTID-${suffix}`,
        dms_customer_business_id: `CUSTBIZ-${suffix}`,
        payload_hash: `hash-cust-${suffix}`,
        raw_payload: {
          customerName: `DMS Name ${suffix}`,
          ic: `IC-${suffix}`,
          phone: `01X-${suffix}`,
          email: `dms-${suffix}@example.com`,
        },
        ...overrides,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seedRawOrder failed: ${error.message}`);
    cleanup.rawIds.push(data!.id);
    return data!.id;
  }

  async function seedCustomerMatch(companyId: string, rawId: string, customerId: string | null) {
    const { data, error } = await svc
      .from('source_reconciliation_matches')
      .insert({
        company_id: companyId,
        object_type: 'customer',
        source_system: 'dms',
        source_table: 'dms_raw_sales_orders',
        source_record_id: rawId,
        canonical_table: customerId ? 'customers' : null,
        canonical_record_id: customerId,
        match_status: 'accepted',
        confidence_score: 1.0,
        match_rule: 'test_seed',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seedCustomerMatch failed: ${error.message}`);
    cleanup.matchIds.push(data!.id);
    return data!.id;
  }

  // -------------------------------------------------------------------------
  // Happy path: always fields written; if_null fields populated from raw_payload
  // -------------------------------------------------------------------------
  it('writes dms_customer_id and dms_last_synced_at (always); populates ic_no/phone/email from raw_payload (if_null)', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-cust`;
    const companyId = userA.companyId;

    // name is NOT NULL — seed with a value; ic_no/phone/email are null → DMS fills them
    const customerId = await seedCustomer(companyId, suffix, {
      ic_no: null,
      phone: null,
      email: null,
    });
    const rawId = await seedRawOrder(companyId, suffix);
    await seedCustomerMatch(companyId, rawId, customerId);

    const { data: result, error: rpcErr } = await svc.rpc('normalize_dms_customer', {
      p_raw_id: rawId,
    });
    expect(rpcErr).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('normalized');
    expect((result as Record<string, unknown>).customer_id).toBe(customerId);

    const { data: c } = await svc
      .from('customers')
      .select('dms_customer_id, dms_customer_business_id, dms_last_synced_at, name, ic_no, phone, email')
      .eq('id', customerId)
      .single();

    // always rules
    expect(c?.dms_customer_id).toBe(`CUSTID-${suffix}`);
    expect(c?.dms_customer_business_id).toBe(`CUSTBIZ-${suffix}`);
    expect(c?.dms_last_synced_at).not.toBeNull();
    // if_null: null fields populated from raw_payload
    expect(c?.ic_no).toBe(`IC-${suffix}`);
    expect(c?.phone).toBe(`01X-${suffix}`);
    expect(c?.email).toBe(`dms-${suffix}@example.com`);

    // back-link set on raw row
    const { data: raw } = await svc
      .from('dms_raw_sales_orders')
      .select('canonical_customer_id')
      .eq('id', rawId)
      .single();
    expect(raw?.canonical_customer_id).toBe(customerId);
  });

  // -------------------------------------------------------------------------
  // if_null guard: existing values must NOT be overwritten by DMS
  // -------------------------------------------------------------------------
  it('preserves existing name, ic_no, phone, email (if_null guard)', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-guard`;
    const companyId = userA.companyId;

    const customerId = await seedCustomer(companyId, suffix, {
      name: 'Existing Name',
      ic_no: 'EXISTING-IC',
      phone: '01X-EXISTING',
      email: 'existing@example.com',
    });
    const rawId = await seedRawOrder(companyId, suffix);
    await seedCustomerMatch(companyId, rawId, customerId);

    await svc.rpc('normalize_dms_customer', { p_raw_id: rawId });

    const { data: c } = await svc
      .from('customers')
      .select('name, ic_no, phone, email, dms_customer_id')
      .eq('id', customerId)
      .single();

    expect(c?.name).toBe('Existing Name');
    expect(c?.ic_no).toBe('EXISTING-IC');
    expect(c?.phone).toBe('01X-EXISTING');
    expect(c?.email).toBe('existing@example.com');
    // always rule still fires
    expect(c?.dms_customer_id).toBe(`CUSTID-${suffix}`);
  });

  // -------------------------------------------------------------------------
  // Missing customer-object match raises exception
  // -------------------------------------------------------------------------
  it('raises exception when no accepted customer match exists', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-nomatch`;
    const companyId = userA.companyId;

    const rawId = await seedRawOrder(companyId, suffix);
    // deliberately no match row seeded

    const { error } = await svc.rpc('normalize_dms_customer', { p_raw_id: rawId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/No accepted customer reconciliation match/i);
  });

  // -------------------------------------------------------------------------
  // Unmatched path: no canonical customer found
  // -------------------------------------------------------------------------
  it('returns action=unmatched when canonical customers row cannot be resolved', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-unm`;
    const companyId = userA.companyId;

    const rawId = await seedRawOrder(companyId, suffix, {
      dms_customer_id: `NO-MATCH-CUST-${suffix}`,
      dms_customer_business_id: `NO-MATCH-BIZ-${suffix}`,
    });
    // match with no canonical_record_id and no customer with those dms IDs
    await seedCustomerMatch(companyId, rawId, null);

    const { data: result, error } = await svc.rpc('normalize_dms_customer', { p_raw_id: rawId });
    expect(error).toBeNull();
    expect((result as Record<string, unknown>).action).toBe('unmatched');
    expect(typeof (result as Record<string, unknown>).reason).toBe('string');
  });
});
