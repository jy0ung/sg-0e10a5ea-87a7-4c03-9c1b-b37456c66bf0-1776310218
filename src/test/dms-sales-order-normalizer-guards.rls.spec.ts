/** Real disposable Auth/PostgREST/PostgreSQL; no RPC or persistence mocks.
 * NR guards protect raw DMS -> legacy SO only, not Case provenance/official KPI.
 * Every refused/unmatched call compares all 20 business tables and counter rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setImmediate as yieldIO } from 'node:timers/promises';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
type Row = Record<string, unknown> & { id: string };
type State = { tables: Record<string, Row[]>; sequences: Record<string, unknown>[] };
const tables = ['deals', 'deal_activities', 'deal_loan', 'deal_insurance', 'deal_registration',
  'sales_orders', 'dms_raw_sales_orders', 'dms_raw_leads', 'dms_raw_prospects', 'customers',
  'invoices', 'dealer_invoices', 'payment_events', 'supplier_payment_events', 'official_receipts',
  'purchase_invoices', 'journal_entries', 'purchase_orders',
  'source_reconciliation_matches', 'source_reconciliation_events'];
const options = (storageKey: string) => ({ auth: { persistSession: false, storageKey }, realtime: { transport: WebSocket as never } });
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

live('Sales Order normalizer decision / target guards', () => {
  let svc: SupabaseClient;
  let second: SupabaseClient;
  let anonymous: SupabaseClient;
  let today: string;
  const companyIds: string[] = [];
  const customerIds = new Map<string, string>();
  const actors: { id: string; client: SupabaseClient }[] = [];
  const observations: { name: string; facts: unknown }[] = [];
  function record(name: string, facts: unknown) { observations.push({ name, facts }); }
  function sql<T>(query: string): T {
    return JSON.parse(execFileSync('docker', ['exec', process.env.RLS_DB_CONTAINER!, 'psql', '-XqAt',
      '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', query], { encoding: 'utf8' }).trim()) as T;
  }
  async function fixture(table: string, company: string, fields: Record<string, unknown>) {
    const result = await svc.from(table).insert({ company_id: company, ...fields }).select('*').single();
    expect(result.error, `fixture ${table}`).toBeNull();
    return result.data as Row;
  }
  async function tenant() {
    const company = `normalizer-guards-${crypto.randomUUID()}`;
    expect((await svc.from('companies').insert({ id: company, code: company, name: 'Owned normalizer guard fixture' })).error).toBeNull();
    companyIds.push(company);
    // Existing Case/activities/customer/counter sentinels must remain full-row equal.
    const deal = await fixture('deals', company, { deal_no: `NR-${crypto.randomUUID()}`, customer_name: 'Repeated customer',
      stage: 'lead', deposit_amount: 500, notes: 'Local Case sentinel' });
    await fixture('deal_activities', company, { deal_id: deal.id, action: 'deal_created', metadata: { synthetic: true } });
    const customer = await fixture('customers', company, { name: 'Repeated customer', notes: 'Protected customer' });
    customerIds.set(company, customer.id);
    expect((await svc.from('deal_number_sequences').insert({ company_id: company, branch_label: 'GEN',
      year: Number(today.slice(2, 4)), month: Number(today.slice(5, 7)), last_number: 42 })).error).toBeNull();
    return company;
  }
  function order(company: string, fields: Record<string, unknown> = {}) {
    return fixture('sales_orders', company, { order_no: `NR-${crypto.randomUUID()}`, salesman_name: 'Repeated advisor',
      customer_id: customerIds.get(company),
      customer_name: 'Repeated customer', branch_code: 'LOCAL', model: 'Saga', booking_date: today,
      selling_price: 85000, deposit_amount: 500, discount: 1000, bank_loan_amount: 40000,
      notes: 'Protected local SO', ...fields });
  }
  function raw(company: string, fields: Record<string, unknown> = {}) {
    return fixture('dms_raw_sales_orders', company, { dms_so_no: `RO-${crypto.randomUUID()}`, dms_so_no_id: `ID-${crypto.randomUUID()}`,
      dms_customer_id: 'REPEATED-CUSTOMER', dms_customer_business_id: 'REPEATED-BUSINESS',
      branch_code: 'SOURCE', order_date: '2025-01-15T08:00:00Z', order_status: 'confirmed',
      payload_hash: crypto.randomUUID(), raw_payload: { synthetic: true, customerName: 'Repeated customer' }, ...fields });
  }
  async function match(company: string, source: Row, target: string | null = null, fields: Record<string, unknown> = {}) {
    const decision = await fixture('source_reconciliation_matches', company, { object_type: 'sales_order', source_system: 'dms',
      source_table: 'dms_raw_sales_orders', source_record_id: source.id, canonical_table: 'sales_orders',
      canonical_record_id: target, match_status: 'accepted', source_priority: 100,
      match_basis: { synthetic: true }, review_notes: 'Preserve review history', ...fields });
    await fixture('source_reconciliation_events', company, { match_id: decision.id, event_type: 'created',
      event_payload: { synthetic: true, originalDecision: decision.id } });
    return decision;
  }
  async function state(): Promise<State> {
    const pairs = await Promise.all(tables.map(async table => {
      const result = await svc.from(table).select('*', { count: 'exact' }).in('company_id', companyIds).order('id');
      expect(result.error, table).toBeNull();
      expect(result.count, `untruncated ${table}`).toBe(result.data!.length);
      return [table, result.data as Row[]] as const;
    }));
    const sequences = await svc.from('deal_number_sequences').select('company_id,branch_label,year,month,last_number::text,updated_at')
      .in('company_id', companyIds).order('company_id').order('branch_label').order('year').order('month');
    expect(sequences.error).toBeNull();
    return { tables: Object.fromEntries(pairs), sequences: sequences.data! };
  }
  function unmatched(source: Row) {
    return { action: 'unmatched', raw_id: source.id, dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id,
      reason: 'No existing sales_orders row found matching dms_so_no_id or dms_so_no. Create the order in UBS first, or set canonical_record_id on the reconciliation match.' };
  }
  async function refused(name: string, source: Row | string, code: string | null, client = svc) {
    const before = await state();
    const result = await client.rpc('normalize_dms_sales_order', { p_raw_id: typeof source === 'string' ? source : source.id });
    const after = await state();
    // Capture product drift even when red-before response assertions fail.
    record(name, { response: result, before, after });
    expect(result.error?.code ?? null).toBe(code);
    expect(result.data).toEqual(code ? null : unmatched(source as Row));
    expect(after).toEqual(before);
  }
  function verifySuccess(before: State, after: State, source: Row, canonical: Row, approved: Row, results: { data: unknown; error: unknown }[]) {
    const expected = { action: 'normalized', raw_id: source.id, sales_order_id: canonical.id,
      dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id, dms_customer_id: source.dms_customer_id, company_id: source.company_id };
    for (const result of results) { expect(result.error).toBeNull(); expect(result.data).toEqual(expected); }
    for (const table of tables.filter(t => !['sales_orders', 'dms_raw_sales_orders', 'source_reconciliation_matches', 'source_reconciliation_events'].includes(t))) {
      expect(after.tables[table], table).toEqual(before.tables[table]);
    }
    expect(after.sequences).toEqual(before.sequences);
    const updated = after.tables.sales_orders.find(row => row.id === canonical.id)!;
    expect(updated).toEqual({ ...canonical, dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id,
      dms_customer_id: source.dms_customer_id, dms_customer_business_id: source.dms_customer_business_id,
      dms_last_synced_at: updated.dms_last_synced_at, updated_at: updated.updated_at });
    expect(Date.parse(String(updated.dms_last_synced_at))).toBeGreaterThanOrEqual(Date.parse(String(canonical.dms_last_synced_at ?? canonical.created_at)));
    expect(Date.parse(String(updated.updated_at))).toBeGreaterThanOrEqual(Date.parse(String(canonical.updated_at)));
    expect(after.tables.sales_orders).toEqual(sorted(before.tables.sales_orders.map(row => row.id === canonical.id ? updated : row)));
    const linked = after.tables.dms_raw_sales_orders.find(row => row.id === source.id)!;
    expect(linked).toEqual({ ...source, canonical_sales_order_id: canonical.id, updated_at: linked.updated_at });
    expect(Date.parse(String(linked.updated_at))).toBeGreaterThanOrEqual(Date.parse(String(source.updated_at)));
    expect(after.tables.dms_raw_sales_orders).toEqual(sorted(before.tables.dms_raw_sales_orders.map(row => row.id === source.id ? linked : row)));
    const stamped = after.tables.source_reconciliation_matches.find(row => row.id === approved.id)!;
    expect(stamped).toEqual(approved.canonical_record_id === null
      ? { ...approved, canonical_table: 'sales_orders', canonical_record_id: canonical.id, updated_at: stamped.updated_at } : approved);
    expect(Date.parse(String(stamped.updated_at))).toBeGreaterThanOrEqual(Date.parse(String(approved.updated_at)));
    expect(after.tables.source_reconciliation_matches).toEqual(sorted(before.tables.source_reconciliation_matches.map(row => row.id === approved.id ? stamped : row)));
    const events = after.tables.source_reconciliation_events.filter(row => !before.tables.source_reconciliation_events.some(old => old.id === row.id));
    expect(events).toHaveLength(results.length);
    for (const event of events) {
      expect(event).toEqual({ id: event.id, company_id: source.company_id, match_id: approved.id, event_type: 'normalized',
        event_payload: expected, created_by: null, created_at: event.created_at });
      expect(Number.isFinite(Date.parse(String(event.created_at)))).toBe(true);
    }
    expect(after.tables.source_reconciliation_events).toEqual(sorted([...before.tables.source_reconciliation_events, ...events]));
  }
  async function success(name: string, source: Row, canonical: Row, approved: Row) {
    const before = await state();
    const result = await svc.rpc('normalize_dms_sales_order', { p_raw_id: source.id });
    const after = await state();
    record(name, { source: source.id, target: canonical.id, decision: approved.id, response: result, before, after });
    verifySuccess(before, after, source, canonical, approved, [result]);
  }

  // An owned interactive PostgreSQL transaction supplies an observable lock barrier.
  // No sleeps or changes to product SQL/indexes are used to make races appear.
  async function blocker(table: string, id: string) {
    const app = `nr-lock-${crypto.randomUUID()}`;
    const child = spawn('docker', ['exec', '-i', process.env.RLS_DB_CONTAINER!, 'psql', '-XqAt',
      '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']);
    let output = '';
    let errors = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { errors += String(chunk); });
    const exited = new Promise<number | null>(resolve => child.on('exit', resolve));
    async function command(query: string) {
      const marker = crypto.randomUUID();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`DB barrier timeout: ${errors}`)), 10000);
        const changed = () => { if (output.includes(marker)) finish(); };
        const failed = () => finish(new Error(`DB barrier exited: ${errors}`));
        const finish = (error?: Error) => {
          clearTimeout(timer); child.stdout.off('data', changed); child.off('exit', failed); child.off('error', finish);
          if (error) reject(error); else resolve();
        };
        child.stdout.on('data', changed); child.once('exit', failed); child.once('error', finish);
        child.stdin.write(`${query}\nselect '${marker}';\n`);
      });
    }
    const close = async () => {
      if (child.exitCode === null) { child.stdin.end('ROLLBACK;\n\\q\n'); }
      expect(await exited, `owned DB barrier cleanup: ${errors}`).toBe(0);
    };
    try {
      await command(`BEGIN; SET application_name='${app}'; SELECT id FROM public.${table} WHERE id='${id}' FOR UPDATE;`);
      const pid = sql<number>(`select to_json(pid) from pg_stat_activity where application_name='${app}'`);
      return { pid, command, close };
    } catch (error) { await close(); throw error; }
  }
  async function waitBlocked(pid: number, count: number) {
    const deadline = Date.now() + 10000;
    let observed = 0;
    while (Date.now() < deadline) {
      observed = sql<number>(`with recursive waiting(pid) as (values (${pid}) union
        select a.pid from pg_stat_activity a join waiting w on w.pid=any(pg_blocking_pids(a.pid)))
        select to_json(count(*)) from pg_stat_activity where pid in (select pid from waiting)
        and pid<>${pid} and query like '%normalize_dms_sales_order%'`);
      if (observed >= count) return observed;
      await yieldIO();
    }
    throw new Error(`Expected ${count} normalizer lock waiters; observed ${observed}`);
  }

  beforeAll(() => {
    const endpoint = new URL(process.env.VITE_SUPABASE_URL ?? 'http://invalid');
    const container = process.env.RLS_DB_CONTAINER ?? '';
    const owned = /^supabase_db_ubs-readiness-(\d+)-[A-Za-z0-9]+$/.exec(container);
    if (!owned || endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1'
      || Number(endpoint.port) !== Number(owned[1]) + 1 || endpoint.pathname !== '/') {
      throw new Error('NR tests require the uniquely owned disposable readiness endpoint/container.');
    }
    expect(execFileSync('docker', ['inspect', '--format', '{{.Name}}', container], { encoding: 'utf8' }).trim()).toBe(`/${container}`);
    svc = createClient(endpoint.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, options('nr-service-one'));
    second = createClient(endpoint.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, options('nr-service-two'));
    anonymous = createClient(endpoint.href, process.env.VITE_SUPABASE_ANON_KEY!, options('nr-anonymous'));
    today = sql<string>('select to_json(current_date)');
    record('NR DB clock', { today, timezone: sql<string>("select to_json(current_setting('TimeZone'))") });
  });
  afterAll(async () => {
    if (!svc || !companyIds.length) return;
    try {
      const final = await state();
      const first = ['source_reconciliation_events', 'source_reconciliation_matches', 'dms_raw_sales_orders',
        'deal_activities', 'deal_loan', 'deal_insurance', 'deal_registration', 'deals', 'sales_orders'];
      for (const table of [...first, ...tables.filter(t => !first.includes(t))]) {
        const ids = final.tables[table].map(row => row.id);
        if (!ids.length) continue;
        expect((await svc.from(table).delete().in('id', ids)).error, `${table} cleanup`).toBeNull();
        const remaining = await svc.from(table).select('id').in('id', ids);
        expect(remaining.error).toBeNull(); expect(remaining.data).toEqual([]);
      }
      for (const actor of actors) {
        expect((await actor.client.auth.signOut({ scope: 'local' })).error).toBeNull();
        expect((await svc.auth.admin.deleteUser(actor.id)).error).toBeNull();
      }
      expect((await svc.from('companies').delete().in('id', companyIds)).error).toBeNull();
      const remaining = await svc.from('companies').select('id').in('id', companyIds);
      expect(remaining.error).toBeNull(); expect(remaining.data).toEqual([]);
      const clean = await state();
      expect(clean.sequences).toEqual([]);
      for (const table of tables) expect(clean.tables[table], table).toEqual([]);
      record('NR exact owned cleanup', { companyIds, actors: actors.map(a => a.id), state: clean, result: 'passed' });
    } finally {
      if (process.env.NR_EVIDENCE_FILE) writeFileSync(process.env.NR_EVIDENCE_FILE, JSON.stringify({ observations }, null, 2) + '\n');
    }
  }, 30000);

  it.each(['accepted', 'auto_matched'])('NR-01 typed explicit %s preserves exact success and local facts over duplicate text', async status => {
    const company = await tenant();
    const source = await raw(company);
    const target = await order(company, { dms_so_no: source.dms_so_no });
    await order(company, { dms_so_no: source.dms_so_no });
    const approved = await match(company, source, target.id, { match_status: status });
    await success(`NR-01 explicit ${status}`, source, target, approved);
  });
  it.each(['sales_orders', null])('NR-01 unresolved canonical table %s stamps only its approved decision', async canonicalTable => {
    const company = await tenant();
    const source = await raw(company);
    const target = await order(company, { dms_so_no_id: source.dms_so_no_id });
    const approved = await match(company, source, null, { canonical_table: canonicalTable });
    await success(`NR-01 unresolved ${canonicalTable}`, source, target, approved);
  });

  const unrelated = [
    ['customer-only', { object_type: 'customer', canonical_table: 'customers' }],
    ['vehicle-only', { object_type: 'vehicle', canonical_table: 'vehicles' }],
    ['payment-only', { object_type: 'invoice_payment_evidence', canonical_table: 'payment_events' }],
    ['non-DMS', { source_system: 'ubs' }], ['wrong raw table', { source_table: 'dms_raw_leads' }],
    ['wrong raw UUID', { source_record_id: crypto.randomUUID() }],
    ...['candidate', 'conflict', 'ignored', 'rejected'].map(status => [`unapproved ${status}`, { match_status: status }]),
  ] as [string, Record<string, unknown>][];
  it.each(unrelated)('NR-02 %s cannot authorize SO normalization', async (name, fields) => {
    const company = await tenant();
    const source = await raw(company);
    await order(company, { dms_so_no_id: source.dms_so_no_id });
    await match(company, source, null, fields);
    await refused(`NR-02 ${name}`, source, '42501');
  });
  it('NR-02 foreign-company approval cannot authorize own raw UUID', async () => {
    const company = await tenant(); const foreign = await tenant();
    const source = await raw(company);
    const target = await order(company, { dms_so_no_id: source.dms_so_no_id });
    await match(foreign, source, target.id);
    await refused('NR-02 foreign company', source, '42501');
  });
  it('NR-02 higher-priority customer evidence cannot mask the explicit SO decision', async () => {
    const company = await tenant();
    const source = await raw(company, { dms_so_no_id: null });
    const fallback = await order(company, { dms_so_no: source.dms_so_no });
    const target = await order(company);
    // The customer decision names a real Customer. Equal UUIDs across two tables
    // expose the old untyped decision misuse without invalid customer evidence.
    await fixture('customers', company, { id: fallback.id, name: 'Repeated customer', notes: 'Unrelated customer target' });
    await match(company, source, fallback.id, { object_type: 'customer', canonical_table: 'customers', source_priority: 1 });
    const approved = await match(company, source, target.id, { source_priority: 20 });
    await success('NR-02 coexisting higher-priority customer', source, target, approved);
  });

  it.each(['unequal priorities', 'equal priorities', 'duplicate unresolved', 'accepted plus auto_matched', 'resolved plus unresolved', 'one malformed'])('NR-03 %s active SO decisions fail cardinality without a winner', async kind => {
      const company = await tenant(); const source = await raw(company);
      const a = await order(company, { dms_so_no_id: source.dms_so_no_id }); const b = await order(company);
      await match(company, source, kind === 'duplicate unresolved' ? null : a.id, { source_priority: 10 });
      await match(company, source, ['duplicate unresolved', 'resolved plus unresolved'].includes(kind) ? null : b.id,
        { source_priority: kind === 'equal priorities' ? 10 : 20, match_status: kind === 'accepted plus auto_matched' ? 'auto_matched' : 'accepted',
          canonical_table: kind === 'one malformed' ? 'customers' : 'sales_orders' });
      await refused(`NR-03 ${kind}`, source, '21000');
    });
  it.each(['customers', 'vehicles', '', '   ', null])('NR-04 explicit target with canonical table %s is malformed', async canonicalTable => {
    const company = await tenant(); const source = await raw(company);
    const target = await order(company, { dms_so_no_id: source.dms_so_no_id });
    await match(company, source, target.id, { canonical_table: canonicalTable });
    await refused(`NR-04 explicit ${canonicalTable}`, source, '22023');
  });
  it('NR-04 unresolved wrong canonical table does not authorize fallback', async () => {
    const company = await tenant(); const source = await raw(company);
    await order(company, { dms_so_no_id: source.dms_so_no_id });
    await match(company, source, null, { canonical_table: 'customers' });
    await refused('NR-04 unresolved wrong table', source, '22023');
  });

  it.each(['external ID', 'text after absent ID', 'text after nonmatching ID'])('NR-05 exact %s selects own target and preserves foreign collisions', async tier => {
    const company = await tenant(); const foreign = await tenant();
    const source = await raw(company, tier === 'text after absent ID' ? { dms_so_no_id: null } : {});
    const target = await order(company, { dms_so_no: source.dms_so_no, dms_so_no_id: tier === 'external ID' ? source.dms_so_no_id : null });
    if (tier === 'external ID') await order(company, { dms_so_no: source.dms_so_no });
    const other = await order(foreign, { dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id });
    const otherRaw = await raw(foreign, { dms_so_no: source.dms_so_no, dms_so_no_id: source.dms_so_no_id });
    await match(foreign, otherRaw, other.id);
    await match(company, source, null, { object_type: 'customer', canonical_table: 'customers', source_priority: 1 });
    const approved = await match(company, source);
    await success(`NR-05 ${tier}`, source, target, approved);
  });
  it('NR-05 company external-ID uniqueness is retained; rejected duplicate insertion changes no rows', async () => {
    const company = await tenant(); const identity = `unique-${crypto.randomUUID()}`;
    await order(company, { dms_so_no_id: identity });
    const before = await state();
    const result = await svc.from('sales_orders').insert({ company_id: company, order_no: crypto.randomUUID(), salesman_name: 'Synthetic',
      branch_code: 'LOCAL', model: 'Saga', booking_date: today, dms_so_no_id: identity });
    expect(result.error?.code).toBe('23505'); expect(await state()).toEqual(before);
  });
  it('NR-05 normalization uniqueness violation rolls back rather than choosing another target', async () => {
    const company = await tenant(); const source = await raw(company);
    await order(company, { dms_so_no_id: source.dms_so_no_id });
    const target = await order(company); await match(company, source, target.id);
    await refused('NR-05 normalization unique violation', source, '23505');
  });

  it('NR-06 ambiguous own text plus foreign collision rejects with full candidate identities intact', async () => {
    const company = await tenant(); const foreign = await tenant();
    const source = await raw(company, { dms_so_no: 'AMBIGUOUS', dms_so_no_id: null });
    const targets = [await order(company, { dms_so_no: 'AMBIGUOUS' }), await order(company, { dms_so_no: 'AMBIGUOUS' })];
    const other = await order(foreign, { dms_so_no: 'AMBIGUOUS' }); await raw(foreign, { dms_so_no: 'AMBIGUOUS', dms_so_no_id: null });
    const approved = await match(company, source);
    record('NR-06 candidate manifest', { raw: source.id, decision: approved.id, company, targets: targets.map(t => t.id), foreign, foreignTarget: other.id });
    await refused('NR-06 ambiguous text', source, '21000');
  });
  it.each(['soft-deleted', 'foreign'])('NR-06 %s text duplicate does not invalidate the one own live target', async kind => {
    const company = await tenant(); const foreign = await tenant();
    const source = await raw(company, { dms_so_no_id: null });
    const target = await order(company, { dms_so_no: source.dms_so_no });
    await order(kind === 'foreign' ? foreign : company, { dms_so_no: source.dms_so_no, is_deleted: kind === 'soft-deleted' });
    const approved = await match(company, source);
    await success(`NR-06 ${kind} duplicate`, source, target, approved);
  });
  it.each([null, '', '   '])('NR-07 blank ID/text %s cannot match equally blank canonical evidence', async value => {
    const company = await tenant(); const source = await raw(company, { dms_so_no: value, dms_so_no_id: value });
    await order(company, { dms_so_no: value, dms_so_no_id: value }); await match(company, source);
    await refused(`NR-07 blank ${value}`, source, null);
  });
  it.each(['', '   '])('NR-07 blank external ID %s still allows usable exact text', async value => {
    const company = await tenant(); const source = await raw(company, { dms_so_no_id: value });
    const target = await order(company, { dms_so_no: source.dms_so_no }); const approved = await match(company, source);
    await success(`NR-07 blank ID ${value} usable text`, source, target, approved);
  });
  it.each(['external ID', 'text'])('NR-07 nonblank %s uses literal equality without trimming, folding or patterns', async tier => {
    const company = await tenant();
    const field = tier === 'external ID' ? 'dms_so_no_id' : 'dms_so_no';
    const source = await raw(company, { dms_so_no: null, dms_so_no_id: null, [field]: ' Ab_% ' });
    for (const value of ['Ab_%', ' ab_% ', ' Ab_123 ']) await order(company, { [field]: value });
    const approved = await match(company, source);
    await refused(`NR-07 ${tier} near matches`, source, null);
    const target = await order(company, { [field]: ' Ab_% ' });
    await success(`NR-07 ${tier} literal match`, source, target, approved);
  });

  it('NR-08 missing raw UUID returns P0002 with all owned state unchanged', async () => {
    await tenant(); await refused('NR-08 missing raw', crypto.randomUUID(), 'P0002');
  });
  it('NR-08 no approved decision returns 42501 and genuine no-target returns exact unmatched', async () => {
    const company = await tenant(); const source = await raw(company);
    await refused('NR-08 no decision', source, '42501');
    await match(company, source); await refused('NR-08 genuine unmatched', source, null);
  });
  it.each(['missing', 'foreign', 'soft-deleted'])('NR-08 explicit %s target refuses fallback to matching live SO', async kind => {
    const company = await tenant(); const foreign = await tenant(); const source = await raw(company);
    await order(company, { dms_so_no: source.dms_so_no });
    const target = kind === 'missing' ? crypto.randomUUID() : (await order(kind === 'foreign' ? foreign : company, { is_deleted: kind === 'soft-deleted' })).id;
    await match(company, source, target); await refused(`NR-08 explicit ${kind}`, source, 'P0002');
  });

  it('NR-10 repeated successful calls retain one target and append one event each', async () => {
    const company = await tenant(); const source = await raw(company); const target = await order(company);
    const approved = await match(company, source, target.id);
    await match(company, source, null, { object_type: 'customer', canonical_table: 'customers' });
    await success('NR-10 first call', source, target, approved);
    const prior = await state();
    await success('NR-10 replay', prior.tables.dms_raw_sales_orders.find(r => r.id === source.id)!,
      prior.tables.sales_orders.find(r => r.id === target.id)!, prior.tables.source_reconciliation_matches.find(r => r.id === approved.id)!);
  });
  it('NR-10 independent clients wait on the same raw lock and serialize two successful normalizations', async () => {
    const company = await tenant(); const source = await raw(company); const target = await order(company);
    const approved = await match(company, source); // Unresolved decision becomes explicit in the first call.
    expect((await svc.from('sales_orders').update({ dms_so_no_id: source.dms_so_no_id }).eq('id', target.id)).error).toBeNull();
    const before = await state(); const canonical = before.tables.sales_orders.find(r => r.id === target.id)!;
    const barrier = await blocker('dms_raw_sales_orders', source.id);
    const calls = Promise.all([svc, second].map(client => Promise.resolve(client.rpc('normalize_dms_sales_order', { p_raw_id: source.id }))));
    try {
      const waiters = await waitBlocked(barrier.pid, 2);
      await barrier.command('COMMIT;');
      const results = await calls; const after = await state();
      record('NR-10 concurrent raw barrier', { waiters, blockerPid: barrier.pid, results, before, after });
      verifySuccess(before, after, source, canonical, approved, results);
    } finally { await barrier.close(); await calls; }
  }, 20000);
  it.each(['decision status', 'explicit target deleted', 'explicit target company', 'text target deleted'])('NR-10 revalidates %s after waiting for the existing row lock', async kind => {
      const company = await tenant(); const foreign = await tenant();
      const source = await raw(company, { dms_so_no_id: null }); const target = await order(company, { dms_so_no: source.dms_so_no });
      const approved = await match(company, source, kind === 'text target deleted' ? null : target.id);
      const decision = kind === 'decision status';
      const before = await state();
      const barrier = await blocker(decision ? 'source_reconciliation_matches' : 'sales_orders', decision ? approved.id : target.id);
      const call = Promise.resolve(svc.rpc('normalize_dms_sales_order', { p_raw_id: source.id }));
      try {
        await waitBlocked(barrier.pid, 1);
        await barrier.command(decision
          ? `UPDATE public.source_reconciliation_matches SET match_status='rejected' WHERE id='${approved.id}';`
          : `UPDATE public.sales_orders SET ${kind === 'explicit target company' ? `company_id='${foreign}'` : 'is_deleted=true'} WHERE id='${target.id}';`);
        await barrier.command('COMMIT;');
        const result = await call; const after = await state();
        // The deliberate blocker edit is the expected baseline; no normalizer writes are allowed.
        const persisted = decision ? after.tables.source_reconciliation_matches.find(r => r.id === approved.id)! : after.tables.sales_orders.find(r => r.id === target.id)!;
        expect(persisted).toEqual(decision ? { ...approved, match_status: 'rejected', updated_at: persisted.updated_at }
          : { ...target, ...(kind === 'explicit target company' ? { company_id: foreign } : { is_deleted: true }), updated_at: persisted.updated_at });
        const expected = decision ? '42501' : kind === 'text target deleted' ? null : 'P0002';
        const changedTable = decision ? 'source_reconciliation_matches' : 'sales_orders';
        const expectedState = { ...before, tables: { ...before.tables,
          [changedTable]: sorted(before.tables[changedTable].map(row => row.id === persisted.id ? persisted : row)) } };
        record(`NR-10 revalidation ${kind}`, { result, blockerPid: barrier.pid, deliberateRow: persisted, before, expectedState, after });
        expect(result.error?.code ?? null).toBe(expected);
        expect(result.data).toEqual(expected ? null : unmatched(source));
        expect(after).toEqual(expectedState);
        // Repeat after the deliberate edit verifies full no-write state, and the raw/event/match/SO
        // checks below verify that the originally waiting call also left no hidden partial write.
        expect(after.tables.dms_raw_sales_orders.find(r => r.id === source.id)).toEqual(source);
        expect(after.tables.source_reconciliation_events).toEqual(before.tables.source_reconciliation_events);
        if (decision) expect(after.tables.sales_orders.find(r => r.id === target.id)).toEqual(target);
        else expect(after.tables.source_reconciliation_matches.find(r => r.id === approved.id)).toEqual(approved);
        await refused(`NR-10 repeated revalidated ${kind}`, source, expected);
      } finally { await barrier.close(); await call; }
    }, 20000);

  it('NR-11 catalog retains service-only SECURITY DEFINER and safe search_path without PUBLIC execution', () => {
    const catalog = sql<Record<string, unknown>>(`select json_build_object('definer',p.prosecdef,'config',p.proconfig,
      'service',has_function_privilege('service_role',p.oid,'EXECUTE'),
      'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
      'public',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'))
      from pg_proc p where p.oid='public.normalize_dms_sales_order(uuid)'::regprocedure`);
    expect(catalog).toEqual({ definer: true, config: ['search_path=pg_catalog, public'], service: true, authenticated: false, anon: false, public: false });
    record('NR-11 catalog', catalog);
  });
  it.each(['anonymous', 'active sales', 'active company_admin', 'inactive'])('NR-11 %s cannot execute a fully eligible normalization', async kind => {
    const company = await tenant(); const source = await raw(company); const target = await order(company);
    await match(company, source, target.id);
    let client = anonymous; let actorId: string | undefined;
    if (kind !== 'anonymous') {
      const email = `nr-${crypto.randomUUID()}@rls.test`;
      const user = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
      expect(user.error).toBeNull(); actorId = user.data.user!.id;
      client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, options(email));
      actors.push({ id: actorId, client });
      expect((await svc.from('profiles').update({ company_id: company, access_scope: 'company', status: 'active',
        role: kind === 'active company_admin' ? 'company_admin' : 'sales' }).eq('id', actorId)).error).toBeNull();
      const login = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
      expect(login.error).toBeNull(); expect(login.data.user?.id).toBe(actorId);
      if (kind === 'inactive') expect((await svc.from('profiles').update({ status: 'inactive' }).eq('id', actorId)).error).toBeNull();
    }
    try { await refused(`NR-11 ${kind}`, source, '42501', client); }
    finally { if (kind === 'inactive') expect((await svc.from('profiles').update({ status: 'active' }).eq('id', actorId!)).error).toBeNull(); }
  });
});
