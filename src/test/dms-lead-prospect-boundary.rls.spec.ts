/** Business/security evidence on the existing disposable readiness stack. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

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
  let sourcesA: Record<Kind, Source>;
  let sourcesB: Record<Kind, Source>;
  let direct: Source;
  const sources: Source[] = [];
  const followupIds: string[] = [];

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

  async function seedSource(actor: Actor, kind: Kind, leadId?: string | null): Promise<Source> {
    const externalId = `DMS-${kind}-${crypto.randomUUID()}`;
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

  async function addFollowup(actor: Actor, source: Source) {
    const result = await actor.client.rpc('add_lead_followup', {
      p_company_id: actor.companyId, p_source_kind: source.kind, p_source_raw_id: source.id,
      p_notes: 'FLC local note', p_outcome: 'callback_scheduled', p_next_action_date: '2026-10-05',
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

    it(`duplicate ${kind} staging replay preserves one source identity and local follow-up`, async () => {
      const source = sourcesA[kind];
      const id = await addFollowup(actorA, source);
      const localBefore = await followupSnapshot(id);
      // Exact DB operation used by dms-sync-worker: mapped rows omit the raw UUID.
      // Current worker does not target company/payload_hash on conflict. A replay
      // is rejected by uniqueness; this is source/local stability evidence only.
      const { id: _id, created_at: _created, updated_at: _updated, ...observation } = source.row;
      const replay = await svc.from(table(kind)).upsert(observation, { ignoreDuplicates: true });
      // A future successful duplicate-ignore path is also valid. Do not make
      // today's worker conflict-target limitation a required business behavior.
      if (replay.error) expect(replay.error.code).toBe('23505');
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
});
