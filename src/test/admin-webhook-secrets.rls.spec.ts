import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };

live('Admin webhook secret boundary', () => {
  let svc: SupabaseClient;
  let admin: SupabaseClient;
  let outsider: SupabaseClient;
  let actorId = '';
  let actorRole = '';
  let companyId = '';
  let endpointId = '';
  let firstSecret = '';

  beforeAll(async () => {
    svc = createClient(url, serviceKey, options);
    const { data: actor, error } = await svc.from('profiles')
      .select('id,company_id,role').eq('email', process.env.RLS_USER_A_EMAIL ?? 'a@rls.test').single();
    if (error || !actor) throw new Error(error?.message ?? 'RLS actor unavailable');
    actorId = actor.id;
    actorRole = actor.role;
    companyId = actor.company_id;
    const elevated = await svc.from('profiles').update({ role: 'company_admin' }).eq('id', actorId);
    if (elevated.error) throw new Error(elevated.error.message);
    admin = createClient(url, anon, options);
    outsider = createClient(url, anon, options);
    const loginA = await admin.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    });
    const loginB = await outsider.auth.signInWithPassword({
      email: process.env.RLS_USER_B_EMAIL ?? 'b@rls.test',
      password: process.env.RLS_USER_B_PASSWORD ?? 'Test1234!',
    });
    if (loginA.error || loginB.error) throw new Error('RLS test sign-in failed');
  });

  afterAll(async () => {
    if (endpointId) {
      await svc.from('audit_logs').delete().eq('entity_id', endpointId).eq('entity_type', 'webhook_endpoint');
      await svc.from('webhook_endpoints').delete().eq('id', endpointId);
    }
    if (actorId && actorRole) await svc.from('profiles').update({ role: actorRole }).eq('id', actorId);
  });

  it('creates a one-time key while denying ordinary endpoint and cross-company reads', async () => {
    const created = await admin.rpc('create_webhook_endpoint', {
      p_company_id: companyId, p_name: 'RLS test', p_url: 'https://hooks.example.test/ubs',
      p_event_types: ['vehicle.transferred'], p_active: true,
    });
    expect(created.error).toBeNull();
    endpointId = String(created.data?.id ?? '');
    firstSecret = String(created.data?.secret ?? '');
    expect(endpointId).toBeTruthy();
    expect(firstSecret).toMatch(/^[a-f0-9]{64}$/);

    const listed = await admin.rpc('list_webhook_endpoints', { p_company_id: companyId });
    expect(listed.error).toBeNull();
    const row = (listed.data as Array<Record<string, unknown>>).find(item => item.id === endpointId);
    expect(row).toMatchObject({ name: 'RLS test', url: 'https://hooks.example.test/ubs' });
    expect(row).not.toHaveProperty('secret');
    expect(row).not.toHaveProperty('secret_id');
    const direct = await admin.from('webhook_endpoints').select('*').eq('id', endpointId);
    expect(direct.error).not.toBeNull();
    const directEdit = await admin.from('webhook_endpoints').update({ name: 'Bypass' }).eq('id', endpointId);
    expect(directEdit.error).not.toBeNull();
    const outsiderRead = await outsider.rpc('list_webhook_endpoints', { p_company_id: companyId });
    expect(outsiderRead.error?.message).toContain('Not authorized');
    const outsiderEdit = await outsider.rpc('update_webhook_endpoint', {
      p_id: endpointId, p_company_id: companyId, p_name: 'Bypass',
      p_url: 'https://hooks.example.test/bypass', p_event_types: [], p_active: true,
    });
    expect(outsiderEdit.error?.message).toContain('Not authorized');
    const outsiderRotate = await outsider.rpc('rotate_webhook_endpoint_secret', { p_id: endpointId });
    expect(outsiderRotate.error?.message).toContain('Not authorized');
  });

  it('keeps the key on metadata edit and changes it only through explicit rotation', async () => {
    const original = await svc.rpc('get_webhook_delivery_secret', { p_endpoint_id: endpointId });
    expect(original.data).toBe(firstSecret);
    const browserRead = await admin.rpc('get_webhook_delivery_secret', { p_endpoint_id: endpointId });
    expect(browserRead.error).not.toBeNull();

    const updated = await admin.rpc('update_webhook_endpoint', {
      p_id: endpointId, p_company_id: companyId, p_name: 'Renamed',
      p_url: 'https://hooks.example.test/updated', p_event_types: [], p_active: false,
    });
    expect(updated.error).toBeNull();
    const afterEdit = await svc.rpc('get_webhook_delivery_secret', { p_endpoint_id: endpointId });
    expect(afterEdit.data).toBe(firstSecret);

    const rotated = await admin.rpc('rotate_webhook_endpoint_secret', { p_id: endpointId });
    expect(rotated.error).toBeNull();
    expect(rotated.data).toMatch(/^[a-f0-9]{64}$/);
    expect(rotated.data).not.toBe(firstSecret);
    const afterRotation = await svc.rpc('get_webhook_delivery_secret', { p_endpoint_id: endpointId });
    expect(afterRotation.data).toBe(rotated.data);
    const { data: audits } = await svc.from('audit_logs')
      .select('changes').eq('entity_id', endpointId).eq('entity_type', 'webhook_endpoint');
    expect(JSON.stringify(audits)).not.toContain(firstSecret);
    expect(JSON.stringify(audits)).not.toContain(rotated.data as string);
  });
});
