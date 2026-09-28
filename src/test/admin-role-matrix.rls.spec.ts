import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { APP_ROLES } from '@flc/types';
import { DEFAULT_ROLE_SECTIONS } from '@flc/auth';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };

live('Admin role matrix transaction', () => {
  let svc: SupabaseClient;
  let admin: SupabaseClient;
  let outsider: SupabaseClient;
  let actorId = '';
  let actorRole = '';
  let companyId = '';
  let originalRows: Array<Record<string, unknown>> = [];
  let originalVersion: number | null = null;

  beforeAll(async () => {
    svc = createClient(url, serviceKey, options);
    const { data: actor, error } = await svc.from('profiles')
      .select('id,company_id,role').eq('email', process.env.RLS_USER_A_EMAIL ?? 'a@rls.test').single();
    if (error || !actor) throw new Error(error?.message ?? 'RLS actor unavailable');
    actorId = actor.id;
    actorRole = actor.role;
    companyId = actor.company_id;
    const original = await svc.from('role_sections').select('*').eq('company_id', companyId);
    if (original.error) throw new Error(original.error.message);
    originalRows = original.data ?? [];
    const version = await svc.from('role_section_matrix_versions').select('version').eq('company_id', companyId).maybeSingle();
    originalVersion = version.data?.version ?? null;
    const elevated = await svc.from('profiles').update({ role: 'company_admin' }).eq('id', actorId);
    if (elevated.error) throw new Error(elevated.error.message);
    admin = createClient(url, anon, options);
    outsider = createClient(url, anon, options);
    const loginA = await admin.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test', password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    });
    const loginB = await outsider.auth.signInWithPassword({
      email: process.env.RLS_USER_B_EMAIL ?? 'b@rls.test', password: process.env.RLS_USER_B_PASSWORD ?? 'Test1234!',
    });
    if (loginA.error || loginB.error) throw new Error('RLS test sign-in failed');
  });

  afterAll(async () => {
    if (companyId) {
      await svc.from('role_sections').delete().eq('company_id', companyId);
      if (originalRows.length) await svc.from('role_sections').insert(originalRows);
      if (originalVersion === null) await svc.from('role_section_matrix_versions').delete().eq('company_id', companyId);
      else await svc.from('role_section_matrix_versions').update({ version: originalVersion }).eq('company_id', companyId);
    }
    if (actorId && actorRole) await svc.from('profiles').update({ role: actorRole }).eq('id', actorId);
  });

  it('saves every role atomically, audits, and rejects stale or unauthorized writes', async () => {
    const initial = await admin.rpc('get_role_section_matrix', { p_company_id: companyId });
    expect(initial.error).toBeNull();
    const baseVersion = Number(initial.data.version);
    const matrix = Object.fromEntries(APP_ROLES.map(role => [role, [...DEFAULT_ROLE_SECTIONS[role]]]));
    matrix.manager = [];
    matrix.sales = ['Platform', 'Sales'];
    const direct = await admin.from('role_sections').update({ allowed: false }).eq('company_id', companyId);
    expect(direct.error).not.toBeNull();
    const crossCompany = await outsider.rpc('save_role_section_matrix', {
      p_company_id: companyId, p_expected_version: baseVersion, p_matrix: matrix,
    });
    expect(crossCompany.error?.message).toContain('Not authorized');

    const saved = await admin.rpc('save_role_section_matrix', {
      p_company_id: companyId, p_expected_version: baseVersion, p_matrix: matrix,
    });
    expect(saved.error).toBeNull();
    expect(saved.data).toBe(baseVersion + 1);
    const loaded = await admin.rpc('get_role_section_matrix', { p_company_id: companyId });
    expect(loaded.data.matrix.manager).toEqual([]);
    expect(loaded.data.matrix.sales).toEqual(['Platform', 'Sales']);
    const stale = await admin.rpc('save_role_section_matrix', {
      p_company_id: companyId, p_expected_version: baseVersion, p_matrix: matrix,
    });
    expect(stale.error?.message).toContain('changed since it was loaded');
    const invalid = await admin.rpc('save_role_section_matrix', {
      p_company_id: companyId, p_expected_version: baseVersion + 1,
      p_matrix: { ...matrix, manager: ['Invented Section'] },
    });
    expect(invalid.error?.message).toContain('Invalid role matrix section');
    const afterFailures = await admin.rpc('get_role_section_matrix', { p_company_id: companyId });
    expect(afterFailures.data.version).toBe(baseVersion + 1);
    const audits = await svc.from('audit_logs').select('changes')
      .eq('entity_type', 'role_section_matrix').eq('user_id', actorId);
    expect(audits.data?.some(row => (row.changes as Record<string, unknown>)?.version === baseVersion + 1)).toBe(true);
  }, 20_000);
});
