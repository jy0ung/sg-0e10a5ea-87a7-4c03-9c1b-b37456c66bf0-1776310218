/** Authenticated Deal child/parent coherence only. Real Auth/PostgREST/Postgres;
 * the unchanged service receives a real client getter, never response mocks.
 * Metadata fixtures create no Storage objects. Existing financing defects and
 * same-company reattachment are outside this guard's guarantee.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
type Row = Record<string, unknown> & { id: string };
interface Actor { id: string; company: string; client: SupabaseClient }
interface State { tables: Record<string, Row[]>; counters: Record<string, unknown>[] }
const children = ['deal_loan', 'deal_insurance', 'deal_registration', 'deal_activities', 'deal_documents'] as const;
const editable = ['deal_loan', 'deal_insurance', 'deal_registration'] as const;
const tables = ['deals', ...children, 'sales_orders', 'dms_raw_sales_orders', 'dms_raw_leads', 'dms_raw_prospects',
  'customers', 'invoices', 'dealer_invoices', 'payment_events', 'supplier_payment_events', 'official_receipts',
  'purchase_invoices', 'journal_entries', 'purchase_orders', 'source_reconciliation_matches', 'source_reconciliation_events'];
const options = (storageKey: string) => ({ auth: { persistSession: false, storageKey }, realtime: { transport: WebSocket as never } });
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const pairs = <T, U>(left: readonly T[], right: readonly U[]) => left.flatMap(a => right.map(b => [a, b] as const));

live('Deal child parent-company boundary', () => {
  let svc: SupabaseClient;
  let anonymous: SupabaseClient;
  let boundClient: SupabaseClient;
  let service: typeof import('@/services/dealService');
  let a: Actor, admin: Actor, peer: Actor, b: Actor, global: Actor;
  let own: Row, foreign: Row, historicalParent: Row;
  let today: string;
  const companies: string[] = [];
  const authIds: string[] = [];
  const actors: Actor[] = [];
  const periods: string[] = [];
  const valid: Record<string, Row> = {};
  const foreignValid: Record<string, Row> = {};
  const malformed: Record<string, Row> = {};
  const observations: { name: string; facts: unknown }[] = [];
  const record = (name: string, facts: unknown) => observations.push({ name, facts });
  const sql = <T,>(query: string): T => JSON.parse(execFileSync('docker', ['exec', process.env.RLS_DB_CONTAINER!,
    'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', query], { encoding: 'utf8' }).trim()) as T;

  async function tenant() {
    const id = `deal-child-${crypto.randomUUID()}`;
    expect((await svc.from('companies').insert({ id, code: id, name: 'Owned Deal child regression' })).error).toBeNull();
    companies.push(id);
    return id;
  }
  async function actor(company: string, role = 'manager', scope = 'company'): Promise<Actor> {
    const email = `deal-child-${crypto.randomUUID()}@rls.test`;
    const created = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    authIds.push(id);
    expect((await svc.from('profiles').update({ company_id: company, role, access_scope: scope, status: 'active' }).eq('id', id)).error).toBeNull();
    const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, options(email));
    const login = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
    expect(login.error).toBeNull();
    expect(login.data.user?.id).toBe(id);
    const who = { id, company, client };
    actors.push(who);
    return who;
  }
  async function fixture(table: string, who: Actor, fields: Record<string, unknown>) {
    const result = await svc.from(table).insert({ company_id: who.company, ...fields }).select('*').single();
    expect(result.error, `privileged fixture ${table}`).toBeNull();
    return result.data as Row;
  }
  const deal = (who: Actor) => fixture('deals', who, { deal_no: `DC-${crypto.randomUUID()}`, customer_name: 'Repeated synthetic customer',
    stage: 'booking', notes: 'Protected Deal parent', created_by: who.id });
  function fields(table: string, who: Actor, label = 'Independent sentinel'): Record<string, unknown> {
    if (table === 'deal_activities') return { actor_id: who.id, action: 'boundary_fixture', metadata: { label, synthetic: true } };
    if (table === 'deal_documents') return { uploaded_by: who.id, doc_type: 'loan_form', file_name: `${label}.txt`,
      file_path: `synthetic/not-uploaded/${crypto.randomUUID()}`, file_size: 17 };
    if (table === 'deal_loan') return { bank_name: 'Synthetic bank', loan_amount: 12345, notes: label };
    if (table === 'deal_insurance') return { insurer_name: 'Synthetic insurer', premium: 321, notes: label };
    return { jpj_ref: 'Synthetic reference', notes: label };
  }
  // Small pages intentionally exercise pagination. Never trust capped default samples.
  async function rows(table: string, client = svc, pageSize = 100): Promise<Row[]> {
    const all: Row[] = [];
    let count: number | null = null;
    for (let offset = 0; ; offset += pageSize) {
      const result = await client.from(table).select('*', { count: 'exact' }).in('company_id', companies).order('id').range(offset, offset + pageSize - 1);
      expect(result.error, `snapshot ${table}`).toBeNull();
      expect(result.count).not.toBeNull();
      count ??= result.count;
      expect(result.count, `stable count ${table}`).toBe(count);
      all.push(...result.data as Row[]);
      if (all.length >= count!) break;
      expect(result.data!.length, `truncated page ${table}`).toBe(pageSize);
    }
    expect(all.length, `complete ${table}`).toBe(count);
    expect(new Set(all.map(row => row.id)).size).toBe(all.length);
    return all;
  }
  async function state(): Promise<State> {
    const entries = await Promise.all(tables.map(async table => [table, await rows(table)] as const));
    const counters = await svc.from('deal_number_sequences').select('company_id,branch_label,year,month,last_number::text,updated_at', { count: 'exact' })
      .in('company_id', companies).order('company_id').order('branch_label').order('year').order('month').range(0, 999);
    expect(counters.error).toBeNull();
    expect(counters.count).toBe(counters.data!.length); // explicit truncation guard; exactly two owned namespaces
    return { tables: Object.fromEntries(entries), counters: counters.data! };
  }
  function unchanged(before: State, after: State, changed: string[] = []) {
    for (const table of tables.filter(table => !changed.includes(table))) expect(after.tables[table], table).toEqual(before.tables[table]);
    expect(after.counters).toEqual(before.counters);
  }
  async function rejected(name: string, operation: () => PromiseLike<{ error: { code?: string; message: string } | null; data?: unknown }>, code = '42501') {
    const before = await state();
    const result = await operation();
    const after = await state();
    record(name, { result, before, after }); // retain red product failures before assertions
    expect(result.error?.code, name).toBe(code);
    expect(after).toEqual(before);
  }
  async function filtered(name: string, operation: () => PromiseLike<{ error: unknown; data: unknown }>) {
    const before = await state();
    const result = await operation();
    const after = await state();
    record(name, { result, before, after });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(after).toEqual(before);
  }
  async function inserted(table: string, who: Actor, parent: Row, client = who.client) {
    const input = { company_id: who.company, deal_id: parent.id, ...fields(table, who, `Valid ${crypto.randomUUID()}`) };
    const before = await state();
    const result = await client.from(table).insert(input).select('*').single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject(input);
    const after = await state();
    unchanged(before, after, [table]);
    expect(after.tables[table]).toEqual(sorted([...before.tables[table], result.data]));
    const persisted = await who.client.from(table).select('*').eq('id', result.data.id).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual(result.data);
    record(`DC-01/07 valid insert ${table}`, { input, result: result.data, before, after });
    return result.data as Row;
  }
  async function sentinels(who: Actor, parent: Row) {
    // Populate every protected business population, independently in both tenants.
    const customer = await fixture('customers', who, { name: 'Repeated customer', notes: 'Protected customer' });
    const order = await fixture('sales_orders', who, { order_no: `DC-SO-${crypto.randomUUID()}`, salesman_name: 'Repeated advisor',
      customer_id: customer.id, customer_name: 'Repeated customer', branch_code: 'LOCAL', model: 'Saga', booking_date: today,
      selling_price: 85000, deposit_amount: 500, discount: 1000, notes: 'Protected legacy SO' });
    const raw = await fixture('dms_raw_sales_orders', who, { dms_so_no: `DC-RO-${crypto.randomUUID()}`, payload_hash: crypto.randomUUID(),
      raw_payload: { synthetic: true }, branch_code: 'SOURCE', order_date: `${today}T08:00:00Z` });
    for (const table of ['dms_raw_leads', 'dms_raw_prospects']) await fixture(table, who, { [table === 'dms_raw_leads' ? 'dms_lead_id' : 'dms_prospect_id']: `DC-${crypto.randomUUID()}`,
      payload_hash: crypto.randomUUID(), raw_payload: { synthetic: true } });
    const match = await fixture('source_reconciliation_matches', who, { source_system: 'dms', object_type: 'sales_order',
      source_table: 'dms_raw_sales_orders', source_record_id: raw.id, canonical_table: 'sales_orders', canonical_record_id: order.id,
      match_status: 'accepted', match_basis: { synthetic: true } });
    await fixture('source_reconciliation_events', who, { match_id: match.id, event_type: 'normalized', event_payload: { synthetic: true } });
    const receipt = await fixture('official_receipts', who, { receipt_no: `DC-OR-${crypto.randomUUID()}`, receipt_date: today, amount: 17 });
    const invoice = await fixture('invoices', who, { sales_order_id: order.id, invoice_no: `DC-INV-${crypto.randomUUID()}`,
      invoice_date: today, amount: 100, total_amount: 100 });
    await fixture('payment_events', who, { invoice_id: invoice.id, event_type: 'payment', amount: 17, payment_date: today,
      official_receipt_id: receipt.id, notes: 'Protected AR event' });
    await fixture('dealer_invoices', who, { invoice_no: `DC-DI-${crypto.randomUUID()}`, sales_price: 91, invoice_date: today });
    await fixture('purchase_orders', who, { po_no: `DC-PO-${crypto.randomUUID()}`, supplier: 'Synthetic supplier', order_date: today,
      total_amount: 83, notes: 'Protected purchase order' });
    const purchase = await fixture('purchase_invoices', who, { invoice_no: `DC-PI-${crypto.randomUUID()}`, supplier: 'Synthetic supplier',
      chassis_no: `DC-${crypto.randomUUID()}`, model: 'Saga', invoice_date: today, amount: 100, remark: 'Protected purchase invoice' });
    await fixture('supplier_payment_events', who, { purchase_invoice_id: purchase.id, event_type: 'payment', amount: 13,
      payment_date: today, notes: 'Protected AP event' });
    const period = await fixture('accounting_periods', who, { name: 'Synthetic protected period', period_year: Number(today.slice(0, 4)), period_month: Number(today.slice(5, 7)),
      start_date: today, end_date: today, status: 'open' });
    periods.push(period.id);
    await fixture('journal_entries', who, { period_id: period.id, entry_date: today, description: 'Protected manual synthetic journal', source_type: 'manual' });
    expect((await svc.from('deal_number_sequences').insert({ company_id: who.company, branch_label: 'GEN', year: Number(today.slice(2, 4)),
      month: Number(today.slice(5, 7)), last_number: 42 })).error).toBeNull();
    const childRows: Record<string, Row> = {};
    for (const table of children) childRows[table] = await fixture(table, who, { deal_id: parent.id, ...fields(table, who, `${who.company} valid ${table}`) });
    return childRows;
  }

  beforeAll(async () => {
    const endpoint = new URL(process.env.VITE_SUPABASE_URL ?? 'http://invalid');
    const container = process.env.RLS_DB_CONTAINER ?? '';
    const owned = /^supabase_db_ubs-readiness-(\d+)-[A-Za-z0-9]+$/.exec(container);
    if (!owned || endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/'
      || Number(endpoint.port) !== Number(owned[1]) + 1) throw new Error('DC tests require the uniquely owned disposable test:integration stack.');
    expect(execFileSync('docker', ['inspect', '--format', '{{.Name}}', container], { encoding: 'utf8' }).trim()).toBe(`/${container}`);
    svc = createClient(endpoint.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, options('deal-child-service'));
    anonymous = createClient(endpoint.href, process.env.VITE_SUPABASE_ANON_KEY!, options('deal-child-anonymous'));
    today = sql<string>('select to_json(current_date)');
    a = await actor(await tenant()); b = await actor(await tenant());
    admin = await actor(a.company, 'company_admin'); peer = await actor(a.company); global = await actor(a.company, 'super_admin', 'global');
    own = await deal(a); foreign = await deal(b); historicalParent = await deal(b);
    Object.assign(valid, await sentinels(a, own)); Object.assign(foreignValid, await sentinels(b, foreign));
    for (const table of children) malformed[table] = await fixture(table, a, { deal_id: historicalParent.id, ...fields(table, a, `Malformed ${table}`) });
    vi.doMock('@/integrations/supabase/client', () => ({ get supabase() { return boundClient; } }));
    service = await import('@/services/dealService');
    record('DC owned fixture manifest', { container, endpoint: endpoint.origin, companies, users: authIds, own, foreign, historicalParent,
      valid, foreignValid, malformed, populatedState: await state() });
  }, 60000);

  it.each(pairs(['manager', 'company_admin'], children))('DC-01 %s valid insert/read %s', async (role, table) => {
    await inserted(table, role === 'manager' ? a : admin, own);
  });
  it.each(pairs(['manager', 'company_admin'], editable))('DC-01 %s ordinary notes update retains %s identity and other fields', async (role, table) => {
    const who = role === 'manager' ? a : admin;
    const initial = await fixture(table, who, { deal_id: own.id, ...fields(table, who) });
    const before = await state();
    const result = await who.client.from(table).update({ notes: 'Authorized notes correction' }).eq('id', initial.id).select('*').single();
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ ...initial, notes: 'Authorized notes correction', updated_at: result.data.updated_at });
    expect(Date.parse(result.data.updated_at)).toBeGreaterThanOrEqual(Date.parse(String(initial.updated_at)));
    const after = await state(); unchanged(before, after, [table]);
    expect(after.tables[table]).toEqual(sorted(before.tables[table].map(row => row.id === initial.id ? result.data : row)));
    record(`DC-01 notes ${table}`, { before, after });
  });
  it.each(pairs(['manager', 'company_admin'], editable))('DC-01 %s actual setup service persists %s and exactly one activity', async (role, table) => {
    const who = role === 'manager' ? a : admin; boundClient = who.client;
    const parent = await deal(who); const input = fields(table, who, 'Actual service input');
    const before = await state();
    const setup = table === 'deal_loan' ? service.setupLoan : table === 'deal_insurance' ? service.setupInsurance : service.setupRegistration;
    const result = await setup(parent.id, who.company, input, who.id);
    expect(result.error).toBeNull(); expect(result.data).toMatchObject({ company_id: who.company, deal_id: parent.id, ...input });
    const after = await state(); unchanged(before, after, [table, 'deal_activities']);
    expect(after.tables[table]).toEqual(sorted([...before.tables[table], result.data as unknown as Row]));
    const activity = after.tables.deal_activities.filter(row => !before.tables.deal_activities.some(old => old.id === row.id));
    expect(activity).toHaveLength(1);
    expect(activity[0]).toEqual({ id: activity[0].id, created_at: activity[0].created_at, deal_id: parent.id,
      company_id: who.company, actor_id: who.id, action: `${table.slice(5)}_updated`, metadata: { action: 'setup', ...input } });
    expect(Number.isFinite(Date.parse(String(activity[0].created_at)))).toBe(true);
    expect(after.tables.deal_activities).toEqual(sorted([...before.tables.deal_activities, activity[0]]));
    const detail = await service.getDeal(parent.id);
    expect(detail.error).toBeNull(); expect(detail.data?.[table]).toEqual(result.data);
    record(`DC-01 actual ${table}`, { result, activity, before, after });
  });
  it.each(editable)('DC-01 same-company reattachment remains possible for %s', async table => {
    const parent = await deal(a); const initial = await fixture(table, a, { deal_id: own.id, ...fields(table, a) });
    const before = await state(); const result = await a.client.from(table).update({ deal_id: parent.id }).eq('id', initial.id).select('*').single();
    expect(result.error).toBeNull(); expect(result.data).toEqual({ ...initial, deal_id: parent.id, updated_at: result.data.updated_at });
    const after = await state(); unchanged(before, after, [table]);
    expect(after.tables[table]).toEqual(sorted(before.tables[table].map(row => row.id === initial.id ? result.data : row)));
    record(`DC-01 same-company reattachment ${table}`, { before, after });
  });

  it.each(pairs(['manager', 'company_admin'], children))('DC-02 %s rejects foreign-parent INSERT %s with full no-write state', async (role, table) => {
    const who = role === 'manager' ? a : admin;
    await rejected(`DC-02 ${role} ${table}`, () => who.client.from(table).insert({ company_id: who.company, deal_id: foreign.id, ...fields(table, who) }).select('*'));
  });
  it.each(children)('DC-03 missing-parent INSERT %s is RLS denial before FK', async table => {
    await rejected(`DC-03 missing INSERT ${table}`, () => a.client.from(table).insert({ company_id: a.company, deal_id: crypto.randomUUID(), ...fields(table, a) }));
  });
  it.each(children)('DC-03 forged-company INSERT %s cannot reference own parent', async table => {
    await rejected(`DC-03 forged INSERT ${table}`, () => a.client.from(table).insert({ company_id: b.company, deal_id: own.id, ...fields(table, a) }));
  });
  it.each(pairs(editable, ['foreign', 'missing', 'forged']))('DC-03 %s rejects %s reattachment of otherwise editable own row', async (table, kind) => {
    const initial = await fixture(table, a, { deal_id: own.id, ...fields(table, a) });
    const visible = await a.client.from(table).select('*').eq('id', initial.id).single();
    expect(visible.error).toBeNull(); expect(visible.data).toEqual(initial);
    const patch = kind === 'forged' ? { company_id: b.company } : { deal_id: kind === 'foreign' ? foreign.id : crypto.randomUUID() };
    await rejected(`DC-03 ${table} ${kind}`, () => a.client.from(table).update(patch).eq('id', initial.id).select('*'));
  });

  it.each(children)('DC-04 historical malformed %s stays stored but hidden to company/global and immutable through hidden requests', async table => {
    const initial = await state();
    for (const who of [a, b, global]) {
      const result = await who.client.from(table).select('*').eq('id', malformed[table].id);
      expect(result.error).toBeNull(); expect(result.data).toEqual([]);
      const joined = await who.client.from('deals').select(`id,${table}(*)`).eq('id', historicalParent.id);
      expect(joined.error).toBeNull();
      expect(joined.data).toEqual(who === a ? [] : [{ id: historicalParent.id, [table]: [] }]);
      await filtered(`DC-04 hidden UPDATE ${table} ${who.id}`, () => who.client.from(table).update(fields(table, who, 'Cannot rewrite history')).eq('id', malformed[table].id).select('*'));
      await filtered(`DC-04 hidden DELETE ${table} ${who.id}`, () => who.client.from(table).delete().eq('id', malformed[table].id).select('*'));
    }
    const stored = await svc.from(table).select('*').eq('id', malformed[table].id).single();
    expect(stored.error).toBeNull(); expect(stored.data).toEqual(malformed[table]); expect(await state()).toEqual(initial);
  });
  it('DC-04 actual getDeal keeps absent subtracks null and global foreign detail excludes malformed children', async () => {
    // Dedicated parent avoids manufacturing an application-selection guarantee
    // from getDeal's existing array[0] behavior on parents with multiple rows.
    const emptyParent = await deal(a);
    const before = await state(); boundClient = a.client;
    const ownDetail = await service.getDeal(emptyParent.id); expect(ownDetail.error).toBeNull();
    for (const table of editable) expect(ownDetail.data?.[table]).toBeNull();
    boundClient = global.client;
    const detail = await service.getDeal(historicalParent.id); expect(detail.error).toBeNull(); expect(detail.data?.id).toBe(historicalParent.id);
    for (const table of editable) expect(detail.data?.[table]).toBeNull();
    boundClient = b.client;
    const companyDetail = await service.getDeal(historicalParent.id); expect(companyDetail.error).toBeNull();
    for (const table of editable) expect(companyDetail.data?.[table]).toBeNull();
    expect(await state()).toEqual(before);
  });

  it.each(pairs(editable, ['foreign-argument', 'input-override', 'existing-upsert']))('DC-05 actual %s service rejects %s tuple and appends no activity', async (table, kind) => {
    boundClient = a.client;
    const initial = kind === 'existing-upsert' ? await fixture(table, a, { deal_id: own.id, ...fields(table, a) }) : null;
    const input = { ...fields(table, a), ...(kind === 'foreign-argument' ? {} : { deal_id: foreign.id }), ...(initial ? { id: initial.id } : {}) };
    const before = await state();
    const setup = table === 'deal_loan' ? service.setupLoan : table === 'deal_insurance' ? service.setupInsurance : service.setupRegistration;
    const result = await setup(kind === 'foreign-argument' ? foreign.id : own.id, a.company, input, a.id);
    const after = await state(); record(`DC-05 ${table} ${kind}`, { input, result: { data: result.data, error: result.error?.message ?? null }, before, after });
    expect(result.data).toBeNull(); expect(result.error?.message).toMatch(/row-level security/i); expect(after).toEqual(before);
  });

  it.each(pairs(['deal_activities', 'deal_documents'], ['own-peer', 'foreign-user', 'null']))('DC-06 %s retains author denial for %s even with valid own parent', async (table, author) => {
    const column = table === 'deal_activities' ? 'actor_id' : 'uploaded_by';
    const id = author === 'null' ? null : author === 'own-peer' ? peer.id : b.id;
    await rejected(`DC-06 ${table} ${author}`, () => a.client.from(table).insert({ company_id: a.company, deal_id: own.id, ...fields(table, a), [column]: id }));
  });
  it.each(pairs(['manager', 'company_admin'], children))('DC-06 %s has no ordinary DELETE on valid %s', async (role, table) => {
    const who = role === 'manager' ? a : admin;
    await filtered(`DC-06 DELETE ${role} ${table}`, () => who.client.from(table).delete().eq('id', valid[table].id).select('*'));
  });
  it.each(pairs(['manager', 'company_admin'], ['deal_activities', 'deal_documents']))('DC-06 %s has no ordinary UPDATE on valid %s', async (role, table) => {
    const who = role === 'manager' ? a : admin;
    await filtered(`DC-06 UPDATE ${role} ${table}`, () => who.client.from(table).update(fields(table, who, 'Unauthorized update')).eq('id', valid[table].id).select('*'));
  });

  it.each(children)('DC-07 %s foreign UUID/company/detail denial; global valid read retains no foreign write or mismatch bypass', async table => {
    const before = await state();
    const ownRead = await a.client.from(table).select('*').eq('id', foreignValid[table].id); expect(ownRead.error).toBeNull(); expect(ownRead.data).toEqual([]);
    const companyRead = await a.client.from(table).select('*').eq('company_id', b.company); expect(companyRead.error).toBeNull(); expect(companyRead.data).toEqual([]);
    boundClient = a.client; const detail = await service.getDeal(foreign.id); expect(detail.data).toBeNull(); expect(detail.error).not.toBeNull();
    const joined = await a.client.from('deals').select(`id,${table}(*)`).eq('id', foreign.id); expect(joined.error).toBeNull(); expect(joined.data).toEqual([]);
    const globalRows = await global.client.from(table).select('*').in('id', [valid[table].id, foreignValid[table].id]).order('id');
    expect(globalRows.error).toBeNull(); expect(globalRows.data).toEqual(sorted([valid[table], foreignValid[table]]));
    boundClient = global.client; const foreignDetail = await service.getDeal(foreign.id); expect(foreignDetail.error).toBeNull();
    for (const child of editable) expect(foreignDetail.data?.[child]).toEqual(foreignValid[child]);
    expect(await state()).toEqual(before);
    await rejected(`DC-07 global foreign INSERT ${table}`, () => global.client.from(table).insert({ company_id: b.company, deal_id: foreign.id, ...fields(table, global) }));
    await rejected(`DC-07 global mismatch INSERT ${table}`, () => global.client.from(table).insert({ company_id: a.company, deal_id: foreign.id, ...fields(table, global) }));
    if (editable.includes(table as typeof editable[number])) {
      await filtered(`DC-07 global foreign UPDATE ${table}`, () => global.client.from(table).update({ notes: 'Unauthorized foreign write' }).eq('id', foreignValid[table].id).select('*'));
    }
  });
  it.each(children)('DC-07 service-role retains malformed inspection and valid write %s', async table => {
    const result = await svc.from(table).select('*').eq('id', malformed[table].id).single();
    expect(result.error).toBeNull(); expect(result.data).toEqual(malformed[table]);
    await inserted(table, b, foreign, svc);
  });
  it.each(pairs(['anonymous', 'inactive'], children))('DC-08 %s denied valid own read/write %s with full unchanged state', async (kind, table) => {
    const client = kind === 'anonymous' ? anonymous : a.client;
    if (kind === 'inactive') expect((await svc.from('profiles').update({ status: 'inactive' }).eq('id', a.id)).error).toBeNull();
    try {
      const before = await state();
      const read = await client.from(table).select('*').eq('id', valid[table].id);
      expect(read.error?.code).toBe('42501');
      await rejected(`DC-08 ${kind} INSERT ${table}`, () => client.from(table).insert({ company_id: a.company, deal_id: own.id, ...fields(table, a) }));
      const update = await client.from(table).update(fields(table, a, 'Disabled writer')).eq('id', valid[table].id).select('*');
      const deletion = await client.from(table).delete().eq('id', valid[table].id).select('*');
      expect(update.error?.code).toBe('42501'); expect(deletion.error?.code).toBe('42501');
      expect(await state()).toEqual(before); record(`DC-08 ${kind} ${table} requests`, { read, update, deletion });
    } finally {
      if (kind === 'inactive') expect((await svc.from('profiles').update({ status: 'active' }).eq('id', a.id)).error).toBeNull();
    }
  });
  it('DC-09 all 21 populations and private counters have independent populated tenant sentinels and complete paginated snapshots', async () => {
    const before = await state();
    expect(Object.keys(before.tables)).toHaveLength(21);
    for (const table of tables) {
      for (const company of companies) expect(before.tables[table].filter(row => row.company_id === company).length, `${table} ${company}`).toBeGreaterThan(0);
      expect(await rows(table, svc, 1)).toEqual(before.tables[table]); // executes multiple ranges, including populated finance/source tables
    }
    expect(before.counters).toHaveLength(2); expect(before.counters.every(row => row.last_number === '42')).toBe(true);
    expect(await state()).toEqual(before);
  });
  it('DC-10 five restrictive ALL authenticated USING/CHECK guards retain existing policies, grants and schema inventory', () => {
    const catalog = sql<{ policies: any[]; grants: any[]; schema: unknown; serviceBypass: boolean }>(`select json_build_object(
      'policies',(select json_agg(p order by tablename,policyname) from pg_policies p where schemaname='public' and tablename in (${children.map(t => `'${t}'`).join(',')})),
      'grants',(select json_agg(g order by table_name,grantee,privilege_type) from information_schema.role_table_grants g where table_schema='public' and table_name in (${children.map(t => `'${t}'`).join(',')})),
      'schema',json_build_object('tables',(select json_agg(tablename order by tablename) from pg_tables where schemaname='public'),
        'indexes',(select json_agg(json_build_object('name',indexname,'definition',indexdef) order by indexname) from pg_indexes where schemaname='public'),
        'functions',(select json_agg(json_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f')),
      'serviceBypass',(select rolbypassrls from pg_roles where rolname='service_role'))`);
    record('DC-10 effective catalog', catalog);
    for (const table of children) {
      const policies = catalog.policies.filter(p => p.tablename === table);
      const gate = policies.find(p => p.policyname === 'deal_parent_company_gate');
      expect(gate).toMatchObject({ permissive: 'RESTRICTIVE', cmd: 'ALL', roles: ['authenticated'] });
      expect(gate.qual).toBe(gate.with_check);
      expect(gate.qual).toContain(`parent.id = ${table}.deal_id`);
      expect(gate.qual).toContain(`parent.company_id = ${table}.company_id`);
      expect(gate.qual).toMatch(/EXISTS[\s\S]*deals parent/);
      expect(policies.map(p => p.policyname).sort()).toEqual([`${table}_select`, `${table}_insert`,
        ...editable.includes(table as typeof editable[number]) ? [`${table}_update`] : [], 'enabled_actor_gate', 'tenant_company_gate', 'deal_parent_company_gate'].sort());
      for (const verb of ['select', 'insert', ...editable.includes(table as typeof editable[number]) ? ['update'] : []]) {
        const policy = policies.find(p => p.policyname === `${table}_${verb}`);
        expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: ['public'], cmd: verb.toUpperCase() });
        // Baseline catalog predicates, independent of the new policy's SQL.
        const company = '(company_id = ( SELECT profiles.company_id\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))';
        if (verb === 'select') expect(policy).toMatchObject({ qual: `(${company} OR (EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND (profiles.access_scope = 'global'::text)))))`, with_check: null });
        if (verb === 'update') expect(policy).toMatchObject({ qual: company, with_check: null });
        if (verb === 'insert') expect(policy).toMatchObject({ qual: null, with_check: table === 'deal_activities'
          ? `(${company} AND (actor_id = auth.uid()))` : table === 'deal_documents' ? `(${company} AND (uploaded_by = auth.uid()))` : company });
      }
      expect(policies.find(p => p.policyname === 'enabled_actor_gate')).toMatchObject({ permissive: 'RESTRICTIVE', cmd: 'ALL',
        roles: ['authenticated'], qual: 'request_actor_is_enabled()', with_check: 'request_actor_is_enabled()' });
      expect(policies.find(p => p.policyname === 'tenant_company_gate')).toMatchObject({ permissive: 'RESTRICTIVE', cmd: 'ALL',
        roles: ['authenticated'], qual: 'is_same_company(company_id)', with_check: 'is_same_company(company_id)' });
      // Existing SQL grants are broad; effective verbs still depend on policies.
      for (const grantee of ['anon', 'authenticated', 'service_role']) {
        const grants = catalog.grants.filter(g => g.table_name === table && g.grantee === grantee);
        expect(grants.map(g => g.privilege_type).sort()).toEqual(['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
        expect(grants.every(g => g.is_grantable === 'NO')).toBe(true);
      }
    }
    expect(catalog.serviceBypass).toBe(true);
    // External pre/post reconstruction manifests compare exact original predicates/grants,
    // table/index/function definitions. This test additionally commits the catalog witnesses.
  });

  afterAll(async () => {
    vi.doUnmock('@/integrations/supabase/client');
    try {
      if (!svc || !companies.length) return;
      const final = await state();
      for (const table of ['source_reconciliation_events', 'source_reconciliation_matches', 'dms_raw_sales_orders', 'dms_raw_leads', 'dms_raw_prospects',
        ...children, 'deals', 'payment_events', 'supplier_payment_events', 'journal_entries', 'invoices', 'sales_orders', 'purchase_invoices',
        'purchase_orders', 'official_receipts', 'dealer_invoices', 'customers']) {
        const ids = final.tables[table].map(row => row.id);
        if (ids.length) expect((await svc.from(table).delete().in('id', ids)).error, `exact cleanup ${table}`).toBeNull();
      }
      if (periods.length) {
        expect((await svc.from('accounting_periods').delete().in('id', periods)).error).toBeNull();
        expect((await svc.from('accounting_periods').select('id').in('id', periods)).data).toEqual([]);
      }
      for (const counter of final.counters) expect((await svc.from('deal_number_sequences').delete().eq('company_id', counter.company_id)
        .eq('branch_label', counter.branch_label).eq('year', counter.year).eq('month', counter.month)).error).toBeNull();
      const empty = await state(); for (const table of tables) expect(empty.tables[table], `empty cleanup ${table}`).toEqual([]);
      expect(empty.counters).toEqual([]);
      for (const who of actors) expect((await who.client.auth.signOut({ scope: 'local' })).error).toBeNull();
      for (const id of authIds) {
        expect((await svc.auth.admin.deleteUser(id)).error).toBeNull();
        expect((await svc.auth.admin.getUserById(id)).data.user).toBeNull();
      }
      expect((await svc.from('profiles').select('id').in('id', authIds)).data).toEqual([]);
      expect((await svc.from('companies').delete().in('id', companies)).error).toBeNull();
      const companyRead = await svc.from('companies').select('id').in('id', companies); expect(companyRead.error).toBeNull(); expect(companyRead.data).toEqual([]);
      record('DC-09 exact fixture cleanup', { companies, users: authIds, periods, empty });
    } finally {
      if (process.env.DC_EVIDENCE_PATH) writeFileSync(process.env.DC_EVIDENCE_PATH, JSON.stringify({ observations }, null, 2) + '\n');
    }
  }, 60000);
});
