import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const describeIfLive = process.env.RLS_E2E === '1' ? describe : describe.skip;
function clientOptions(storageKey: string): Parameters<typeof createClient>[2] {
  return {
    auth: { persistSession: false, storageKey },
    realtime: { transport: WebSocket as never },
  };
}

interface Actor {
  client: SupabaseClient;
  id: string;
  companyId: string;
  accessToken: string;
}

async function signIn(email: string, password: string): Promise<Actor> {
  const client = createClient(
    process.env.VITE_SUPABASE_URL ?? '',
    process.env.VITE_SUPABASE_ANON_KEY ?? '',
    clientOptions(`readiness-${email}`),
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed: ${error?.message}`);

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('company_id')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile?.company_id) throw new Error(`Profile unavailable: ${profileError?.message}`);
  return {
    client,
    id: data.user.id,
    companyId: profile.company_id as string,
    accessToken: data.session.access_token,
  };
}

describeIfLive('production-readiness authorization and persistence', () => {
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let userA: Actor;
  let userB: Actor;
  const cleanup: Record<string, string[]> = {
    tickets: [],
    audit_logs: [],
    application_logs: [],
    request_categories: [],
  };

  beforeAll(async () => {
    const url = process.env.VITE_SUPABASE_URL ?? '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!url || !anonKey || !serviceKey) throw new Error('Live Supabase URL, anon key, and service-role key are required');

    admin = createClient(url, serviceKey, clientOptions('readiness-admin'));
    anonymous = createClient(url, anonKey, clientOptions('readiness-anonymous'));
    userA = await signIn(process.env.RLS_USER_A_EMAIL ?? 'a@rls.test', process.env.RLS_USER_A_PASSWORD ?? 'Test1234!');
    userB = await signIn(process.env.RLS_USER_B_EMAIL ?? 'b@rls.test', process.env.RLS_USER_B_PASSWORD ?? 'Test1234!');
  });

  afterAll(async () => {
    await admin.from('tickets').delete().in('id', cleanup.tickets);
    await admin.from('request_categories').delete().in('id', cleanup.request_categories);
    await admin.from('audit_logs').delete().in('id', cleanup.audit_logs);
    await admin.from('application_logs').delete().in('id', cleanup.application_logs);
    await admin.from('profiles').update({ status: 'active', role: 'creator_updater', access_scope: 'self' }).eq('id', userA.id);
  });

  it('blocks anonymous RPC execution', async () => {
    const { error } = await anonymous.rpc('generate_deal_no', {
      p_company_id: userA.companyId,
      p_branch_id: 'missing-branch',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toMatch(/42501|PGRST/);
  });

  it('requires a verified privileged caller at the edge-function boundary', async () => {
    const baseUrl = process.env.VITE_SUPABASE_URL ?? '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
    const body = JSON.stringify({
      email: 'must-not-be-created@rls.test',
      name: 'Unauthorized Invite',
      role: 'company_admin',
      company_id: userA.companyId,
    });

    const anonymousResponse = await fetch(`${baseUrl}/functions/v1/invite-user`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body,
    });
    expect(anonymousResponse.status).toBe(401);

    const staffResponse = await fetch(`${baseUrl}/functions/v1/invite-user`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${userA.accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    expect(staffResponse.status).toBe(403);

    const { data } = await admin.auth.admin.listUsers();
    const authUsers = data.users as Array<{ email?: string }>;
    expect(authUsers.some((user) => user.email === 'must-not-be-created@rls.test')).toBe(false);
  }, 15_000); // A clean local edge runtime compiles remote Deno dependencies on first invocation.

  it('prevents a user from escalating their own role, scope, or tenant', async () => {
    const { error } = await userA.client
      .from('profiles')
      .update({ role: 'super_admin', access_scope: 'global', company_id: userB.companyId })
      .eq('id', userA.id);
    expect(error).not.toBeNull();

    const { data: persisted, error: persistedError } = await admin
      .from('profiles')
      .select('role, access_scope, company_id')
      .eq('id', userA.id)
      .single();
    expect(persistedError).toBeNull();
    expect(persisted).toMatchObject({
      role: 'creator_updater',
      access_scope: 'self',
      company_id: userA.companyId,
    });
  });

  it('persists an own-company request and rejects exact cross-tenant read, write, and update attempts', async () => {
    const suffix = crypto.randomUUID();
    const { data: category, error: categoryError } = await admin
      .from('request_categories')
      .insert({ company_id: userA.companyId, category_key: `readiness_${suffix}`, label: 'Readiness test' })
      .select('id, category_key')
      .single();
    expect(categoryError).toBeNull();
    cleanup.request_categories.push(category!.id);
    const { data: categoryB, error: categoryBError } = await admin
      .from('request_categories')
      .insert({ company_id: userB.companyId, category_key: `readiness_${suffix}`, label: 'Readiness test' })
      .select('id, category_key')
      .single();
    expect(categoryBError).toBeNull();
    cleanup.request_categories.push(categoryB!.id);

    const { data: ticket, error: createError } = await userA.client
      .from('tickets')
      .insert({
        company_id: userA.companyId,
        category: category!.category_key,
        subject: `Readiness request ${suffix}`,
        description: 'A deterministic live persistence check for the request boundary.',
        submitted_by: userA.id,
      })
      .select('id, company_id, status, subject')
      .single();
    expect(createError).toBeNull();
    expect(ticket).toMatchObject({ company_id: userA.companyId, status: 'open' });
    cleanup.tickets.push(ticket!.id);

    const { data: ownerRead, error: ownerReadError } = await userA.client
      .from('tickets')
      .select('id, subject')
      .eq('id', ticket!.id)
      .single();
    expect(ownerReadError).toBeNull();
    expect(ownerRead?.subject).toBe(ticket!.subject);

    const { data: crossRead, error: crossReadError } = await userB.client
      .from('tickets')
      .select('id')
      .eq('id', ticket!.id);
    expect(crossReadError).toBeNull();
    expect(crossRead).toEqual([]);

    const { error: spoofError } = await userA.client.from('tickets').insert({
      company_id: userB.companyId,
      category: categoryB!.category_key,
      subject: `Spoofed request ${suffix}`,
      description: 'This complete row must be rejected by the restrictive tenant policy.',
      submitted_by: userA.id,
    });
    expect(spoofError).not.toBeNull();

    const { data: updateRows, error: updateError } = await userB.client
      .from('tickets')
      .update({ subject: `Tampered request ${suffix}` })
      .eq('id', ticket!.id)
      .select('id');
    expect(updateError).toBeNull();
    expect(updateRows).toEqual([]);

    const { data: cancelled, error: cancelError } = await userA.client.rpc('cancel_own_ticket', {
      p_ticket_id: ticket!.id,
      p_cancellation_note: 'Readiness test cleanup',
    });
    expect(cancelError).toBeNull();
    expect((cancelled as { status: string }).status).toBe('cancelled');

    const { data: persisted } = await admin.from('tickets').select('status, resolution_note').eq('id', ticket!.id).single();
    expect(persisted).toMatchObject({ status: 'cancelled', resolution_note: 'Readiness test cleanup' });
  });

  it('keeps audit and application logs inside the actor company', async () => {
    const auditIds = [crypto.randomUUID(), crypto.randomUUID()];
    const appIds = [crypto.randomUUID(), crypto.randomUUID()];
    cleanup.audit_logs.push(...auditIds);
    cleanup.application_logs.push(...appIds);

    expect((await admin.from('audit_logs').insert([
      { id: auditIds[0], user_id: userA.id, action: 'readiness_a', entity_type: 'test', entity_id: crypto.randomUUID(), changes: {} },
      { id: auditIds[1], user_id: userB.id, action: 'readiness_b', entity_type: 'test', entity_id: crypto.randomUUID(), changes: {} },
    ])).error).toBeNull();
    expect((await admin.from('application_logs').insert([
      { id: appIds[0], user_id: userA.id, level: 'info', message: 'readiness-a' },
      { id: appIds[1], user_id: userB.id, level: 'info', message: 'readiness-b' },
    ])).error).toBeNull();

    const { data: ownAudit } = await userA.client.from('audit_logs').select('id').eq('id', auditIds[0]);
    const { data: otherAudit } = await userA.client.from('audit_logs').select('id').eq('id', auditIds[1]);
    const { data: ownApp } = await userA.client.from('application_logs').select('id').eq('id', appIds[0]);
    const { data: otherApp } = await userA.client.from('application_logs').select('id').eq('id', appIds[1]);
    expect(ownAudit).toEqual([{ id: auditIds[0] }]);
    expect(otherAudit).toEqual([]);
    expect(ownApp).toEqual([{ id: appIds[0] }]);
    expect(otherApp).toEqual([]);
  });

  it('rejects a cross-company security-definer RPC argument', async () => {
    const { error } = await userA.client.rpc('generate_deal_no', {
      p_company_id: userB.companyId,
      p_branch_id: 'missing-branch',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/company access denied/i);
  });

  it('invalidates data access for an existing session after account deactivation', async () => {
    expect((await admin.from('profiles').update({ status: 'inactive' }).eq('id', userA.id)).error).toBeNull();

    const { data, error } = await userA.client.from('profiles').select('id').eq('id', userA.id);
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    expect((await admin.from('profiles').update({ status: 'active' }).eq('id', userA.id)).error).toBeNull();
    const { data: restored, error: restoredError } = await userA.client.from('profiles').select('id').eq('id', userA.id).single();
    expect(restoredError).toBeNull();
    expect(restored?.id).toBe(userA.id);
  });
});
