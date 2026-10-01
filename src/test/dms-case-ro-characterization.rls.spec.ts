/** LIVE DB: real Auth/PostgREST/PostgreSQL and unchanged TypeScript createDeal.
 * CONFIRMED RULE: local UUID/reference, numeric deposit and source RO are distinct.
 * CURRENT COMPATIBILITY: manager/company fixtures exercise existing access, not a creator policy.
 * KNOWN GAP tests witness legacy behavior; replace expectations after a governed correction.
 * OPEN POLICY: creator/documents/deposit operations/official eligibility/attestation remain open.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
type Row = Record<string, unknown> & { id: string };
interface Actor { client: SupabaseClient; id: string; companyId: string }
interface State { tables: Record<string, Row[]>; sequences: Record<string, unknown>[] }
interface Clock { today: string; month: string; prior: string; next: string; timezone: string }
const tables = [
  'deals', 'deal_activities', 'deal_loan', 'deal_insurance', 'deal_registration',
  'sales_orders', 'dms_raw_sales_orders', 'dms_raw_leads', 'dms_raw_prospects', 'customers',
  'invoices', 'dealer_invoices', 'payment_events', 'supplier_payment_events', 'official_receipts',
  'purchase_invoices', 'journal_entries', 'purchase_orders',
  'source_reconciliation_matches', 'source_reconciliation_events',
];
const options = (storageKey: string) => ({ auth: { persistSession: false, storageKey }, realtime: { transport: WebSocket as never } });
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

live('DMSv3 Phase 1C Case / legacy SO / raw RO characterization', () => {
  let svc: SupabaseClient;
  let anonymous: SupabaseClient;
  let boundClient: SupabaseClient;
  let clock: Clock;
  let createDeal: typeof import('@/services/dealService').createDeal;
  let dashboardService: typeof import('@/services/salesDashboardService').getSalesDashboardSummary;
  const companyIds: string[] = [];
  const authIds: string[] = [];
  const actors: Actor[] = [];
  const observations: { name: string; facts: unknown }[] = [];
  function record(name: string, facts: unknown) {
    observations.push({ name, facts });
    console.info(name, facts);
  }

  function sql<T>(query: string): T {
    return JSON.parse(execFileSync('docker', ['exec', process.env.RLS_DB_CONTAINER!, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres', '-c', query], { encoding: 'utf8' }).trim()) as T;
  }
  async function tenant(): Promise<Actor> {
    const companyId = `case-ro-${crypto.randomUUID()}`;
    expect((await svc.from('companies').insert({ id: companyId, code: companyId, name: 'Owned synthetic Case characterization' })).error).toBeNull();
    companyIds.push(companyId);
    const email = `case-ro-${crypto.randomUUID()}@rls.test`;
    const created = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    authIds.push(id);
    expect((await svc.from('profiles').update({ company_id: companyId, role: 'manager', access_scope: 'company', status: 'active' }).eq('id', id)).error).toBeNull();
    const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, options(email));
    const login = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
    expect(login.error).toBeNull();
    expect(login.data.user?.id).toBe(id);
    const who = { companyId, id, client };
    actors.push(who);
    return who;
  }
  async function fixture(table: string, who: Actor, fields: Record<string, unknown>) {
    const result = await svc.from(table).insert({ company_id: who.companyId, ...fields }).select('*').single();
    expect(result.error, table).toBeNull();
    return result.data as Row;
  }
  function order(who: Actor, fields: Record<string, unknown> = {}) {
    // Privileged legacy fixture setup is not an authorized new application creation path.
    return fixture('sales_orders', who, { order_no: `CP-${crypto.randomUUID()}`, salesman_name: 'Repeated advisor',
      customer_name: 'Repeated customer', branch_code: 'A', model: 'Saga', booking_date: clock.month,
      selling_price: 100, deposit_amount: 500, discount: 10, notes: 'Preserve SO local notes', ...fields });
  }
  function raw(who: Actor, fields: Record<string, unknown> = {}) {
    return fixture('dms_raw_sales_orders', who, { dms_so_no: `RO-${crypto.randomUUID()}`, dms_so_no_id: `ROID-${crypto.randomUUID()}`,
      dms_customer_id: 'REPEATED-CUSTOMER', dms_customer_business_id: 'REPEATED-BUSINESS', order_date: `${clock.month}T08:00:00Z`,
      order_status: 'confirmed', branch_code: 'SOURCE-BRANCH', salesperson_code: 'Repeated advisor',
      payload_hash: crypto.randomUUID(), raw_payload: { synthetic: true, customerName: 'Repeated customer' }, ...fields });
  }
  function match(who: Actor, source: Row, target: string | null) {
    return fixture('source_reconciliation_matches', who, { object_type: 'sales_order', source_system: 'dms',
      source_table: 'dms_raw_sales_orders', source_record_id: source.id, canonical_table: 'sales_orders',
      canonical_record_id: target, match_status: 'accepted', match_basis: { synthetic: true, explicitlyReviewedFixture: true } });
  }
  async function state(): Promise<State> {
    const entries = await Promise.all(tables.map(async name => {
      const result = await svc.from(name).select('*', { count: 'exact' }).in('company_id', companyIds).order('id');
      expect(result.error, name).toBeNull();
      expect(result.count, name).toBe(result.data!.length);
      return [name, result.data as Row[]] as const;
    }));
    const sequences = await svc.from('deal_number_sequences').select('company_id,branch_label,year,month,last_number::text,updated_at')
      .in('company_id', companyIds).order('company_id').order('branch_label').order('year').order('month');
    expect(sequences.error).toBeNull();
    return { tables: Object.fromEntries(entries), sequences: sequences.data! };
  }
  function unchanged(before: State, after: State, changed: string[] = []) {
    for (const name of tables.filter(name => !changed.includes(name))) expect(after.tables[name], name).toEqual(before.tables[name]);
    if (!changed.includes('deal_number_sequences')) expect(after.sequences).toEqual(before.sequences);
  }
  async function dashboard(who: Actor, branch: string | null = null, company = who.companyId) {
    const result = await who.client.rpc('get_sales_dashboard_summary', { p_company_id: company, p_branch_code: branch });
    expect(result.error).toBeNull();
    return result.data as { mtd: { order_count: number; total_value: number }; vehicles_linked: number;
      branch_breakdown: { branch_code: string; order_count: number }[]; monthly_trend: { month_key: string; order_count: number }[]; outstanding_ar: number };
  }
  async function authenticatedRows(who: Actor, table: string, company = who.companyId) {
    const result = await who.client.from(table).select('*').eq('company_id', company).order('id');
    expect(result.error, table).toBeNull();
    return result.data as Row[];
  }
  function input(who: Actor, deposit: number) {
    return { company_id: who.companyId, customer_name: 'Repeated customer', customer_phone: '000-test',
      model_name: 'Saga', selling_price: 85000, deposit_amount: deposit, discount_amount: 1000, accessories_amount: 200,
      sales_advisor_id: who.id, sales_advisor_employee_id: null, notes: 'Preserve local Deal notes', lead_source: 'auto_aging' };
  }
  async function twoRealDeals(who: Actor) {
    const before = await state();
    expect(before.tables.deals.filter(row => row.company_id === who.companyId)).toEqual([]);
    expect((await dashboard(who)).mtd).toEqual({ order_count: 0, total_value: 0 });
    boundClient = who.client; // Only the exported client changes; all network/RPC/table calls remain real.
    const created: Row[] = [];
    for (const deposit of [0, 500]) {
      const prior = await state();
      const result = await createDeal(input(who, deposit), who.id);
      expect(result.error).toBeNull();
      const row = result.data! as unknown as Row;
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row).toMatchObject({ ...input(who, deposit), branch_id: null, created_by: who.id,
        stage: 'lead', customer_id: null, vso_no: null, deposit_date: null, total_amount: 84200 });
      const suffix = deposit === 0 ? '001' : '002';
      expect(row.deal_no).toBe(`DEAL/GEN/${clock.month.slice(2, 4)}/${clock.month.slice(5, 7)}/${suffix}`);
      created.push(row);
      const after = await state();
      unchanged(prior, after, ['deals', 'deal_activities', 'deal_number_sequences']);
      expect(after.tables.deals).toEqual(sorted([...prior.tables.deals, row]));
      const activity = after.tables.deal_activities.filter(item => !prior.tables.deal_activities.some(old => old.id === item.id));
      expect(activity).toHaveLength(1);
      expect(activity[0]).toMatchObject({ company_id: who.companyId, deal_id: row.id, actor_id: who.id,
        action: 'deal_created', metadata: { deal_no: row.deal_no } });
      expect(after.tables.deal_activities).toEqual(sorted([...prior.tables.deal_activities, activity[0]]));
      expect(after.sequences.filter(item => item.company_id !== who.companyId)).toEqual(prior.sequences.filter(item => item.company_id !== who.companyId));
      const ownCounter = after.sequences.filter(item => item.company_id === who.companyId);
      expect(ownCounter).toHaveLength(1);
      expect(ownCounter[0]).toEqual({ company_id: who.companyId, branch_label: 'GEN', year: Number(clock.month.slice(2, 4)),
        month: Number(clock.month.slice(5, 7)), last_number: deposit === 0 ? '1' : '2', updated_at: ownCounter[0].updated_at });
      expect(Number.isFinite(Date.parse(String(ownCounter[0].updated_at)))).toBe(true);
      expect(await authenticatedRows(who, 'deals')).toEqual(sorted(created));
      expect((await dashboard(who)).mtd).toEqual({ order_count: 0, total_value: 0 });
      const serviceSummary = await dashboardService(who.companyId);
      expect(serviceSummary.error).toBeNull();
      expect(serviceSummary.data?.mtd).toEqual({ orderCount: 0, totalValue: 0 });
    }
    expect(new Set(created.map(row => row.id)).size).toBe(2);
    expect(new Set(created.map(row => row.deal_no)).size).toBe(2);
    const after = await state();
    unchanged(before, after, ['deals', 'deal_activities', 'deal_number_sequences']);
    return created;
  }

  async function normalizeAndVerify(source: Row, targets: Row | Row[], accepted: Row) {
    const before = await state();
    const result = await svc.rpc('normalize_dms_sales_order', { p_raw_id: source.id });
    expect(result.error).toBeNull();
    const candidates = Array.isArray(targets) ? targets : [targets];
    expect(candidates.map(row => row.id)).toContain(result.data.sales_order_id);
    const canonical = candidates.find(row => row.id === result.data.sales_order_id)!;
    expect(canonical.company_id).toBe(source.company_id);
    const expected = { action: 'normalized', raw_id: source.id, sales_order_id: canonical.id,
      dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id, dms_customer_id: source.dms_customer_id, company_id: source.company_id };
    expect(result.data).toEqual(expected);
    const after = await state();
    unchanged(before, after, ['sales_orders', 'dms_raw_sales_orders', 'source_reconciliation_matches', 'source_reconciliation_events']);
    const updated = after.tables.sales_orders.find(row => row.id === canonical.id)!;
    expect(updated).toEqual({ ...canonical, dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id,
      dms_customer_id: source.dms_customer_id, dms_customer_business_id: source.dms_customer_business_id,
      dms_last_synced_at: updated.dms_last_synced_at, updated_at: updated.updated_at });
    expect(Date.parse(String(updated.dms_last_synced_at))).toBeGreaterThanOrEqual(Date.parse(String(canonical.dms_last_synced_at ?? canonical.created_at)));
    expect(Date.parse(String(updated.updated_at))).toBeGreaterThanOrEqual(Date.parse(String(canonical.updated_at)));
    expect(after.tables.sales_orders).toEqual(sorted(before.tables.sales_orders.map(row => row.id === canonical.id ? updated : row)));
    const backlink = after.tables.dms_raw_sales_orders.find(row => row.id === source.id)!;
    expect(backlink).toEqual({ ...source, canonical_sales_order_id: canonical.id, updated_at: backlink.updated_at });
    expect(Date.parse(String(backlink.updated_at))).toBeGreaterThanOrEqual(Date.parse(String(source.updated_at)));
    expect(after.tables.dms_raw_sales_orders).toEqual(sorted(before.tables.dms_raw_sales_orders.map(row => row.id === source.id ? backlink : row)));
    const stamped = after.tables.source_reconciliation_matches.find(row => row.id === accepted.id)!;
    expect(stamped).toEqual(accepted.canonical_record_id === null
      ? { ...accepted, canonical_table: 'sales_orders', canonical_record_id: canonical.id, updated_at: stamped.updated_at } : accepted);
    expect(Date.parse(String(stamped.updated_at))).toBeGreaterThanOrEqual(Date.parse(String(accepted.updated_at)));
    expect(after.tables.source_reconciliation_matches).toEqual(sorted(before.tables.source_reconciliation_matches.map(row => row.id === accepted.id ? stamped : row)));
    const events = after.tables.source_reconciliation_events.filter(row => !before.tables.source_reconciliation_events.some(old => old.id === row.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ id: events[0].id, company_id: source.company_id, match_id: accepted.id,
      event_type: 'normalized', event_payload: expected, created_by: null, created_at: events[0].created_at });
    expect(Number.isFinite(Date.parse(String(events[0].created_at)))).toBe(true);
    expect(after.tables.source_reconciliation_events).toEqual(sorted([...before.tables.source_reconciliation_events, events[0]]));
    return { canonical: updated, source: backlink, accepted: stamped };
  }

  beforeAll(async () => {
    // Loopback production exists on this host. Bind endpoint AND exact owned container/ports.
    const endpoint = new URL(process.env.VITE_SUPABASE_URL ?? 'http://invalid');
    const container = process.env.RLS_DB_CONTAINER ?? '';
    const owned = /^supabase_db_ubs-readiness-(\d+)-[A-Za-z0-9]+$/.exec(container);
    if (!owned || endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1'
      || Number(endpoint.port) !== Number(owned[1]) + 1 || endpoint.pathname !== '/') {
      throw new Error('CP tests require the uniquely owned test:integration stack, never a shared or production endpoint.');
    }
    const actualName = execFileSync('docker', ['inspect', '--format', '{{.Name}}', container], { encoding: 'utf8' }).trim();
    expect(actualName).toBe(`/${container}`);
    svc = createClient(endpoint.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, options('case-ro-service'));
    anonymous = createClient(endpoint.href, process.env.VITE_SUPABASE_ANON_KEY!, options('case-ro-anonymous'));
    clock = sql<Clock>("select json_build_object('today',current_date,'month',date_trunc('month',current_date)::date,'prior',(date_trunc('month',current_date)-interval '1 day')::date,'next',(date_trunc('month',current_date)+interval '1 month')::date,'timezone',current_setting('TimeZone'))");
    record('CP database clock', clock);
    // Getter exports the chosen REAL authenticated client. No rpc/from/network response mocks.
    vi.doMock('@/integrations/supabase/client', () => ({ get supabase() { return boundClient; } }));
    createDeal = (await import('@/services/dealService')).createDeal;
    dashboardService = (await import('@/services/salesDashboardService')).getSalesDashboardSummary;
  }, 30000);

  afterAll(async () => {
    vi.doUnmock('@/integrations/supabase/client');
    if (!svc || !companyIds.length) return;
    const final = await state();
    // Resolve IDs only inside our newly-created tenants; delete exact IDs in dependency order.
    for (const table of ['source_reconciliation_events', 'source_reconciliation_matches', 'dms_raw_sales_orders',
      'deal_activities', 'deal_loan', 'deal_insurance', 'deal_registration', 'deals', 'sales_orders',
      ...tables.filter(name => !['source_reconciliation_events', 'source_reconciliation_matches', 'dms_raw_sales_orders',
        'deal_activities', 'deal_loan', 'deal_insurance', 'deal_registration', 'deals', 'sales_orders'].includes(name))]) {
      const ids = final.tables[table].map(row => row.id);
      if (!ids.length) continue;
      expect((await svc.from(table).delete().in('id', ids)).error, `${table} cleanup`).toBeNull();
      const remaining = await svc.from(table).select('id').in('id', ids);
      expect(remaining.error, `${table} cleanup verification`).toBeNull();
      expect(remaining.data).toEqual([]);
    }
    for (const who of actors) expect((await who.client.auth.signOut({ scope: 'local' })).error).toBeNull();
    for (const id of authIds) expect((await svc.auth.admin.deleteUser(id)).error, 'owned auth cleanup').toBeNull();
    expect((await svc.from('companies').delete().in('id', companyIds)).error).toBeNull();
    const remainingCompanies = await svc.from('companies').select('id').in('id', companyIds);
    expect(remainingCompanies.error).toBeNull();
    expect(remainingCompanies.data).toEqual([]);
    const cleaned = await state();
    expect(cleaned.sequences).toEqual([]);
    for (const name of tables) expect(cleaned.tables[name], `${name} cleaned`).toEqual([]);
    record('CP-09 exact owned fixture cleanup passed', { tenants: companyIds.length, users: authIds.length });
    // Optional synthetic manifest for local evidence; CI acceptance never depends on this file.
    if (process.env.CP_EVIDENCE_FILE) writeFileSync(process.env.CP_EVIDENCE_FILE, JSON.stringify({ observations }, null, 2) + '\n');
    // The readiness runner also destroys this unique stack with --no-backup in its EXIT trap.
  }, 30000);

  describe('CONFIRMED RULE witnesses and CURRENT COMPATIBILITY authority', () => {
    it('CP-01/02 real createDeal preserves distinct identities and deposit inputs without money, source or dashboard creation', async () => {
      const who = await tenant();
      const rows = await twoRealDeals(who);
      // KNOWN GAP: both deposits persist legacy lead; this is not the target no-deposit stage.
      expect(rows.map(row => [row.deposit_amount, row.stage])).toEqual([[0, 'lead'], [500, 'lead']]);
      record('CP-01 local identity manifest', rows.map(row => ({ id: row.id, deal_no: row.deal_no, deposit: row.deposit_amount })));
    });

    for (const session of ['active', 'anonymous', 'inactive'] as const) {
      it(`CP-09 ${session} ordinary session cannot normalize; ${session === 'active' ? 'active dashboard remains scoped' : 'dashboard is denied'} with unchanged full business state`, async () => {
        const who = await tenant();
        await twoRealDeals(who);
        const canonical = await order(who);
        const source = await raw(who);
        await match(who, source, canonical.id);
        const before = await state();
        const client = session === 'anonymous' ? anonymous : who.client;
        if (session === 'inactive') expect((await svc.from('profiles').update({ status: 'inactive' }).eq('id', who.id)).error).toBeNull();
        try {
          const result = await client.rpc('normalize_dms_sales_order', { p_raw_id: source.id });
          expect(result.error?.code).toBe('42501');
          expect(result.data).toBeNull();
          expect(await state()).toEqual(before);
          const summary = await client.rpc('get_sales_dashboard_summary', { p_company_id: who.companyId, p_branch_code: null });
          if (session === 'active') {
            expect(summary.error).toBeNull();
            expect(summary.data.mtd).toEqual({ order_count: 1, total_value: 100 });
          } else {
            expect(summary.error?.code).toBe('42501');
            expect(summary.data).toBeNull();
          }
          expect(await state()).toEqual(before);
        } finally {
          if (session === 'inactive') expect((await svc.from('profiles').update({ status: 'active' }).eq('id', who.id)).error).toBeNull();
        }
      });
    }

    for (const session of ['anonymous', 'inactive', 'cross-company'] as const) {
      it(`CP-09 ${session} allocator and actual createDeal reject writes without advancing any owned state`, async () => {
        const who = await tenant();
        await twoRealDeals(who);
        const foreign = session === 'cross-company' ? await tenant() : who;
        const before = await state();
        const client = session === 'anonymous' ? anonymous : who.client;
        if (session === 'inactive') expect((await svc.from('profiles').update({ status: 'inactive' }).eq('id', who.id)).error).toBeNull();
        try {
          const rejected = await client.rpc('generate_deal_no', { p_company_id: foreign.companyId, p_branch_id: null });
          expect(rejected.error?.code).toBe('42501');
          expect(rejected.data).toBeNull();
          expect(await state()).toEqual(before);
          boundClient = client;
          const result = await createDeal(input(foreign, 500), who.id);
          expect(result.data).toBeNull();
          expect(result.error).toBeInstanceOf(Error);
          expect(await state()).toEqual(before);
        } finally {
          if (session === 'inactive') expect((await svc.from('profiles').update({ status: 'active' }).eq('id', who.id)).error).toBeNull();
        }
      });
    }
  });

  describe('KNOWN GAP / LEGACY CHARACTERIZATION — passing witnesses are not target acceptance', () => {
    it('CP-04/06/07 three populations stay separate; cross-month raw-to-SO normalization and privileged replay retain local Deals', async () => {
      const who = await tenant();
      const deals = await twoRealDeals(who);
      const rawOnly = await raw(who);
      expect((await dashboard(who)).mtd).toEqual({ order_count: 0, total_value: 0 });
      expect(await authenticatedRows(who, 'dms_raw_sales_orders')).toEqual([rawOnly]);
      expect(await authenticatedRows(who, 'sales_orders')).toEqual([]);
      expect(await authenticatedRows(who, 'deals')).toEqual(sorted(deals));
      const manual = await order(who, { selling_price: 100 });
      expect(manual.dms_so_no).toBeNull();
      expect(manual.dms_so_no_id).toBeNull();
      expect((await dashboard(who)).mtd).toEqual({ order_count: 1, total_value: 100 });
      expect(await authenticatedRows(who, 'sales_orders')).toEqual([manual]);
      const linked = await order(who, { selling_price: 200, branch_code: 'A' });
      const source = await raw(who, { order_date: `${clock.prior}T08:00:00Z` });
      const accepted = await match(who, source, linked.id);
      const beforeSummary = await dashboard(who);
      expect(beforeSummary.mtd).toEqual({ order_count: 2, total_value: 300 });
      expect(await authenticatedRows(who, 'sales_orders')).toEqual(sorted([manual, linked]));
      expect(await authenticatedRows(who, 'dms_raw_sales_orders')).toEqual(sorted([rawOnly, source]));
      expect(source.order_date).not.toBe(linked.booking_date);
      expect(String(source.order_date).slice(0, 10)).toBe(clock.prior);
      expect(linked.booking_date).toBe(clock.month);
      const first = await normalizeAndVerify(source, linked, accepted);
      expect(await dashboard(who)).toEqual(beforeSummary);
      expect(await authenticatedRows(who, 'deals')).toEqual(sorted(deals));
      expect(await authenticatedRows(who, 'sales_orders')).toEqual(sorted([manual, first.canonical]));
      const second = await normalizeAndVerify(first.source, first.canonical, first.accepted);
      expect(second.canonical.id).toBe(linked.id);
      expect(await dashboard(who)).toEqual(beforeSummary);
      expect(await authenticatedRows(who, 'deals')).toEqual(sorted(deals));
      const after = await state();
      expect(after.tables.source_reconciliation_events.filter(row => row.company_id === who.companyId)).toHaveLength(2);
      record('CP-04/06/07 population identity manifest', { localDeals: deals.map(row => row.id), rawObservations: [rawOnly.id, source.id],
        legacySalesOrders: [manual.id, linked.id], match: accepted.id, sourceBusinessDate: source.order_date,
        localBookingDate: second.canonical.booking_date, headline: beforeSummary.mtd });
      // No worker replay, official gross/net eligibility, Case-link idempotency or live DMS parity is certified.
    });

    it('CP-05 KNOWN GAP missing month upper bound and distinct branch/trend predicates remain tenant scoped', async () => {
      const who = await tenant();
      const foreign = await tenant();
      const currentA = await order(who, { order_no: 'COLLIDING-ORDER', dms_so_no: 'COLLIDING-RO', selling_price: 100 });
      const currentB = await order(who, { branch_code: 'B', selling_price: 200 });
      const future = await order(who, { booking_date: clock.next, selling_price: 300 });
      const prior = await order(who, { booking_date: clock.prior, selling_price: 400 });
      const deleted = await order(who, { branch_code: 'B', is_deleted: true, selling_price: 500 });
      const other = await order(foreign, { order_no: 'COLLIDING-ORDER', dms_so_no: 'COLLIDING-RO', selling_price: 999 });
      const otherRaw = await raw(foreign, { dms_so_no: 'COLLIDING-RO' });
      const before = await state();
      const all = await dashboard(who);
      expect(all).toEqual({ mtd: { order_count: 3, total_value: 600 }, vehicles_linked: 0,
        branch_breakdown: [{ branch_code: 'A', order_count: 3 }, { branch_code: 'B', order_count: 1 }],
        monthly_trend: [{ month_key: clock.prior.slice(0, 7), order_count: 1 }, { month_key: clock.month.slice(0, 7), order_count: 2 },
          { month_key: clock.next.slice(0, 7), order_count: 1 }], outstanding_ar: 0 });
      expect(await dashboard(who, 'A')).toEqual({ ...all, mtd: { order_count: 2, total_value: 400 },
        branch_breakdown: [{ branch_code: 'A', order_count: 3 }], monthly_trend: all.monthly_trend.map(row => ({ ...row, order_count: 1 })) });
      expect(await dashboard(who, 'B')).toEqual({ ...all, mtd: { order_count: 1, total_value: 200 },
        branch_breakdown: [{ branch_code: 'B', order_count: 1 }], monthly_trend: [{ month_key: clock.month.slice(0, 7), order_count: 1 }] });
      expect(await dashboard(who, 'ABSENT')).toEqual({ mtd: { order_count: 0, total_value: 0 }, vehicles_linked: 0,
        branch_breakdown: [], monthly_trend: [], outstanding_ar: 0 });
      expect(await dashboard(who, null, foreign.companyId)).toEqual({ mtd: { order_count: 0, total_value: 0 }, vehicles_linked: 0,
        branch_breakdown: [], monthly_trend: [], outstanding_ar: 0 });
      expect(await authenticatedRows(who, 'sales_orders', foreign.companyId)).toEqual([]);
      expect(await authenticatedRows(who, 'dms_raw_sales_orders', foreign.companyId)).toEqual([]);
      for (const [table, id] of [['sales_orders', other.id], ['dms_raw_sales_orders', otherRaw.id]]) {
        const direct = await who.client.from(table).select('*').eq('id', id).eq('company_id', who.companyId);
        expect(direct.error).toBeNull();
        expect(direct.data).toEqual([]);
      }
      expect(await authenticatedRows(who, 'sales_orders')).toEqual(sorted([currentA, currentB, future, prior, deleted]));
      expect(await state()).toEqual(before);
      record('CP-05 dated identity manifest', { included: [currentA.id, currentB.id, future.id], excluded: [prior.id, deleted.id], foreign: other.id, clock });
    });

    it('CP-08 no accepted reconciliation rejects privileged normalization and retains every business row', async () => {
      const who = await tenant();
      await twoRealDeals(who);
      await order(who);
      const source = await raw(who);
      const before = await state();
      const rejected = await svc.rpc('normalize_dms_sales_order', { p_raw_id: source.id });
      expect(rejected.error?.code).toBe('42501');
      expect(rejected.data).toBeNull();
      expect(await state()).toEqual(before);
    });

    it('CP-08 accepted source without existing target returns unmatched without manufacturing SO or Case', async () => {
      const who = await tenant();
      await twoRealDeals(who);
      const source = await raw(who);
      await match(who, source, null);
      const before = await state();
      const result = await svc.rpc('normalize_dms_sales_order', { p_raw_id: source.id });
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ action: 'unmatched', raw_id: source.id, dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id,
        reason: 'No existing sales_orders row found matching dms_so_no_id or dms_so_no. Create the order in UBS first, or set canonical_record_id on the reconciliation match.' });
      expect(await state()).toEqual(before);
    });

    it('CP-08 KNOWN GAP ambiguous same-company text fallback picks one candidate, stamps lineage and leaves foreign collisions intact', async () => {
      const who = await tenant();
      const foreign = await tenant();
      await twoRealDeals(who);
      const evidence = { dms_so_no: 'SAME-RO-TEXT', dms_so_no_id: null };
      const candidates = [await order(who, evidence), await order(who, evidence)];
      await order(foreign, { ...evidence, customer_name: 'Repeated customer' });
      await raw(foreign, evidence);
      const source = await raw(who, evidence);
      const accepted = await match(who, source, null);
      // Membership, not row order: the existing SQL fallback uses LIMIT 1 without a tie-breaker.
      // Full delta verification also keeps the unselected candidate and all foreign rows unchanged.
      const result = await normalizeAndVerify(source, candidates, accepted);
      expect(result.canonical.company_id).toBe(who.companyId);
      expect(result.accepted.match_status).toBe('accepted');
      record('CP-08 ambiguous identity manifest', { candidates: candidates.map(row => row.id),
        selected: result.canonical.id, company: who.companyId });
    });

    it('CP-08 external ID fallback selects actual own-company SO despite identical foreign identifiers and customer evidence', async () => {
      const who = await tenant();
      const foreign = await tenant();
      const identity = { dms_so_no: 'COLLIDING-TEXT', dms_so_no_id: 'COLLIDING-ID' };
      const canonical = await order(who, identity);
      await order(foreign, identity);
      await raw(foreign, identity);
      const source = await raw(who, identity);
      const accepted = await match(who, source, null);
      const result = await normalizeAndVerify(source, canonical, accepted);
      expect(result.canonical.company_id).toBe(who.companyId);
      expect(result.source.canonical_sales_order_id).toBe(canonical.id);
    });

    it('CP-07 LIVE CATALOG KNOWN GAP Deals have no typed raw-origin columns or deal_source_links relationship', () => {
      const catalog = sql<{ links: string | null; columns: string[]; foreignKeys: string[] }>("select json_build_object('links',to_regclass('public.deal_source_links'),'columns',(select json_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='deals'),'foreignKeys',(select coalesce(json_agg(confrelid::regclass::text),'[]'::json) from pg_constraint where conrelid='public.deals'::regclass and contype='f'))");
      expect(catalog.links).toBeNull();
      expect(catalog.columns.filter(column => /^(dms_|proton_|source_raw|source_kind|source_record)/.test(column))).toEqual([]);
      expect(catalog.foreignKeys.filter(table => table.startsWith('dms_raw_'))).toEqual([]);
      expect(catalog.columns).toContain('id');
      expect(catalog.columns).toContain('deal_no');
      // STATIC provenance: 20260621010000_deal_legacy_migration copied so.id and activity metadata.
      // Applied migration is never replayed here; copied UUID/text metadata is not typed current Case→RO lineage.
    });
  });
});
