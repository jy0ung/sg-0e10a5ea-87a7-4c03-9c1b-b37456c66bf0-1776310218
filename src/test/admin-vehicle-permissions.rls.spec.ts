import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };
const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

live('Admin Vehicle permission command', () => {
  let svc: SupabaseClient;
  let admin: SupabaseClient;
  let outsider: SupabaseClient;
  let actorId = '';
  let actorRole = '';
  let targetId = '';

  const args = (columns: Record<string, string> = { chassis_no: 'view' }) => ({
    p_user_id: targetId,
    p_can_edit: true,
    p_can_bulk_edit: false,
    p_can_view_details: true,
    p_columns: columns,
  });

  beforeAll(async () => {
    svc = createClient(url, serviceKey, options);
    const { data: actor, error: actorError } = await svc.from('profiles')
      .select('id,company_id,role').eq('email', process.env.RLS_USER_A_EMAIL ?? 'a@rls.test').single();
    const { data: other, error: otherError } = await svc.from('profiles')
      .select('id').eq('email', process.env.RLS_USER_B_EMAIL ?? 'b@rls.test').single();
    if (actorError || otherError || !actor || !other) throw new Error('RLS test users unavailable');
    actorId = actor.id;
    actorRole = actor.role;
    const elevated = await svc.from('profiles').update({ role: 'company_admin' }).eq('id', actorId);
    if (elevated.error) throw new Error(elevated.error.message);

    const email = `vehicle-permissions-${unique}@rls.test`;
    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email, password: 'Test1234!', email_confirm: true,
    });
    if (createError || !created.user) throw new Error(createError?.message ?? 'Target user unavailable');
    targetId = created.user.id;
    const targetProfile = await svc.from('profiles').upsert({
      id: targetId, email, name: 'Vehicle Permission Target',
      role: 'sales', access_scope: 'company', company_id: actor.company_id, status: 'active',
    });
    if (targetProfile.error) throw new Error(targetProfile.error.message);

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
    if (targetId) {
      await svc.from('audit_logs').delete().eq('entity_id', targetId).eq('entity_type', 'vehicle_permissions');
      await svc.from('column_permissions').delete().eq('user_id', targetId);
      await svc.auth.admin.deleteUser(targetId);
    }
    if (actorId && actorRole) await svc.from('profiles').update({ role: actorRole }).eq('id', actorId);
  });

  it('atomically saves general and column permissions with audit evidence', async () => {
    const saved = await admin.rpc('save_vehicle_user_permissions', args());
    expect(saved.error).toBeNull();
    const { data: target } = await svc.from('profiles')
      .select('can_edit_vehicles,can_bulk_edit_vehicles,can_view_vehicle_details').eq('id', targetId).single();
    expect(target).toMatchObject({
      can_edit_vehicles: true, can_bulk_edit_vehicles: false, can_view_vehicle_details: true,
    });
    const { data: columns } = await svc.from('column_permissions')
      .select('column_name,permission_level').eq('user_id', targetId).eq('table_name', 'vehicles');
    expect(columns).toEqual([{ column_name: 'chassis_no', permission_level: 'view' }]);
    const { data: audit } = await svc.from('audit_logs')
      .select('user_id,changes').eq('entity_id', targetId).eq('entity_type', 'vehicle_permissions').single();
    expect(audit?.user_id).toBe(actorId);
    expect((audit?.changes as Record<string, unknown>).after).toMatchObject({
      can_edit: true, columns: { chassis_no: 'view' },
    });
  });

  it('rejects direct writes, other-company actors, self-edit, and invalid drafts without partial changes', async () => {
    const direct = await admin.from('column_permissions').insert({
      user_id: targetId, table_name: 'vehicles', column_name: 'remark', permission_level: 'edit',
    });
    expect(direct.error).not.toBeNull();
    const otherCompany = await outsider.rpc('save_vehicle_user_permissions', args({ remark: 'edit' }));
    expect(otherCompany.error?.message).toContain('Not authorized');
    const self = await admin.rpc('save_vehicle_user_permissions', { ...args(), p_user_id: actorId });
    expect(self.error?.message).toContain('Not authorized');
    const invalid = await admin.rpc('save_vehicle_user_permissions', args({ chassis_no: 'invalid' }));
    expect(invalid.error?.message).toContain('Invalid Vehicle column permission');
    const { data: columns } = await svc.from('column_permissions')
      .select('column_name,permission_level').eq('user_id', targetId).eq('table_name', 'vehicles');
    expect(columns).toEqual([{ column_name: 'chassis_no', permission_level: 'view' }]);
    const { data: target } = await svc.from('profiles').select('can_edit_vehicles').eq('id', targetId).single();
    expect(target?.can_edit_vehicles).toBe(true);
  });
});
