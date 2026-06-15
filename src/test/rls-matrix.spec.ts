/**
 * Cross-tenant RLS verification harness.
 *
 * Phase 0 acceptance gate: for every tenant-scoped table, a user in
 * company X must NOT be able to read, insert, update, or delete a row
 * belonging to company Y. This harness boots two authenticated sessions
 * against a local Supabase stack and runs the matrix.
 *
 * How to run:
 *   1. `supabase start`  (apply migrations)
 *   2. Seed two companies + one user each:
 *        npm run test:rls:seed     (creates companies A/B, users a@test/b@test)
 *   3. Set env vars:
 *        VITE_SUPABASE_URL=http://127.0.0.1:54321
 *        VITE_SUPABASE_ANON_KEY=<anon>
 *        SUPABASE_SERVICE_ROLE_KEY=<service-role>
 *        RLS_USER_A_EMAIL=a@rls.test  RLS_USER_A_PASSWORD=Test1234!
 *        RLS_USER_B_EMAIL=b@rls.test  RLS_USER_B_PASSWORD=Test1234!
 *   4. `npm run test:rls`
 *
 * This suite is isolated behind the RLS_E2E=1 env flag so CI only runs it
 * against a real Supabase stack, not against the CI placeholder.
 *
 * Phase 5 additions (2026-05-11):
 *   - DMS staging tables (sync_runs, dms_raw_*) and reconciliation tables are
 *     backend-only; authenticated users must not be able to INSERT directly.
 *   - normalizer_column_authority is readable by all authenticated users but
 *     writable only by service role.
 *   - New DMS reference columns (dms_so_no, dms_vs_stock_id, etc.) on
 *     canonical tables are validated through existing sales_orders/vehicles
 *     cross-tenant matrix rows.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const shouldRun = process.env.RLS_E2E === '1';
const describeIfLive = shouldRun ? describe : describe.skip;

// Tables that must be strictly company-scoped. Extend as new tables land.
const TENANT_SCOPED_TABLES = [
  'vehicles',
  'import_batches',
  'quality_issues',
  'sla_policies',
  'audit_logs',
  'notifications',
  'dashboard_preferences',
  'branches',
  'finance_companies',
  'insurance_companies',
  'vehicle_models',
  'vehicle_colours',
  'banks',
  'suppliers',
  'dealers',
  'dealer_invoices',
  'official_receipts',
  'tin_types',
  'registration_fees',
  'road_tax_fees',
  'inspection_fees',
  'handling_fees',
  'additional_items',
  'payment_types',
  'user_groups',
  'departments',
  'job_titles',
  'public_holidays',
  'approval_flows',
  'approval_steps',
  'role_sections',
  'tickets',
  'sales_orders',
  'invoices',
  'customers',
  'deal_stages',
  'vehicle_transfers',
  'purchase_invoices',
  'employees',
  'leave_requests',
  'attendance_records',
  // Internal Request module config tables — company-scoped SELECT, admin-only
  // writes. The matrix asserts a user in company A can neither read nor insert
  // into company B's rows for each of these.
  'request_categories',
  'request_subcategories',
  'request_form_fields',
  'request_templates',
  'request_routing_rules',
] as const;

type TenantScopedTable = typeof TENANT_SCOPED_TABLES[number];

interface TenantSession {
  client: SupabaseClient;
  userId: string;
  companyId: string;
}

const cleanupIds = {
  salesOrders: [] as string[],
  vehicles: [] as string[],
};

function crossTenantSelect(
  client: SupabaseClient,
  table: TenantScopedTable,
  userB: TenantSession,
) {
  const query = client.from(table).select('*');

  if (table === 'audit_logs' || table === 'notifications' || table === 'dashboard_preferences') {
    return query.eq('user_id', userB.userId);
  }

  if (table === 'approval_steps') {
    return query.limit(1);
  }

  return query.eq('company_id', userB.companyId);
}

async function signInAs(email: string, password: string): Promise<TenantSession> {
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
  if (profErr || !profile?.company_id) {
    throw new Error(`Profile/company missing for ${email}: ${profErr?.message}`);
  }
  return { client, userId: data.user.id, companyId: profile.company_id as string };
}

function maybeAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function cleanupStage2Rows() {
  const admin = maybeAdminClient();
  if (!admin) return;

  if (cleanupIds.salesOrders.length > 0) {
    await admin.from('sales_orders').delete().in('id', cleanupIds.salesOrders);
  }

  if (cleanupIds.vehicles.length > 0) {
    await admin.from('vehicles').delete().in('id', cleanupIds.vehicles);
  }
}

async function insertSalesOrder(session: TenantSession, suffix: string): Promise<string> {
  const { data, error } = await session.client
    .from('sales_orders')
    .insert({
      order_no: `RLS-SO-${suffix}`,
      salesman_name: 'RLS Salesperson',
      branch_code: 'RLS',
      model: 'Saga',
      booking_date: '2026-05-10',
      company_id: session.companyId,
    } as never)
    .select('id')
    .single();

  if (error || !data?.id) throw new Error(`sales_orders insert failed: ${error?.message}`);
  const id = data.id as string;
  cleanupIds.salesOrders.push(id);
  return id;
}

async function insertVehicle(session: TenantSession, chassisNo: string): Promise<string> {
  const { data, error } = await session.client
    .from('vehicles')
    .insert({
      chassis_no: chassisNo,
      branch_code: 'RLS',
      model: 'Saga',
      payment_method: 'cash',
      salesman_name: 'RLS Salesperson',
      customer_name: 'RLS Customer',
      company_id: session.companyId,
    } as never)
    .select('id')
    .single();

  if (error || !data?.id) throw new Error(`vehicles insert failed: ${error?.message}`);
  const id = data.id as string;
  cleanupIds.vehicles.push(id);
  return id;
}

describeIfLive('RLS cross-tenant matrix', () => {
  let userA: TenantSession;
  let userB: TenantSession;

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required so live RLS tests can clean up temporary Sales Order and vehicle rows.');
    }

    userA = await signInAs(
      process.env.RLS_USER_A_EMAIL ?? '',
      process.env.RLS_USER_A_PASSWORD ?? '',
    );
    userB = await signInAs(
      process.env.RLS_USER_B_EMAIL ?? '',
      process.env.RLS_USER_B_PASSWORD ?? '',
    );
    expect(userA.companyId).not.toBe(userB.companyId);
  });

  afterAll(async () => {
    await cleanupStage2Rows();
  });

  for (const table of TENANT_SCOPED_TABLES) {
    describe(table, () => {
      it(`user A cannot SELECT rows belonging to company B`, async () => {
        const { data, error } = await crossTenantSelect(userA.client, table, userB);
        // RLS should either return an error or, preferably, an empty set.
        if (error) {
          expect(error.message).toMatch(/permission|policy|row-level|access/i);
        } else {
          expect(data ?? []).toEqual([]);
        }
      });

      it(`user A cannot INSERT a row into company B`, async () => {
        const { error } = await userA.client
          .from(table)
          .insert({ company_id: userB.companyId } as never);
        expect(error).not.toBeNull();
      });
    });
  }

  describe('notifications spoofing', () => {
    it('user A cannot INSERT a notification targeting user B', async () => {
      const { error } = await userA.client
        .from('notifications')
        .insert({
          user_id: userB.userId,
          company_id: userB.companyId,
          title: 'spoof',
          body: 'spoof',
        } as never);
      expect(error).not.toBeNull();
    });
  });

  describe('handle_new_user privilege escalation', () => {
    it('rejects role/company/access_scope metadata on signup', async () => {
      const url = process.env.VITE_SUPABASE_URL ?? '';
      const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
      const client = createClient(url, anon, { auth: { persistSession: false } });
      const email = `escal-${Date.now()}@rls.test`;
      const { data, error } = await client.auth.signUp({
        email,
        password: 'Test1234!',
        options: {
          data: {
            role: 'super_admin',
            company_id: userB.companyId,
            access_scope: 'company',
          },
        },
      });
      // Public signup is disabled — we expect an error. If it accidentally
      // succeeded, verify the resulting profile was locked down.
      if (!error && data.user) {
        const { data: profile } = await client
          .from('profiles')
          .select('role, company_id, access_scope')
          .eq('id', data.user.id)
          .single();
        expect(profile?.role).toBe('creator_updater');
        expect(profile?.access_scope).toBe('self');
        expect(profile?.company_id).toBeNull();
      } else {
        expect(error).not.toBeNull();
      }
    });
  });

  describe('Sales Order vehicle link RPCs', () => {
    it('lets a caller create an own-company order, link an own-company vehicle, and unlink it', async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const salesOrderId = await insertSalesOrder(userA, suffix);
      const vehicleId = await insertVehicle(userA, `RLS-A-${suffix}`);

      const { data: linkData, error: linkError } = await userA.client.rpc('link_vehicle_to_sales_order' as never, {
        p_sales_order_id: salesOrderId,
        p_vehicle_id: vehicleId,
        p_chassis_no: null,
      } as never);

      expect(linkError).toBeNull();
      expect((linkData as Record<string, unknown>).sales_order_id).toBe(salesOrderId);
      expect((linkData as Record<string, unknown>).vehicle_id).toBe(vehicleId);

      const { data: linkedOrder, error: linkedOrderError } = await userA.client
        .from('sales_orders')
        .select('vehicle_id, chassis_no')
        .eq('id', salesOrderId)
        .single();

      expect(linkedOrderError).toBeNull();
      expect(linkedOrder?.vehicle_id).toBe(vehicleId);
      expect(linkedOrder?.chassis_no).toBe(`RLS-A-${suffix}`);

      const { data: unlinkData, error: unlinkError } = await userA.client.rpc('unlink_vehicle_from_sales_order' as never, {
        p_sales_order_id: salesOrderId,
      } as never);

      expect(unlinkError).toBeNull();
      expect((unlinkData as Record<string, unknown>).sales_order_id).toBe(salesOrderId);
      expect((unlinkData as Record<string, unknown>).previous_vehicle_id).toBe(vehicleId);

      const { data: unlinkedOrder, error: unlinkedOrderError } = await userA.client
        .from('sales_orders')
        .select('vehicle_id, chassis_no')
        .eq('id', salesOrderId)
        .single();

      expect(unlinkedOrderError).toBeNull();
      expect(unlinkedOrder?.vehicle_id).toBeNull();
      expect(unlinkedOrder?.chassis_no).toBeNull();
    });

    it('blocks cross-company order and vehicle linking attempts', async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const userAOrderId = await insertSalesOrder(userA, `A-${suffix}`);
      const userAVehicleId = await insertVehicle(userA, `RLS-A-X-${suffix}`);
      const userBOrderId = await insertSalesOrder(userB, `B-${suffix}`);
      const userBVehicleId = await insertVehicle(userB, `RLS-B-X-${suffix}`);

      const { error: bOrderError } = await userA.client.rpc('link_vehicle_to_sales_order' as never, {
        p_sales_order_id: userBOrderId,
        p_vehicle_id: userAVehicleId,
        p_chassis_no: null,
      } as never);

      expect(bOrderError).not.toBeNull();
      expect(bOrderError?.message).toMatch(/not found|permission|company/i);

      const { error: bVehicleError } = await userA.client.rpc('link_vehicle_to_sales_order' as never, {
        p_sales_order_id: userAOrderId,
        p_vehicle_id: userBVehicleId,
        p_chassis_no: null,
      } as never);

      expect(bVehicleError).not.toBeNull();
      expect(bVehicleError?.message).toMatch(/not found|permission|company/i);

      const { data: userAOrder, error: userAOrderError } = await userA.client
        .from('sales_orders')
        .select('vehicle_id, chassis_no')
        .eq('id', userAOrderId)
        .single();

      expect(userAOrderError).toBeNull();
      expect(userAOrder?.vehicle_id).toBeNull();
      expect(userAOrder?.chassis_no).toBeNull();

      const { error: unlinkBOrderError } = await userA.client.rpc('unlink_vehicle_from_sales_order' as never, {
        p_sales_order_id: userBOrderId,
      } as never);

      expect(unlinkBOrderError).not.toBeNull();
      expect(unlinkBOrderError?.message).toMatch(/not found|permission|company/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 5: DMS staging table RLS — backend-only write isolation
  // ---------------------------------------------------------------------------
  describe('DMS staging tables — authenticated users cannot insert directly', () => {
    // All dms_raw_* and sync_runs tables should only be writable by service_role.
    // An authenticated user attempting a direct insert must be rejected.

    const BACKEND_ONLY_TABLES = [
      'sync_runs',
      'dms_raw_sales_orders',
      'dms_raw_vehicle_stock',
      'dms_raw_collections',
      'dms_raw_order_vehicle_matches',
      'dms_raw_deliveries',
      'dms_raw_leads',
      'dms_raw_prospects',
      'dms_raw_soa_snapshots',
      'dms_raw_master_data',
      'source_reconciliation_matches',
    ] as const;

    for (const table of BACKEND_ONLY_TABLES) {
      it(`blocks authenticated user direct INSERT into ${table}`, async () => {
        // We don't know the exact required fields for each table, so we attempt
        // a minimal insert with only company_id set; if the error is a RLS
        // violation (PGRST301 / 42501) the test passes. If it's a "column does
        // not exist" / constraint error the user got past RLS, which is a fail.
        const { error } = await userA.client
          .from(table as never)
          .insert({ company_id: userA.companyId } as never);

        expect(error).not.toBeNull();
        // RLS policy must reject before any constraint fires.
        // Supabase returns 42501 (insufficient_privilege) as a PostgrestError
        // with code 42501 or message matching permission/policy.
        const isRlsRejection =
          error?.code === '42501' ||
          error?.code === 'PGRST301' ||
          /permission denied|policy|insufficient/i.test(error?.message ?? '');
        expect(isRlsRejection).toBe(true);
      });
    }

    it('allows authenticated user to SELECT from sync_runs for their own company only', async () => {
      // sync_runs has a SELECT policy for authenticated users scoped to company_id.
      // A user from company A should see 0 rows for company B.
      const { data: bRows, error } = await userA.client
        .from('sync_runs' as never)
        .select('id')
        .eq('company_id', userB.companyId)
        .limit(10);

      expect(error).toBeNull();
      // Cross-company rows must be invisible (empty result, not an error).
      expect((bRows as unknown[]).length).toBe(0);
    });

    it('allows authenticated user to SELECT from dms_raw_sales_orders for their own company only', async () => {
      const { data: bRows, error } = await userA.client
        .from('dms_raw_sales_orders' as never)
        .select('id')
        .eq('company_id', userB.companyId)
        .limit(10);

      expect(error).toBeNull();
      expect((bRows as unknown[]).length).toBe(0);
    });

    it('allows authenticated user to SELECT from dms_raw_vehicle_stock for their own company only', async () => {
      const { data: bRows, error } = await userA.client
        .from('dms_raw_vehicle_stock' as never)
        .select('id')
        .eq('company_id', userB.companyId)
        .limit(10);

      expect(error).toBeNull();
      expect((bRows as unknown[]).length).toBe(0);
    });

    it('allows authenticated user to read normalizer_column_authority (config table)', async () => {
      const { data, error } = await userA.client
        .from('normalizer_column_authority' as never)
        .select('canonical_table, column_name, authority, overwrite_rule')
        .limit(5);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      // Should have at least the rows seeded by the migration
      expect((data as unknown[]).length).toBeGreaterThan(0);
    });

    it('blocks authenticated user direct INSERT into normalizer_column_authority', async () => {
      const { error } = await userA.client
        .from('normalizer_column_authority' as never)
        .insert({
          canonical_table: 'sales_orders',
          column_name: 'hacked_column',
          authority: 'dms',
          overwrite_rule: 'always',
        } as never);

      expect(error).not.toBeNull();
      const isRlsRejection =
        error?.code === '42501' ||
        error?.code === 'PGRST301' ||
        /permission denied|policy|insufficient/i.test(error?.message ?? '');
      expect(isRlsRejection).toBe(true);
    });
  });
});
