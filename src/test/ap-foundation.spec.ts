/**
 * Integration tests for Stage 5 AP Foundation RPCs:
 *   • record_supplier_payment_event()  — immutable payment ledger
 *   • reverse_supplier_payment_event() — reversal with double-reversal guard
 *   • get_supplier_payment_events()    — ledger read with is_reversed flag
 *   • get_ap_aging_summary()           — aging buckets
 *   • transition_pi_lifecycle()        — validated state machine
 *
 * Run with:
 *   RLS_E2E=1 \
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 \
 *   VITE_SUPABASE_ANON_KEY=<anon> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   RLS_USER_A_EMAIL=a@rls.test RLS_USER_A_PASSWORD=Test1234! \
 *   RLS_USER_B_EMAIL=b@rls.test RLS_USER_B_PASSWORD=Test1234! \
 *   npx vitest run --config vitest.rls.config.ts src/test/ap-foundation.spec.ts
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let svc: SupabaseClient;
let userA: Session;
let userB: Session;

const cleanup = {
  invoiceIds: [] as string[],
  eventIds:   [] as string[],
};

// Seed a purchase invoice and return its id.
async function seedInvoice(
  companyId: string,
  opts: { lifecycleStatus?: string; dueDate?: string } = {},
): Promise<string> {
  const { data, error } = await svc
    .from('purchase_invoices')
    .insert({
      company_id:       companyId,
      invoice_no:       `AP-TEST-${Date.now()}`,
      supplier:         'Test Supplier',
      chassis_no:       `APTEST${Date.now()}`,
      model:            'Test Model',
      invoice_date:     new Date().toISOString().split('T')[0],
      amount:           100_000,
      status:           'received',
      lifecycle_status: opts.lifecycleStatus ?? 'approved',
      due_date:         opts.dueDate ?? null,
    })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error(`seedInvoice failed: ${error?.message}`);
  cleanup.invoiceIds.push(data.id as string);
  return data.id as string;
}

// =============================================================================
// AP Foundation integration tests
// =============================================================================
describeIfLive('AP Foundation RPCs', () => {
  beforeAll(async () => {
    svc   = makeServiceClient();
    userA = await signInAs(
      process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    );
    userB = await signInAs(
      process.env.RLS_USER_B_EMAIL ?? 'b@rls.test',
      process.env.RLS_USER_B_PASSWORD ?? 'Test1234!',
    );
  });

  afterAll(async () => {
    if (cleanup.eventIds.length > 0) {
      await svc.from('supplier_payment_events').delete().in('id', cleanup.eventIds);
    }
    if (cleanup.invoiceIds.length > 0) {
      await svc.from('purchase_invoices').delete().in('id', cleanup.invoiceIds);
    }
  });

  // 1. Happy path ─────────────────────────────────────────────────────────────
  it('records a supplier payment event and updates paid_amount + payment_status', async () => {
    const piId = await seedInvoice(userA.companyId, { lifecycleStatus: 'approved' });

    const { data: eventId, error } = await userA.client.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: piId,
      p_amount:              60_000,
      p_payment_date:        new Date().toISOString().split('T')[0],
      p_payment_method:      'Bank Transfer',
      p_reference_no:        'REF-001',
      p_notes:               null,
    });
    expect(error).toBeNull();
    expect(typeof eventId).toBe('string');
    cleanup.eventIds.push(eventId as string);

    const { data: pi } = await svc
      .from('purchase_invoices')
      .select('paid_amount, payment_status')
      .eq('id', piId)
      .single();
    expect(Number(pi?.paid_amount)).toBe(60_000);
    expect(pi?.payment_status).toBe('partial');
  });

  // 2. Blocked when lifecycle_status ≠ approved/scheduled ────────────────────
  it('rejects payment when lifecycle_status is "received"', async () => {
    const piId = await seedInvoice(userA.companyId, { lifecycleStatus: 'received' });

    const { error } = await userA.client.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: piId,
      p_amount:              50_000,
      p_payment_date:        new Date().toISOString().split('T')[0],
      p_payment_method:      null,
      p_reference_no:        null,
      p_notes:               null,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/approved|scheduled/i);
  });

  // 3. Reversal happy path ────────────────────────────────────────────────────
  it('reverses a payment event and recalculates paid_amount', async () => {
    const piId = await seedInvoice(userA.companyId, { lifecycleStatus: 'approved' });
    const today = new Date().toISOString().split('T')[0];

    const { data: eventId } = await userA.client.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: piId,
      p_amount:              100_000,
      p_payment_date:        today,
      p_payment_method:      null,
      p_reference_no:        null,
      p_notes:               null,
    });
    cleanup.eventIds.push(eventId as string);

    const { data: reversalId, error: revErr } = await userA.client.rpc('reverse_supplier_payment_event', {
      p_event_id: eventId,
      p_reason:   'Test reversal',
    });
    expect(revErr).toBeNull();
    cleanup.eventIds.push(reversalId as string);

    const { data: pi } = await svc
      .from('purchase_invoices')
      .select('paid_amount, payment_status')
      .eq('id', piId)
      .single();
    expect(Number(pi?.paid_amount)).toBe(0);
    expect(pi?.payment_status).toBe('unpaid');
  });

  // 4. Double-reversal rejected ───────────────────────────────────────────────
  it('rejects reversing an already-reversed event', async () => {
    const piId = await seedInvoice(userA.companyId, { lifecycleStatus: 'approved' });
    const today = new Date().toISOString().split('T')[0];

    const { data: eventId } = await userA.client.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: piId,
      p_amount:              50_000,
      p_payment_date:        today,
      p_payment_method:      null,
      p_reference_no:        null,
      p_notes:               null,
    });
    cleanup.eventIds.push(eventId as string);

    const { data: reversalId } = await userA.client.rpc('reverse_supplier_payment_event', {
      p_event_id: eventId,
      p_reason:   'First reversal',
    });
    cleanup.eventIds.push(reversalId as string);

    const { error } = await userA.client.rpc('reverse_supplier_payment_event', {
      p_event_id: eventId,
      p_reason:   'Double reversal attempt',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/already reversed/i);
  });

  // 5. AP aging summary ───────────────────────────────────────────────────────
  it('get_ap_aging_summary returns valid bucket rows', async () => {
    const pastDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await seedInvoice(userA.companyId, { lifecycleStatus: 'approved', dueDate: pastDate });

    const { data, error } = await userA.client.rpc('get_ap_aging_summary', {
      p_company_id: userA.companyId,
    });
    expect(error).toBeNull();
    const rows = data as Array<{ bucket: string; invoice_count: number; total_outstanding: number }>;
    expect(Array.isArray(rows)).toBe(true);
    const buckets = rows.map(r => r.bucket);
    expect(buckets).toContain('31_60_days');
    const overdueRow = rows.find(r => r.bucket === '31_60_days');
    expect(Number(overdueRow?.invoice_count)).toBeGreaterThanOrEqual(1);
  });

  // 6. Valid lifecycle chain ──────────────────────────────────────────────────
  it('transitions lifecycle: received → verified → approved', async () => {
    const piId = await seedInvoice(userA.companyId, { lifecycleStatus: 'received' });

    const { error: e1 } = await userA.client.rpc('transition_pi_lifecycle', {
      p_id:            piId,
      p_target_status: 'verified',
      p_actor_id:      userA.userId,
    });
    expect(e1).toBeNull();

    const { error: e2 } = await userA.client.rpc('transition_pi_lifecycle', {
      p_id:            piId,
      p_target_status: 'approved',
      p_actor_id:      userA.userId,
    });
    expect(e2).toBeNull();

    const { data: pi } = await svc
      .from('purchase_invoices')
      .select('lifecycle_status, verified_at, approved_at')
      .eq('id', piId)
      .single();
    expect(pi?.lifecycle_status).toBe('approved');
    expect(pi?.verified_at).not.toBeNull();
    expect(pi?.approved_at).not.toBeNull();
  });

  // 7. Invalid lifecycle jump rejected ───────────────────────────────────────
  it('rejects invalid lifecycle jump received → paid', async () => {
    const piId = await seedInvoice(userA.companyId, { lifecycleStatus: 'received' });

    const { error } = await userA.client.rpc('transition_pi_lifecycle', {
      p_id:            piId,
      p_target_status: 'paid',
      p_actor_id:      userA.userId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/invalid transition|cannot transition/i);
  });

  // 8. Cross-tenant isolation ─────────────────────────────────────────────────
  it("userB cannot see userA's supplier payment events", async () => {
    const piId = await seedInvoice(userA.companyId, { lifecycleStatus: 'approved' });
    const today = new Date().toISOString().split('T')[0];

    const { data: eventId } = await userA.client.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: piId,
      p_amount:              10_000,
      p_payment_date:        today,
      p_payment_method:      null,
      p_reference_no:        null,
      p_notes:               null,
    });
    cleanup.eventIds.push(eventId as string);

    const { data: events } = await userB.client.rpc('get_supplier_payment_events', {
      p_purchase_invoice_id: piId,
    });
    // userB belongs to a different company → RLS returns empty
    expect((events as unknown[])?.length ?? 0).toBe(0);
  });
});
