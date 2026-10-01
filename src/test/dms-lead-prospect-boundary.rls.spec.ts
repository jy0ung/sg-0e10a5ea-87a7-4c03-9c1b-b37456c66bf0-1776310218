/** Business/security evidence on the existing disposable readiness stack. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
type Kind = 'lead' | 'prospect';
interface Actor { client: SupabaseClient; id: string; companyId: string }
interface Source { kind: Kind; id: string; externalId: string; row: Record<string, unknown> }
const table = (kind: Kind) => kind === 'lead' ? 'dms_raw_leads' : 'dms_raw_prospects';
const externalColumn = (kind: Kind) => kind === 'lead' ? 'dms_lead_id' : 'dms_prospect_id';
const options = (storageKey: string) => ({
  auth: { persistSession: false, storageKey },
  realtime: { transport: WebSocket as never },
});

live('DMSv3 Lead/Prospect source and local follow-up boundary', () => {
  let svc: SupabaseClient;
  let actorA: Actor;
  let actorB: Actor;
  let managerA: Actor;
  let managerB: Actor;
  let sourcesA: Record<Kind, Source>;
  let sourcesB: Record<Kind, Source>;
  let direct: Source;
  const sources: Source[] = [];
  const followupIds: string[] = [];
  const ownedActors: Actor[] = [];
  const ownedAuthIds: string[] = [];
  const ownedCompanyIds: string[] = [];

  async function createManager(companyId: string): Promise<Actor> {
    const email = `dms-lp-${crypto.randomUUID()}@rls.test`;
    const created = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
    expect(created.error).toBeNull();
    expect(created.data.user).not.toBeNull();
    const id = created.data.user!.id;
    ownedAuthIds.push(id);
    const profile = await svc.from('profiles').update({
      company_id: companyId, role: 'manager', access_scope: 'company', status: 'active',
    }).eq('id', id).select('id,company_id,role,access_scope,status').single();
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({ id, company_id: companyId, role: 'manager', access_scope: 'company', status: 'active' });
    const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, options(email));
    const login = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
    expect(login.error).toBeNull();
    expect(login.data.user?.id).toBe(id);
    const actor = { client, id, companyId };
    ownedActors.push(actor);
    return actor;
  }

  async function createTenantManager(): Promise<Actor> {
    const id = `dms-lp-${crypto.randomUUID()}`;
    const created = await svc.from('companies').insert({ id, code: id, name: 'Synthetic DMS regression tenant' }).select('id').single();
    expect(created.error).toBeNull();
    ownedCompanyIds.push(id);
    return createManager(id);
  }

  async function companyRows(name: string, companyIds: string[], columns = '*') {
    const result = await svc.from(name).select(columns).in('company_id', companyIds).order('id');
    if (result.error) throw new Error(`${name} snapshot failed: ${result.error.message}`);
    expect(result.data).not.toBeNull();
    return result.data!;
  }

  async function boundaryState(...companyIds: string[]) {
    const state: Record<string, unknown> = {};
    for (const name of ['dms_raw_leads', 'dms_raw_prospects', 'lead_followups']) {
      state[name] = await companyRows(name, companyIds);
    }
    return state;
  }

  async function businessState(...companyIds: string[]) {
    // Real, tenant-scoped IDs/counts catch implicit commercial or money events.
    // No such events are provisioned as part of these source/follow-up commands.
    const state: Record<string, unknown> = {};
    for (const name of [
      'dms_raw_leads', 'deals', 'deal_activities', 'deal_loan', 'deal_insurance', 'deal_registration',
      'sales_orders', 'dms_raw_sales_orders', 'customers', 'invoices', 'dealer_invoices',
      'payment_events', 'supplier_payment_events', 'official_receipts', 'purchase_invoices', 'journal_entries',
    ]) {
      const result = await svc.from(name).select('id', { count: 'exact' }).in('company_id', companyIds).order('id');
      if (result.error) throw new Error(`${name} side-effect check failed: ${result.error.message}`);
      expect(result.count).toBe(result.data!.length);
      state[name] = { count: result.count, ids: result.data };
    }
    return state;
  }

  function databaseDates(): { yesterday: string; today: string; tomorrow: string } {
    return JSON.parse(execFileSync('docker', [
      'exec', process.env.RLS_DB_CONTAINER!, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c',
      "select json_build_object('yesterday', current_date - 1, 'today', current_date, 'tomorrow', current_date + 1)",
    ], { encoding: 'utf8' }).trim());
  }

  async function feed(actor: Actor, branchCode?: string, kind?: Kind) {
    const result = await actor.client.rpc('get_leads_feed', {
      p_company_id: actor.companyId, p_branch_code: branchCode ?? null, p_kind: kind ?? null,
    });
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    return result.data as Array<Record<string, unknown>>;
  }

  async function detail(actor: Actor, source: Source) {
    const result = await actor.client.rpc('get_lead_detail', {
      p_company_id: actor.companyId, p_source_kind: source.kind, p_raw_id: source.id,
    });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    return result.data[0] as Record<string, unknown> & { followups: Array<Record<string, unknown>> };
  }

  async function pinFollowupTime(id: string, createdAt: string) {
    const result = await svc.from('lead_followups').update({ created_at: createdAt }).eq('id', id).select('id').single();
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(id);
    const persisted = await followupSnapshot(id);
    expect(Date.parse(persisted.created_at)).toBe(Date.parse(createdAt));
    return persisted;
  }

  async function signIn(letter: 'A' | 'B'): Promise<Actor> {
    const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, options(`dms-boundary-${letter}`));
    const login = await client.auth.signInWithPassword({
      email: process.env[`RLS_USER_${letter}_EMAIL`] ?? `${letter.toLowerCase()}@rls.test`,
      password: process.env[`RLS_USER_${letter}_PASSWORD`] ?? 'Test1234!',
    });
    expect(login.error).toBeNull();
    expect(login.data.user).not.toBeNull();
    const profile = await client.from('profiles').select('company_id,role,access_scope').eq('id', login.data.user!.id).single();
    expect(profile.error).toBeNull();
    // Existing server contract: enabled same-company staff, with no elevation.
    expect(profile.data).toMatchObject({ role: 'creator_updater', access_scope: 'self' });
    return { client, id: login.data.user!.id, companyId: profile.data!.company_id };
  }

  async function seedSource(actor: Actor, kind: Kind, leadId?: string | null, overrides: Record<string, unknown> = {}): Promise<Source> {
    const externalId = String(overrides[externalColumn(kind)] ?? `DMS-${kind}-${crypto.randomUUID()}`);
    const payload = {
      customer: { id: 'UPSTREAM-CUSTOMER', name: 'Same Display Name', phone: '0123456789' },
      progress: 'source-progress', rating: '95051001',
      model: 'Saga', variant: 'Premium', colour: 'Silver',
      first_source: 'DMS', second_source: 'Event', channel: 'Showroom', event: 'Source event',
      booking_id: null, booking_money: 0,
      follow_up_count: 7, last_follow_up: '2026-09-29T09:00:00Z', next_follow_up: '2026-10-03',
      ...(leadId !== undefined ? { lead_id: leadId } : {}),
    };
    const result = await svc.from(table(kind)).insert({
      company_id: actor.companyId,
      [externalColumn(kind)]: externalId,
      dms_customer_id: 'UPSTREAM-CUSTOMER', branch_code: 'KK', salesperson_code: 'DMS-SA-001',
      [kind === 'lead' ? 'lead_status' : 'prospect_status']: '95041001',
      [kind === 'lead' ? 'lead_created_at' : 'prospect_created_at']: '2026-09-28T08:00:00Z',
      fetched_at: '2026-09-30T08:00:00Z',
      payload_hash: externalId, raw_payload: payload, normalized_payload: { source_evidence: true },
      ...overrides,
    }).select('*').single();
    expect(result.error).toBeNull();
    const source = { kind, id: result.data!.id, externalId, row: result.data! };
    sources.push(source);
    return source;
  }

  async function sourceSnapshot(source: Source) {
    const result = await svc.from(table(source.kind)).select('*').eq('id', source.id).single();
    expect(result.error).toBeNull();
    return result.data;
  }

  async function addFollowup(actor: Actor, source: Source, opts: { notes?: string; outcome?: string; nextActionDate?: string | null } = {}) {
    const result = await actor.client.rpc('add_lead_followup', {
      p_company_id: actor.companyId, p_source_kind: source.kind, p_source_raw_id: source.id,
      p_notes: opts.notes ?? 'FLC local note', p_outcome: opts.outcome ?? 'callback_scheduled',
      p_next_action_date: opts.nextActionDate === undefined ? '2026-10-05' : opts.nextActionDate,
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatch(/^[0-9a-f-]{36}$/);
    followupIds.push(result.data);
    return result.data as string;
  }

  async function followupSnapshot(id: string) {
    const result = await svc.from('lead_followups').select('*').eq('id', id).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function leadIds() {
    const result = await svc.from('dms_raw_leads').select('id').eq('company_id', actorA.companyId).order('id');
    expect(result.error).toBeNull();
    return result.data;
  }

  async function directInsert(actor: Actor, source: Source, overrides: Record<string, unknown> = {}) {
    const id = crypto.randomUUID();
    followupIds.push(id);
    const result = await actor.client.from('lead_followups').insert({
      id, company_id: actor.companyId, source_kind: source.kind, source_raw_id: source.id,
      notes: 'Valid local note', author_id: actor.id, ...overrides,
    }).select('id');
    return { ...result, id };
  }

  beforeAll(async () => {
    // Loopback alone is insufficient: the production stack is also local on this host.
    const url = new URL(process.env.VITE_SUPABASE_URL ?? 'http://invalid');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)
      || !process.env.RLS_DB_CONTAINER?.startsWith('supabase_db_ubs-readiness-')) {
      throw new Error('Run this suite through npm run test:integration on its disposable readiness stack.');
    }
    svc = createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, options('dms-boundary-service'));
    actorA = await signIn('A');
    actorB = await signIn('B');
    expect(actorA.companyId).not.toBe(actorB.companyId);
    const leadA = await seedSource(actorA, 'lead');
    const leadB = await seedSource(actorB, 'lead');
    sourcesA = { lead: leadA, prospect: await seedSource(actorA, 'prospect', leadA.externalId) };
    sourcesB = { lead: leadB, prospect: await seedSource(actorB, 'prospect', leadB.externalId) };
    direct = await seedSource(actorA, 'prospect', null);
    managerA = await createTenantManager();
    managerB = await createTenantManager();
  });

  afterAll(async () => {
    if (!svc) return;
    if (followupIds.length) {
      const deleted = await svc.from('lead_followups').delete().in('id', followupIds);
      expect(deleted.error).toBeNull();
    }
    for (const kind of ['lead', 'prospect'] as const) {
      const ids = sources.filter(source => source.kind === kind).map(source => source.id);
      if (ids.length) {
        const deleted = await svc.from(table(kind)).delete().in('id', ids);
        expect(deleted.error).toBeNull();
      }
    }
    await actorA?.client.auth.signOut();
    await actorB?.client.auth.signOut();
    for (const actor of ownedActors) await actor.client.auth.signOut({ scope: 'local' });
    for (const id of ownedAuthIds) {
      const deleted = await svc.auth.admin.deleteUser(id);
      expect(deleted.error).toBeNull();
    }
    if (ownedCompanyIds.length) {
      const deleted = await svc.from('companies').delete().in('id', ownedCompanyIds);
      expect(deleted.error).toBeNull();
    }
  });

  for (const label of ['lead', 'linked prospect', 'direct prospect'] as const) {
    it(`persists and corrects local follow-up on ${label} without changing any source field`, async () => {
      const source = label === 'lead' ? sourcesA.lead : label === 'linked prospect' ? sourcesA.prospect : direct;
      const before = await sourceSnapshot(source);
      const leadsBefore = await leadIds();
      const id = await addFollowup(actorA, source);
      expect(await followupSnapshot(id)).toMatchObject({
        company_id: actorA.companyId, source_kind: source.kind, source_raw_id: source.id,
        author_id: actorA.id, notes: 'FLC local note', outcome: 'callback_scheduled', next_action_date: '2026-10-05',
      });
      expect(await sourceSnapshot(source)).toEqual(before);
      const correction = await actorA.client.from('lead_followups').update({ notes: 'Corrected FLC local note' }).eq('id', id).select('id');
      expect(correction.error).toBeNull();
      expect(correction.data).toEqual([{ id }]);
      const detail = await actorA.client.rpc('get_lead_detail', {
        p_company_id: actorA.companyId, p_source_kind: source.kind, p_raw_id: source.id,
      });
      expect(detail.error).toBeNull();
      expect(detail.data).toHaveLength(1);
      expect(detail.data[0]).toMatchObject({ source_raw_id: source.id, dms_external_id: source.externalId, raw_payload: before.raw_payload });
      expect(detail.data[0].followups).toEqual(expect.arrayContaining([expect.objectContaining({ id, notes: 'Corrected FLC local note' })]));
      expect(await sourceSnapshot(source)).toEqual(before);
      expect(await leadIds()).toEqual(leadsBefore);
    });
  }

  for (const relation of ['null', 'absent'] as const) {
    it(`retrieves a Direct Prospect with ${relation} Lead relationship and creates no fake Lead`, async () => {
      const before = await leadIds();
      const source = relation === 'null' ? direct : await seedSource(actorA, 'prospect');
      const feed = await actorA.client.rpc('get_leads_feed', { p_company_id: actorA.companyId, p_kind: 'prospect' });
      expect(feed.error).toBeNull();
      expect(feed.data).toEqual(expect.arrayContaining([expect.objectContaining({ source_kind: 'prospect', source_raw_id: source.id, dms_external_id: source.externalId })]));
      const detail = await actorA.client.rpc('get_lead_detail', { p_company_id: actorA.companyId, p_source_kind: 'prospect', p_raw_id: source.id });
      expect(detail.error).toBeNull();
      expect(detail.data).toHaveLength(1);
      expect(detail.data[0].raw_payload.lead_id).toBe(relation === 'null' ? null : undefined);
      expect(await leadIds()).toEqual(before);
    });
  }

  for (const kind of ['lead', 'prospect'] as const) {
    it(`allows same-company ${kind} reads and rejects a valid authenticated source INSERT`, async () => {
      const source = sourcesA[kind];
      const read = await actorA.client.from(table(kind)).select('*').eq('id', source.id).single();
      expect(read.error).toBeNull();
      expect(read.data).toEqual(source.row);
      const { id: _id, created_at: _created, updated_at: _updated, ...validRow } = source.row;
      const inserted = await actorA.client.from(table(kind)).insert({
        ...validRow, [externalColumn(kind)]: crypto.randomUUID(), payload_hash: crypto.randomUUID(),
      });
      expect(inserted.error?.code).toBe('42501');
      expect(await sourceSnapshot(source)).toEqual(source.row);
    });

    for (const operation of ['update', 'delete'] as const) {
      it(`denies authenticated source ${kind} ${operation} and preserves the complete row`, async () => {
        const source = sourcesA[kind];
        const query = operation === 'update'
          ? actorA.client.from(table(kind)).update({ raw_payload: { forged: true }, [kind === 'lead' ? 'lead_status' : 'prospect_status']: 'forged' })
          : actorA.client.from(table(kind)).delete();
        const result = await query.eq('id', source.id).select('id');
        expect(result.error).toBeNull();
        expect(result.data).toEqual([]); // RLS hides every row from UPDATE/DELETE.
        expect(await sourceSnapshot(source)).toEqual(source.row);
      });
    }

    it(`hides Company B ${kind} and follow-ups from Company A across read/update/delete`, async () => {
      const source = sourcesB[kind];
      const id = await addFollowup(actorB, source); // Authorized populated control.
      const before = await followupSnapshot(id);
      const ownRead = await actorB.client.from('lead_followups').select('*').eq('id', id).single();
      expect(ownRead.error).toBeNull();
      expect(ownRead.data).toEqual(before);
      for (const query of [
        actorA.client.from('lead_followups').select('*').eq('id', id),
        actorA.client.from('lead_followups').update({ notes: 'cross-company overwrite' }).eq('id', id).select('id'),
        actorA.client.from('lead_followups').delete().eq('id', id).select('id'),
        actorA.client.from(table(kind)).select('*').eq('id', source.id),
      ]) {
        const result = await query;
        expect(result.error).toBeNull();
        expect(result.data).toEqual([]);
      }
      for (const rpc of ['get_leads_feed', 'get_lead_detail'] as const) {
        const result = await actorA.client.rpc(rpc, {
          p_company_id: actorB.companyId,
          ...(rpc === 'get_lead_detail' ? { p_source_kind: kind, p_raw_id: source.id } : {}),
        });
        expect(result.error?.message).toContain('Unauthorized');
      }
      expect(await followupSnapshot(id)).toEqual(before);
      expect(await sourceSnapshot(source)).toEqual(source.row);
    });

    it(`rejects Company B ${kind} follow-up INSERT/RPC from Company A`, async () => {
      const source = sourcesB[kind];
      const inserted = await directInsert(actorA, source, { company_id: actorB.companyId });
      expect(inserted.error?.code).toBe('42501');
      const rpc = await actorA.client.rpc('add_lead_followup', {
        p_company_id: actorB.companyId, p_source_kind: kind, p_source_raw_id: source.id, p_notes: 'cross-company note',
      });
      expect(rpc.error?.message).toContain('Unauthorized');
    });

    it(`rejects another company's ${kind} UUID under Company A through the supported RPC`, async () => {
      await addFollowup(actorA, sourcesA[kind]);
      const result = await actorA.client.rpc('add_lead_followup', {
        p_company_id: actorA.companyId, p_source_kind: kind, p_source_raw_id: sourcesB[kind].id, p_notes: 'forged source attachment',
      });
      expect(result.error?.message).toContain('not found for company');
    });

    it(`rejects direct attachment to another company's ${kind} UUID under Company A`, async () => {
      const positive = await directInsert(actorA, sourcesA[kind]);
      expect(positive.error).toBeNull();
      expect(positive.data).toEqual([{ id: positive.id }]);
      const attack = await directInsert(actorA, sourcesB[kind]);
      expect(attack.error?.code).toBe('42501');
      const persisted = await svc.from('lead_followups').select('id').eq('id', attack.id);
      expect(persisted.error).toBeNull();
      expect(persisted.data).toEqual([]);
    });

    it(`rejects reattaching an authored Company A follow-up to Company B ${kind}`, async () => {
      const id = await addFollowup(actorA, sourcesA[kind]);
      const before = await followupSnapshot(id);
      const result = await actorA.client.from('lead_followups').update({ source_raw_id: sourcesB[kind].id }).eq('id', id).select('id');
      expect(result.error?.code).toBe('42501');
      expect(await followupSnapshot(id)).toEqual(before);
    });

    it(`rejects ghost and wrong-kind ${kind} source relationships`, async () => {
      for (const id of [crypto.randomUUID(), sourcesA[kind === 'lead' ? 'prospect' : 'lead'].id]) {
        const attack = await directInsert(actorA, sourcesA[kind], { source_raw_id: id });
        expect(attack.error?.code).toBe('42501');
        const rpc = await actorA.client.rpc('add_lead_followup', {
          p_company_id: actorA.companyId, p_source_kind: kind, p_source_raw_id: id, p_notes: 'valid note against invalid relationship',
        });
        expect(rpc.error?.message).toContain('not found for company');
      }
    });

    it(`duplicate ${kind} staging rejection preserves one source identity and local follow-up`, async () => {
      const source = sourcesA[kind];
      const id = await addFollowup(actorA, source);
      const localBefore = await followupSnapshot(id);
      // Exact DB operation used by dms-sync-worker: mapped rows omit the raw UUID.
      // Current worker does not target company/payload_hash on conflict. A replay
      // is rejected by uniqueness; this is source/local stability evidence only.
      const { id: _id, created_at: _created, updated_at: _updated, ...observation } = source.row;
      const replay = await svc.from(table(kind)).upsert(observation, { ignoreDuplicates: true });
      // Evidence of today's staging rejection, separate from successful source
      // refresh and from a future worker replay acceptance contract.
      expect(replay.error?.code).toBe('23505');
      const rows = await svc.from(table(kind)).select('*').eq('company_id', actorA.companyId).eq(externalColumn(kind), source.externalId);
      expect(rows.error).toBeNull();
      expect(rows.data).toEqual([source.row]);
      expect(await followupSnapshot(id)).toEqual(localBefore);
      const detail = await actorA.client.rpc('get_lead_detail', { p_company_id: actorA.companyId, p_source_kind: kind, p_raw_id: source.id });
      expect(detail.error).toBeNull();
      expect(detail.data[0].followups).toEqual(expect.arrayContaining([localBefore]));
    });
  }

  it('rejects a spoofed follow-up author on an otherwise valid same-company source', async () => {
    const positive = await directInsert(actorA, direct);
    expect(positive.error).toBeNull();
    const result = await directInsert(actorA, direct, { author_id: actorB.id });
    expect(result.error?.code).toBe('42501');
  });

  it('repeated reads keep distinct source IDs despite identical customer/name evidence', async () => {
    const before = await svc.from('lead_followups').select('id').in('source_raw_id', sources.map(source => source.id)).order('id');
    expect(before.error).toBeNull();
    for (let repeat = 0; repeat < 2; repeat++) {
      const feed = await actorA.client.rpc('get_leads_feed', { p_company_id: actorA.companyId });
      expect(feed.error).toBeNull();
      for (const source of [sourcesA.lead, sourcesA.prospect, direct]) {
        expect(feed.data.filter((row: Record<string, unknown>) => row.source_raw_id === source.id)).toEqual([
          expect.objectContaining({ source_kind: source.kind, dms_external_id: source.externalId, dms_customer_id: 'UPSTREAM-CUSTOMER' }),
        ]);
        expect(await sourceSnapshot(source)).toEqual(source.row);
      }
    }
    const after = await svc.from('lead_followups').select('id').in('source_raw_id', sources.map(source => source.id)).order('id');
    expect(after.error).toBeNull();
    expect(after.data).toEqual(before.data);
  });

  for (const relation of ['null', 'absent'] as const) {
    it(`[LP-01] Direct Prospect with ${relation} Lead reference works in a tenant with no Leads or Deals`, async () => {
      const manager = await createTenantManager();
      const source = await seedSource(manager, 'prospect', relation === 'null' ? null : undefined);
      const before = await businessState(manager.companyId);
      expect(before.dms_raw_leads).toEqual({ count: 0, ids: [] });
      expect(before.deals).toEqual({ count: 0, ids: [] });
      const expected = {
        source_kind: 'prospect', source_raw_id: source.id, dms_external_id: source.externalId,
        status: source.row.prospect_status, source_created_at: source.row.prospect_created_at,
        fetched_at: source.row.fetched_at,
      };
      expect(await feed(manager)).toEqual([expect.objectContaining({ ...expected, followup_count: 0 })]);
      const found = await detail(manager, source);
      expect(found).toMatchObject({ ...expected, raw_payload: source.row.raw_payload, followups: [] });
      expect((found.raw_payload as Record<string, unknown>).lead_id).toBe(relation === 'null' ? null : undefined);
      expect(await sourceSnapshot(source)).toEqual(source.row);
      expect(await businessState(manager.companyId)).toEqual(before);
    });
  }

  for (const kind of ['lead', 'prospect'] as const) {
    it(`[LP-02] identical ${kind} external IDs in two tenants stay separate, including own-company foreign-UUID detail`, async () => {
      const externalId = `SHARED-${crypto.randomUUID()}`;
      const own = await seedSource(managerA, kind, undefined, { [externalColumn(kind)]: externalId });
      const foreign = await seedSource(managerB, kind, undefined, { [externalColumn(kind)]: externalId });
      const before = await boundaryState(managerA.companyId, managerB.companyId);
      expect((await detail(managerA, own)).dms_external_id).toBe(externalId);
      expect((await detail(managerB, foreign)).dms_external_id).toBe(externalId);
      const ownFeed = await feed(managerA, undefined, kind);
      expect(ownFeed.filter(row => row.dms_external_id === externalId)).toEqual([
        expect.objectContaining({ source_kind: kind, source_raw_id: own.id }),
      ]);
      const ownRaw = await managerA.client.from(table(kind)).select('*').eq('id', own.id).single();
      expect(ownRaw.error).toBeNull();
      expect(ownRaw.data).toEqual(own.row);
      const foreignRaw = await managerA.client.from(table(kind)).select('*').eq('id', foreign.id);
      expect(foreignRaw.error).toBeNull();
      expect(foreignRaw.data).toEqual([]);
      const foreignDetail = await managerA.client.rpc('get_lead_detail', {
        p_company_id: managerA.companyId, p_source_kind: kind, p_raw_id: foreign.id,
      });
      expect(foreignDetail.error).toBeNull();
      expect(foreignDetail.data).toEqual([]);
      for (const rpc of ['get_leads_feed', 'get_lead_detail'] as const) {
        const forged = await managerA.client.rpc(rpc, {
          p_company_id: managerB.companyId,
          ...(rpc === 'get_lead_detail' ? { p_source_kind: kind, p_raw_id: foreign.id } : {}),
        });
        expect(forged.error?.message).toContain('Unauthorized');
      }
      expect(await boundaryState(managerA.companyId, managerB.companyId)).toEqual(before);
    });

    it(`[LP-03] company manager cannot INSERT, UPDATE or DELETE ${kind} source facts`, async () => {
      const source = await seedSource(managerA, kind);
      const before = await boundaryState(managerA.companyId);
      const { id: _id, created_at: _created, updated_at: _updated, ...validRow } = source.row;
      const insert = await managerA.client.from(table(kind)).insert({
        ...validRow, [externalColumn(kind)]: crypto.randomUUID(), payload_hash: crypto.randomUUID(),
      });
      expect(insert.error?.code).toBe('42501');
      expect(await boundaryState(managerA.companyId)).toEqual(before);
      for (const operation of ['update', 'delete'] as const) {
        const query = operation === 'update'
          ? managerA.client.from(table(kind)).update({ raw_payload: { forged: true } })
          : managerA.client.from(table(kind)).delete();
        const result = await query.eq('id', source.id).select('id');
        expect(result.error).toBeNull();
        expect(result.data).toEqual([]);
        expect(await sourceSnapshot(source)).toEqual(source.row);
        expect(await boundaryState(managerA.companyId)).toEqual(before);
      }
    });

    for (const outcome of ['converted', 'lost'] as const) {
      it(`[LP-05] local ${kind} ${outcome} outcome preserves source facts and creates no commercial or financial events`, async () => {
        const source = await seedSource(managerA, kind);
        const before = await businessState(managerA.companyId);
        const id = await addFollowup(managerA, source, { notes: `Local ${outcome} assessment`, outcome, nextActionDate: null });
        expect(await followupSnapshot(id)).toMatchObject({
          author_id: managerA.id, company_id: managerA.companyId, source_kind: kind,
          source_raw_id: source.id, outcome, next_action_date: null,
        });
        expect((await detail(managerA, source)).followups).toEqual([await followupSnapshot(id)]);
        expect((await feed(managerA)).find(row => row.source_kind === kind && row.source_raw_id === source.id)).toMatchObject({
          followup_count: 1, last_followup_outcome: outcome, next_action_date: null,
          status: source.row[kind === 'lead' ? 'lead_status' : 'prospect_status'],
        });
        expect(await sourceSnapshot(source)).toEqual(source.row);
        expect(await businessState(managerA.companyId)).toEqual(before);
      });
    }

    it(`[LP-06] rejected ${kind} follow-up commands leave both tenants unchanged`, async () => {
      const own = await seedSource(managerA, kind);
      const foreign = await seedSource(managerB, kind);
      await addFollowup(managerA, own); // Populated authorized control before negative cases.
      const valid = { p_company_id: managerA.companyId, p_source_kind: kind, p_source_raw_id: own.id, p_notes: 'Valid note' };
      for (const rejection of [
        { args: { p_company_id: managerB.companyId, p_source_raw_id: foreign.id }, message: 'Unauthorized' },
        { args: { p_source_raw_id: foreign.id }, message: 'not found for company' },
        { args: { p_source_raw_id: crypto.randomUUID() }, message: 'not found for company' },
        { args: { p_source_kind: 'booking' }, message: 'Invalid source_kind' },
        { args: { p_notes: '' }, message: 'Notes cannot be empty' },
        { args: { p_notes: '   ' }, message: 'Notes cannot be empty' },
      ]) {
        const before = await boundaryState(managerA.companyId, managerB.companyId);
        const businessBefore = await businessState(managerA.companyId, managerB.companyId);
        const result = await managerA.client.rpc('add_lead_followup', { ...valid, ...rejection.args });
        expect(result.error?.message).toContain(rejection.message);
        expect(result.data).toBeNull();
        expect(await boundaryState(managerA.companyId, managerB.companyId)).toEqual(before);
        expect(await businessState(managerA.companyId, managerB.companyId)).toEqual(businessBefore);
      }
    }, 30_000);

    it(`[LP-07] ${kind} latest/count/outcome/next-action and priority use distinct times and database today`, async () => {
      const dates = databaseDates();
      const branch = `ORDER-${crypto.randomUUID()}`;
      const rows: Record<string, Source> = {};
      for (const [index, label] of ['never', 'overdue', 'today', 'future', 'superseded'].entries()) {
        rows[label] = await seedSource(managerA, kind, undefined, {
          branch_code: branch, [kind === 'lead' ? 'lead_created_at' : 'prospect_created_at']: `200${index}-01-01T08:00:00Z`,
        });
      }
      const notes: Record<string, Record<string, unknown>> = {};
      for (const [label, date, outcome] of [
        ['overdue', dates.yesterday, 'no_answer'], ['today', dates.today, 'contacted'],
        ['future', dates.tomorrow, 'qualified'], ['superseded', dates.yesterday, 'not_interested'],
      ]) {
        const id = await addFollowup(managerA, rows[label], { outcome, nextActionDate: date });
        notes[label] = await pinFollowupTime(id, `${dates.yesterday}T08:00:00Z`);
        expect(notes[label]).toMatchObject({ outcome, next_action_date: date });
      }
      const newerId = await addFollowup(managerA, rows.superseded, { outcome: 'callback_scheduled', nextActionDate: dates.tomorrow });
      const newer = await pinFollowupTime(newerId, `${dates.today}T09:00:00Z`);
      expect(newer).toMatchObject({ outcome: 'callback_scheduled', next_action_date: dates.tomorrow });
      const beforeReads = await boundaryState(managerA.companyId);
      const found = await feed(managerA, branch, kind);
      // Strictly before today is overdue; today's action stays in the scheduled
      // group. The newer scheduled note supersedes the older overdue note.
      expect(found.map(row => row.source_raw_id)).toEqual([
        rows.overdue.id, rows.never.id, rows.superseded.id, rows.future.id, rows.today.id,
      ]);
      for (const label of ['overdue', 'today', 'future', 'superseded']) {
        const latest = label === 'superseded' ? newer : notes[label];
        expect(found.find(row => row.source_raw_id === rows[label].id)).toMatchObject({
          source_kind: kind, followup_count: label === 'superseded' ? 2 : 1,
          last_followup_at: latest.created_at, last_followup_outcome: latest.outcome, next_action_date: latest.next_action_date,
        });
      }
      expect(found.find(row => row.source_raw_id === rows.never.id)).toMatchObject({
        followup_count: 0, last_followup_at: null, last_followup_outcome: null, next_action_date: null,
      });
      expect((await detail(managerA, rows.superseded)).followups).toEqual([newer, notes.superseded]);
      for (const source of Object.values(rows)) expect(await sourceSnapshot(source)).toEqual(source.row);
      expect(await boundaryState(managerA.companyId)).toEqual(beforeReads);
    });

    it(`[LP-09] anonymous callers are denied all three ${kind} RPCs with unchanged persisted state`, async () => {
      const source = await seedSource(managerA, kind);
      await addFollowup(managerA, source);
      expect((await feed(managerA)).some(row => row.source_raw_id === source.id && row.source_kind === kind)).toBe(true);
      expect((await detail(managerA, source)).followups).toHaveLength(1);
      const anonymous = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, options(`anonymous-${crypto.randomUUID()}`));
      const before = await boundaryState(managerA.companyId);
      for (const [rpc, args] of [
        ['get_leads_feed', { p_company_id: managerA.companyId }],
        ['get_lead_detail', { p_company_id: managerA.companyId, p_source_kind: kind, p_raw_id: source.id }],
        ['add_lead_followup', { p_company_id: managerA.companyId, p_source_kind: kind, p_source_raw_id: source.id, p_notes: 'Anonymous attack' }],
      ] as const) {
        const result = await anonymous.rpc(rpc, args);
        expect(result.error).not.toBeNull();
        expect(['42501', 'PGRST202', 'PGRST301']).toContain(result.error?.code);
        expect(result.data).toBeNull();
        expect(await boundaryState(managerA.companyId)).toEqual(before);
      }
    });

    it(`[LP-09] deactivated existing session is denied all three ${kind} RPCs without mutation`, async () => {
      const actor = await createManager(managerA.companyId);
      const source = await seedSource(actor, kind);
      await addFollowup(actor, source);
      expect((await feed(actor)).some(row => row.source_raw_id === source.id && row.source_kind === kind)).toBe(true);
      expect((await detail(actor, source)).followups).toHaveLength(1);
      const before = await boundaryState(actor.companyId);
      const businessBefore = await businessState(actor.companyId);
      const inactive = await svc.from('profiles').update({ status: 'inactive' }).eq('id', actor.id).select('status').single();
      expect(inactive.error).toBeNull();
      expect(inactive.data?.status).toBe('inactive');
      try {
        for (const [rpc, args] of [
          ['get_leads_feed', { p_company_id: actor.companyId }],
          ['get_lead_detail', { p_company_id: actor.companyId, p_source_kind: kind, p_raw_id: source.id }],
          ['add_lead_followup', { p_company_id: actor.companyId, p_source_kind: kind, p_source_raw_id: source.id, p_notes: 'Inactive session attack' }],
        ] as const) {
          const result = await actor.client.rpc(rpc, args);
          expect(result.error?.code).toBe('42501');
          expect(result.data).toBeNull();
          expect(await boundaryState(actor.companyId)).toEqual(before);
          expect(await businessState(actor.companyId)).toEqual(businessBefore);
        }
      } finally {
        const restored = await svc.from('profiles').update({ status: 'active' }).eq('id', actor.id).select('status').single();
        expect(restored.error).toBeNull();
        expect(restored.data?.status).toBe('active');
      }
      expect((await detail(actor, source)).followups).toHaveLength(1);
    });

    it(`[LP-10] privileged ${kind} refresh on the same raw UUID exposes new source facts and preserves local notes`, async () => {
      const source = await seedSource(managerA, kind);
      const id = await addFollowup(managerA, source);
      const localBefore = await followupSnapshot(id);
      const businessBefore = await businessState(managerA.companyId);
      const refresh = {
        [kind === 'lead' ? 'lead_status' : 'prospect_status']: '95041002', dms_customer_id: 'UPSTREAM-REFRESH',
        raw_payload: { ...(source.row.raw_payload as Record<string, unknown>), progress: 'new-source-progress', rating: '95051002', follow_up_count: 9 },
        normalized_payload: { source_evidence: true, revision: 2 }, fetched_at: `${databaseDates().today}T12:00:00Z`,
      };
      const updated = await svc.from(table(kind)).update(refresh).eq('company_id', managerA.companyId).eq('id', source.id).select('*').single();
      expect(updated.error).toBeNull();
      expect(updated.data).toMatchObject({ id: source.id, [externalColumn(kind)]: source.externalId, ...refresh, fetched_at: expect.any(String) });
      expect(Date.parse(updated.data!.fetched_at)).toBe(Date.parse(refresh.fetched_at));
      const persisted = await sourceSnapshot(source);
      expect(persisted).toEqual(updated.data);
      const identities = await svc.from(table(kind)).select('id').eq('company_id', managerA.companyId).eq(externalColumn(kind), source.externalId);
      expect(identities.error).toBeNull();
      expect(identities.data).toEqual([{ id: source.id }]);
      expect(await followupSnapshot(id)).toEqual(localBefore);
      expect(await detail(managerA, source)).toMatchObject({
        source_kind: kind, source_raw_id: source.id, dms_external_id: source.externalId,
        status: '95041002', dms_customer_id: 'UPSTREAM-REFRESH', raw_payload: refresh.raw_payload,
        fetched_at: updated.data!.fetched_at, followups: [localBefore],
      });
      expect((await feed(managerA)).find(row => row.source_kind === kind && row.source_raw_id === source.id)).toMatchObject({
        status: '95041002', dms_customer_id: 'UPSTREAM-REFRESH', fetched_at: updated.data!.fetched_at,
        followup_count: 1, last_followup_at: localBefore.created_at,
        last_followup_outcome: localBefore.outcome, next_action_date: localBefore.next_action_date,
      });
      expect(await businessState(managerA.companyId)).toEqual(businessBefore);
    });
  }

  it('[LP-04] manager Direct Prospect follow-up persists the full authored tuple and aggregates in feed/detail', async () => {
    const source = await seedSource(managerA, 'prospect', null);
    const nextActionDate = databaseDates().tomorrow;
    const before = await businessState(managerA.companyId);
    const id = await addFollowup(managerA, source, { notes: 'Manager-authored Direct Prospect note', outcome: 'callback_scheduled', nextActionDate });
    const persisted = await followupSnapshot(id);
    expect(persisted).toMatchObject({
      id, company_id: managerA.companyId, source_kind: 'prospect', source_raw_id: source.id,
      author_id: managerA.id, notes: 'Manager-authored Direct Prospect note', outcome: 'callback_scheduled', next_action_date: nextActionDate,
    });
    expect((await detail(managerA, source)).followups).toEqual([persisted]);
    expect((await feed(managerA)).find(row => row.source_kind === 'prospect' && row.source_raw_id === source.id)).toMatchObject({
      followup_count: 1, last_followup_at: persisted.created_at, last_followup_outcome: 'callback_scheduled', next_action_date: nextActionDate,
    });
    expect(await sourceSnapshot(source)).toEqual(source.row);
    expect(await businessState(managerA.companyId)).toEqual(before);
  });

  it('[LP-08] equal Lead/Prospect raw UUIDs keep populated feeds/details separate by source kind and tenant', async () => {
    const branch = `COLLISION-${crypto.randomUUID()}`;
    const externalId = `COLLISION-${crypto.randomUUID()}`;
    const ownId = crypto.randomUUID();
    const foreignId = crypto.randomUUID(); // A table PK cannot repeat across tenants; each tenant repeats across kinds.
    const fixtures: Array<{ actor: Actor; source: Source; notes: Array<Record<string, unknown>> }> = [];
    for (const [actor, id, counts] of [[managerA, ownId, [1, 2]], [managerB, foreignId, [3, 4]]] as const) {
      for (const [index, kind] of (['lead', 'prospect'] as const).entries()) {
        const source = await seedSource(actor, kind, undefined, { id, branch_code: branch, [externalColumn(kind)]: externalId });
        const notes = [];
        for (let count = 0; count < counts[index]; count++) {
          notes.push(await followupSnapshot(await addFollowup(actor, source, { notes: `${actor.companyId}/${kind}/${count}` })));
        }
        fixtures.push({ actor, source, notes });
      }
    }
    const before = await boundaryState(managerA.companyId, managerB.companyId);
    for (const actor of [managerA, managerB]) {
      const found = await feed(actor, branch);
      expect(found).toHaveLength(2);
      for (const fixture of fixtures.filter(item => item.actor === actor)) {
        expect(found.filter(row => row.source_kind === fixture.source.kind)).toEqual([
          expect.objectContaining({ source_raw_id: fixture.source.id, dms_external_id: externalId, followup_count: fixture.notes.length }),
        ]);
        const result = await detail(actor, fixture.source);
        expect(result.followups).toHaveLength(fixture.notes.length);
        expect(result.followups.map(note => note.id).sort()).toEqual(fixture.notes.map(note => note.id).sort());
        for (const note of result.followups) expect(note).toMatchObject({
          company_id: actor.companyId, author_id: actor.id, source_kind: fixture.source.kind, source_raw_id: fixture.source.id,
        });
      }
    }
    for (const kind of ['lead', 'prospect'] as const) {
      const foreign = await managerA.client.rpc('get_lead_detail', { p_company_id: managerA.companyId, p_source_kind: kind, p_raw_id: foreignId });
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
    }
    expect(await boundaryState(managerA.companyId, managerB.companyId)).toEqual(before);
  });
});
