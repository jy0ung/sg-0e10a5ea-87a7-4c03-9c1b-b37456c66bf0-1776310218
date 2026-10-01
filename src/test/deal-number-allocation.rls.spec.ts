/** Real Auth/PostgREST/PostgreSQL acceptance; only the service's client export is substituted. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
interface Actor { client: SupabaseClient; id: string; companyId: string }
interface Branch { id: string; code: string }
const options = (storageKey: string) => ({
  auth: { persistSession: false, storageKey },
  realtime: { transport: WebSocket as never },
});

live('durable Deal number allocation', () => {
  let svc: SupabaseClient;
  let actor: Actor;
  let peer: Actor;
  let foreign: Actor;
  let admin: Actor;
  let global: Actor;
  let anonymous: SupabaseClient;
  let period: { year: string; month: string };
  let createDeal: typeof import('@/services/dealService').createDeal;
  const actors: Actor[] = [];
  const authIds: string[] = [];
  const companyIds: string[] = [];
  const branchIds: string[] = [];
  const dealIds: string[] = [];

  async function tenant() {
    const id = `deal-number-${crypto.randomUUID()}`;
    const result = await svc.from('companies').insert({ id, code: id, name: 'Synthetic number regression tenant' });
    expect(result.error).toBeNull();
    companyIds.push(id);
    return id;
  }

  async function login(companyId: string, role = 'manager', scope = 'company'): Promise<Actor> {
    const email = `deal-number-${crypto.randomUUID()}@rls.test`;
    const created = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    authIds.push(id);
    const profile = await svc.from('profiles').update({ company_id: companyId, role, access_scope: scope, status: 'active' }).eq('id', id);
    expect(profile.error).toBeNull();
    const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, options(email));
    const result = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBe(id);
    const value = { client, id, companyId };
    actors.push(value);
    return value;
  }

  async function branch(code: string, companyId = actor.companyId): Promise<Branch> {
    const result = await svc.from('branches').insert({ company_id: companyId, code, name: `Synthetic ${code}` }).select('id,code').single();
    expect(result.error).toBeNull();
    branchIds.push(result.data!.id);
    return result.data!;
  }

  function prefix(code: string) { return `DEAL/${code}/${period.year}/${period.month}/`; }

  async function allocate(who: Actor, branchId: string | null = null) {
    const result = await who.client.rpc('generate_deal_no', { p_company_id: who.companyId, p_branch_id: branchId });
    expect(result.error).toBeNull();
    expect(typeof result.data).toBe('string');
    return result.data as string;
  }

  async function insert(who: Actor, dealNo: string, branchId: string | null = null) {
    const id = crypto.randomUUID();
    dealIds.push(id);
    const result = await who.client.from('deals').insert({
      id, company_id: who.companyId, branch_id: branchId, deal_no: dealNo,
      customer_name: 'Identical synthetic customer', created_by: who.id, sales_advisor_id: who.id,
      stage: 'lead', deposit_amount: 0,
    }).select('*').single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id, deal_no: dealNo, company_id: who.companyId, branch_id: branchId });
    return result.data!;
  }

  async function sequences() {
    const result = await svc.from('deal_number_sequences')
      .select('company_id,branch_label,year,month,last_number::text,updated_at')
      .in('company_id', companyIds).order('company_id').order('branch_label').order('year').order('month');
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function counter(code: string, companyId = actor.companyId) {
    const rows = await sequences();
    const found = rows.find(row => row.company_id === companyId && row.branch_label === code
      && row.year === Number(period.year) && row.month === Number(period.month));
    expect(found).toBeDefined();
    return found!;
  }

  async function businessState() {
    const state: Record<string, { count: number; rows: Array<Record<string, unknown> & { id: string }> }> = {};
    for (const name of [
      'deals', 'deal_activities', 'deal_loan', 'deal_insurance', 'deal_registration',
      'sales_orders', 'dms_raw_sales_orders', 'dms_raw_leads', 'dms_raw_prospects', 'customers',
      'invoices', 'dealer_invoices', 'payment_events', 'supplier_payment_events',
      'official_receipts', 'purchase_invoices', 'journal_entries',
    ]) {
      const result = await svc.from(name).select('*', { count: 'exact' }).in('company_id', companyIds).order('id');
      if (result.error) throw new Error(`${name} population check failed: ${result.error.message}`);
      expect(result.count).toBe(result.data!.length);
      state[name] = { count: result.count!, rows: result.data! };
    }
    return state;
  }

  async function persistedDeals(ids: string[]) {
    const result = await svc.from('deals').select('*').in('id', ids).order('id');
    expect(result.error).toBeNull();
    return result.data!;
  }

  beforeAll(async () => {
    // Production is also loopback: require the runner's unique disposable container too.
    const url = new URL(process.env.VITE_SUPABASE_URL ?? 'http://invalid');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)
      || !process.env.RLS_DB_CONTAINER?.startsWith('supabase_db_ubs-readiness-')) {
      throw new Error('Use npm run test:integration on the disposable readiness stack.');
    }
    svc = createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, options('deal-number-service'));
    period = JSON.parse(execFileSync('docker', [
      'exec', process.env.RLS_DB_CONTAINER!, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c',
      "select json_build_object('year', to_char(now(),'YY'), 'month', to_char(now(),'MM'))",
    ], { encoding: 'utf8' }).trim());
    actor = await login(await tenant());
    peer = await login(actor.companyId);
    foreign = await login(await tenant());
    admin = await login(actor.companyId, 'company_admin');
    global = await login(actor.companyId, 'super_admin', 'global');
    anonymous = createClient(url.href, process.env.VITE_SUPABASE_ANON_KEY!, options('deal-number-anonymous'));
    // Actual authenticated client; no rpc/from/network/row mocks and no production DI.
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: actor.client }));
    createDeal = (await import('@/services/dealService')).createDeal;
  }, 30000);

  afterAll(async () => {
    vi.doUnmock('@/integrations/supabase/client');
    if (!svc) return;
    if (dealIds.length) expect((await svc.from('deals').delete().in('id', dealIds)).error).toBeNull();
    if (branchIds.length) expect((await svc.from('branches').delete().in('id', branchIds)).error).toBeNull();
    for (const who of actors) await who.client.auth.signOut({ scope: 'local' });
    for (const id of authIds) expect((await svc.auth.admin.deleteUser(id)).error).toBeNull();
    if (companyIds.length) expect((await svc.from('companies').delete().in('id', companyIds)).error).toBeNull();
  });

  it('DN-01 / DN-10 real createDeal twice without a branch persists zero/positive deposits and only normal local creations', async () => {
    const before = await businessState();
    const rows = [];
    for (const deposit of [0, 500]) {
      const result = await createDeal({ company_id: actor.companyId, customer_name: 'Identical synthetic customer', deposit_amount: deposit, sales_advisor_id: actor.id }, actor.id);
      if (result.data) dealIds.push(result.data.id);
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      const persisted = await actor.client.from('deals').select('*').eq('id', result.data!.id).single();
      expect(persisted.error).toBeNull();
      expect(persisted.data).toEqual(result.data);
      expect(persisted.data).toMatchObject({ branch_id: null, deposit_amount: deposit, stage: 'lead', created_by: actor.id });
      const activities = await actor.client.from('deal_activities').select('*').eq('deal_id', result.data!.id);
      expect(activities.error).toBeNull();
      expect(activities.data).toHaveLength(1);
      expect(activities.data![0]).toMatchObject({ actor_id: actor.id, company_id: actor.companyId, action: 'deal_created', metadata: { deal_no: result.data!.deal_no } });
      rows.push(persisted.data!);
    }
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    expect(new Set(rows.map(row => row.deal_no)).size).toBe(2);
    const after = await businessState();
    expect(after.deals.count).toBe(before.deals.count + 2);
    expect(after.deals.rows.filter(row => !before.deals.rows.some(old => old.id === row.id)).map(row => row.id).sort())
      .toEqual(rows.map(row => row.id).sort());
    expect(after.deal_activities.count).toBe(before.deal_activities.count + 2);
    for (const name of Object.keys(before).filter(name => !['deals', 'deal_activities'].includes(name))) {
      expect(after[name], name).toEqual(before[name]);
    }
  });

  for (const label of ['null', 'explicit'] as const) {
    it(`DN-03 independent sessions concurrently reserve ${label} branch numbers before any insertion`, async () => {
      const branchId = label === 'null' ? null : (await branch('CONCURRENT')).id;
      const numbers = await Promise.all([allocate(actor, branchId), allocate(peer, branchId)]);
      expect(new Set(numbers).size).toBe(2);
      const rows = await Promise.all(numbers.map((number, index) => insert(index === 0 ? actor : peer, number, branchId)));
      expect(new Set(rows.map(row => row.id)).size).toBe(2);
      expect(rows.map(row => row.deal_no)).toEqual(numbers);
    });
  }

  it('DN-06 existing 100 and 999 advance to 1000 and 1001 without truncation', async () => {
    const grown = await branch('GROWTH');
    await insert(actor, `${prefix(grown.code)}100`, grown.id);
    await insert(actor, `${prefix(grown.code)}999`, grown.id);
    for (const suffix of ['1000', '1001']) {
      const number = await allocate(actor, grown.id);
      expect(number).toBe(`${prefix(grown.code)}${suffix}`);
      await insert(actor, number, grown.id);
    }
  });

  it('DN-02 sequential valid-branch creations retain the label, padding, UUIDs and identical customer evidence', async () => {
    const outlet = await branch('SEQUENTIAL');
    const rows = [];
    for (const suffix of ['001', '002']) {
      const number = await allocate(actor, outlet.id);
      expect(number).toBe(`${prefix(outlet.code)}${suffix}`);
      rows.push(await insert(actor, number, outlet.id));
    }
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[0].customer_name).toBe(rows[1].customer_name);
    expect(await persistedDeals(rows.map(row => row.id))).toEqual([...rows].sort((a, b) => a.id.localeCompare(b.id)));
    expect((await counter(outlet.code)).last_number).toBe('2');
  });

  it('DN-04 reservations survive abandonment, a rejected insert and authenticated deletion without extra rows', async () => {
    const gaps = await branch('GAPS');
    const before = await businessState();
    expect(await allocate(actor, gaps.id)).toBe(`${prefix(gaps.code)}001`); // abandoned
    expect((await counter(gaps.code)).last_number).toBe('1');
    const failedNumber = await allocate(actor, gaps.id);
    const failedId = crypto.randomUUID();
    dealIds.push(failedId);
    const failed = await actor.client.from('deals').insert({
      id: failedId, company_id: actor.companyId, branch_id: gaps.id, deal_no: failedNumber,
      customer_name: null, created_by: actor.id,
    });
    expect(failed.error?.code).toBe('23502');
    expect(failedNumber).toBe(`${prefix(gaps.code)}002`);
    expect((await counter(gaps.code)).last_number).toBe('2');
    expect(await businessState()).toEqual(before);
    const third = await allocate(actor, gaps.id);
    expect(third).toBe(`${prefix(gaps.code)}003`);
    const row = await insert(actor, third, gaps.id);
    const deleted = await admin.client.from('deals').delete().eq('id', row.id).select('id');
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual([{ id: row.id }]);
    expect((await counter(gaps.code)).last_number).toBe('3');
    expect(await allocate(actor, gaps.id)).toBe(`${prefix(gaps.code)}004`);
    expect((await counter(gaps.code)).last_number).toBe('4');
    expect(await businessState()).toEqual(before);
  });

  it('DN-05 valid historical suffixes bootstrap and later advance the counter while full historical rows remain unchanged', async () => {
    const historic = await branch('HISTORY');
    const ids = [];
    for (const number of [
      `${prefix(historic.code)}00700`, `${prefix(historic.code)}${'0'.repeat(40)}699`,
      `${prefix(historic.code)}-9`, `${prefix(historic.code)}2x`, `${prefix(historic.code)}999/extra`,
      prefix(historic.code), `${prefix('UNRELATED')}99999`, 'arbitrary legacy reference',
      `DEAL/${historic.code}/${period.year}/00/99999`,
    ]) ids.push((await insert(actor, number, historic.id)).id);
    const before = await persistedDeals(ids);
    expect(await allocate(actor, historic.id)).toBe(`${prefix(historic.code)}701`);
    // High-water follows the literal number namespace, even with null branch metadata.
    ids.push((await insert(actor, `${prefix(historic.code)}1300`)).id);
    const later = await persistedDeals(ids);
    expect(await allocate(actor, historic.id)).toBe(`${prefix(historic.code)}1301`);
    expect((await counter(historic.code)).last_number).toBe('1301');
    expect(await persistedDeals(ids)).toEqual(later);
    expect(later.filter(row => before.some(old => old.id === row.id))).toEqual(before);
  });

  it('DN-06 suffixes also grow beyond a signed 32-bit counter', async () => {
    const wide = await branch('WIDE');
    await insert(actor, `${prefix(wide.code)}2147483647`, wide.id);
    expect(await allocate(actor, wide.id)).toBe(`${prefix(wide.code)}2147483648`);
    expect((await counter(wide.code)).last_number).toBe('2147483648');
  });

  it('DN-06 final bigint reservation succeeds and exhaustion fails clearly without resetting state', async () => {
    const limit = await branch('CAPACITY');
    await allocate(actor, limit.id);
    expect((await svc.from('deal_number_sequences').update({ last_number: '9223372036854775806' })
      .eq('company_id', actor.companyId).eq('branch_label', limit.code)).error).toBeNull();
    expect(await allocate(actor, limit.id)).toBe(`${prefix(limit.code)}9223372036854775807`);
    expect((await counter(limit.code)).last_number).toBe('9223372036854775807');
    const before = await sequences();
    const business = await businessState();
    const result = await actor.client.rpc('generate_deal_no', { p_company_id: actor.companyId, p_branch_id: limit.id });
    expect(result.error?.code).toBe('22003');
    expect(result.error?.message).toContain('capacity exhausted');
    expect(await sequences()).toEqual(before);
    expect(await businessState()).toEqual(business);
  });

  it('DN-05 / DN-06 valid existing suffix beyond bigint capacity fails clearly and rolls back initialization', async () => {
    const huge = await branch('HUGE');
    const existing = await insert(actor, `${prefix(huge.code)}${'9'.repeat(40)}`, huge.id);
    const before = await sequences();
    const result = await actor.client.rpc('generate_deal_no', { p_company_id: actor.companyId, p_branch_id: huge.id });
    expect(result.error?.code).toBe('22003');
    expect(result.error?.message).toContain('capacity exhausted');
    expect(await sequences()).toEqual(before);
    expect(await persistedDeals([existing.id])).toEqual([existing]);
  });

  it('DN-07 GEN shares reservations across null, real GEN and unresolved/foreign branch compatibility', async () => {
    const gen = await branch('GEN');
    const foreignBranch = await branch('FOREIGN', foreign.companyId);
    const before = BigInt((await counter('GEN')).last_number);
    const numbers = await Promise.all([allocate(actor), allocate(peer, gen.id)]);
    expect(new Set(numbers).size).toBe(2);
    expect(numbers.every(number => number.startsWith(prefix('GEN')))).toBe(true);
    await insert(actor, numbers[0]);
    await insert(peer, numbers[1], gen.id);
    const unresolved = await allocate(actor, `unknown-${crypto.randomUUID()}`);
    const foreignFallback = await allocate(actor, foreignBranch.id);
    expect(unresolved).toBe(`${prefix('GEN')}${String(before + 3n).padStart(3, '0')}`);
    expect(foreignFallback).toBe(`${prefix('GEN')}${String(before + 4n).padStart(3, '0')}`);
    expect((await counter('GEN')).last_number).toBe(String(before + 4n));
  });

  it('DN-07 distinct labels and companies reserve independently despite identical customer evidence', async () => {
    const one = await branch('ISOLATED_A');
    const two = await branch('ISOLATED_B');
    const other = await branch(one.code, foreign.companyId);
    const values = await Promise.all([allocate(actor, one.id), allocate(actor, two.id), allocate(foreign, other.id)]);
    expect(values).toEqual([`${prefix(one.code)}001`, `${prefix(two.code)}001`, `${prefix(one.code)}001`]);
    const rows = await Promise.all([insert(actor, values[0], one.id), insert(actor, values[1], two.id), insert(foreign, values[2], other.id)]);
    expect(new Set(rows.map(row => row.id)).size).toBe(3);
    for (const [who, outlet] of [[actor, one], [actor, two], [foreign, other]] as const) {
      expect((await counter(outlet.code, who.companyId)).last_number).toBe('1');
    }
  });

  it('DN-07 branch wildcard, regex and slash characters are literal in existing-number matching', async () => {
    const literal = await branch('W%_.[x]/part');
    await insert(actor, `${prefix(literal.code)}008`, literal.id);
    await insert(actor, `${prefix('WZZQ.[x]/part')}99999`, literal.id);
    expect(await allocate(actor, literal.id)).toBe(`${prefix(literal.code)}009`);
    expect((await counter(literal.code)).last_number).toBe('9');
  });

  for (const denied of ['anonymous', 'inactive session', 'forged company'] as const) {
    it(`DN-08 ${denied} allocation is denied without changing counters or business populations`, async () => {
      expect(await allocate(peer)).toMatch(/^DEAL\/GEN\//); // populated positive control
      const before = await sequences();
      const business = await businessState();
      try {
        if (denied === 'inactive session') {
          expect((await svc.from('profiles').update({ status: 'inactive' }).eq('id', peer.id)).error).toBeNull();
        }
        const result = await (denied === 'anonymous' ? anonymous : peer.client).rpc('generate_deal_no', {
          p_company_id: denied === 'forged company' ? foreign.companyId : peer.companyId, p_branch_id: null,
        });
        expect(result.error?.code).toBe('42501');
        expect(result.data).toBeNull();
        expect(await sequences()).toEqual(before);
        expect(await businessState()).toEqual(business);
      } finally {
        if (denied === 'inactive session') {
          expect((await svc.from('profiles').update({ status: 'active' }).eq('id', peer.id)).error).toBeNull();
        }
      }
      expect(await allocate(peer)).toMatch(/^DEAL\/GEN\//);
    });
  }

  it('DN-08 existing global and service-role callers retain cross-company allocation', async () => {
    const outlet = await branch('PRIVILEGED', foreign.companyId);
    const before = await businessState();
    const globalResult = await global.client.rpc('generate_deal_no', { p_company_id: foreign.companyId, p_branch_id: outlet.id });
    const serviceResult = await svc.rpc('generate_deal_no', { p_company_id: foreign.companyId, p_branch_id: outlet.id });
    expect(globalResult.error).toBeNull();
    expect(serviceResult.error).toBeNull();
    expect([globalResult.data, serviceResult.data]).toEqual([`${prefix(outlet.code)}001`, `${prefix(outlet.code)}002`]);
    expect((await counter(outlet.code, foreign.companyId)).last_number).toBe('2');
    expect(await businessState()).toEqual(before);
  });

  for (const role of ['anonymous', 'manager', 'company admin'] as const) {
    for (const operation of ['read', 'insert', 'update', 'delete'] as const) {
      it(`DN-09 ${role} direct counter ${operation} cannot expose or mutate private state`, async () => {
        const client = role === 'anonymous' ? anonymous : role === 'manager' ? actor.client : admin.client;
        const before = await sequences();
        const business = await businessState();
        const row = {
          company_id: actor.companyId, branch_label: 'GEN', year: Number(period.year), month: Number(period.month),
        };
        const result = operation === 'read' ? await client.from('deal_number_sequences').select('*')
          : operation === 'insert' ? await client.from('deal_number_sequences').insert({ ...row, branch_label: 'BYPASS', last_number: 9999 })
          : operation === 'update' ? await client.from('deal_number_sequences').update({ last_number: 0 }).match(row).select('*')
          : await client.from('deal_number_sequences').delete().match(row).select('*');
        expect(result.error?.code).toBe('42501');
        expect(result.data).toBeNull();
        // Privileged equality also detects mutation hidden behind a zero-row RLS response.
        expect(await sequences()).toEqual(before);
        expect(await businessState()).toEqual(business);
      });
    }
  }

  it('DN-10 allocation alone changes only its counter, with no local/source/commercial/financial rows', async () => {
    const outlet = await branch('NO_SIDE_EFFECTS');
    const before = await businessState();
    const number = await allocate(actor, outlet.id);
    expect(number).toBe(`${prefix(outlet.code)}001`);
    expect((await counter(outlet.code)).last_number).toBe('1');
    expect(await businessState()).toEqual(before);
  });
});
