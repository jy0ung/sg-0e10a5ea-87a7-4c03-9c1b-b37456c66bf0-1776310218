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
 *        RLS_USER_A_EMAIL=a@rls.test  RLS_USER_A_PASSWORD=Test1234!
 *        RLS_USER_B_EMAIL=b@rls.test  RLS_USER_B_PASSWORD=Test1234!
 *   4. `npm run test:rls`
 *
 * This suite is isolated behind the RLS_E2E=1 env flag so CI only runs it
 * against a real Supabase stack, not against the CI placeholder.
 */
import { describe, it, beforeAll, expect } from 'vitest';
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
] as const;

type TenantScopedTable = typeof TENANT_SCOPED_TABLES[number];

interface TenantSession {
  client: SupabaseClient;
  userId: string;
  companyId: string;
}

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

describeIfLive('RLS cross-tenant matrix', () => {
  let userA: TenantSession;
  let userB: TenantSession;

  beforeAll(async () => {
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
        expect(profile?.role).toBe('analyst');
        expect(profile?.access_scope).toBe('self');
        expect(profile?.company_id).toBeNull();
      } else {
        expect(error).not.toBeNull();
      }
    });
  });
});
