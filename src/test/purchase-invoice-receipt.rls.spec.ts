import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };
const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let service: SupabaseClient;
let manager: SupabaseClient;
let ordinary: SupabaseClient;
let managerId = '';
let companyA = '';
let companyB = '';
let branchA = '';
let branchB = '';
const invoices: string[] = [];
const vehicles: string[] = [];

async function seedInvoice(chassis: string, model = 'X50'): Promise<string> {
  const { data, error } = await service.from('purchase_invoices').insert({
    company_id: companyA, invoice_no: `RECEIPT-${unique}-${invoices.length}`,
    supplier: 'Receipt test supplier', chassis_no: chassis, model,
    invoice_date: '2026-09-27', amount: 85000, status: 'pending',
  }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Invoice insert failed');
  invoices.push(data.id);
  return data.id;
}

live('purchase invoice atomic receipt', () => {
  beforeAll(async () => {
    service = createClient(url, serviceKey, options);
    const { data: a, error: aErr } = await service.from('profiles').select('company_id')
      .eq('email', process.env.RLS_USER_A_EMAIL ?? 'a@rls.test').single();
    const { data: b, error: bErr } = await service.from('profiles').select('company_id')
      .eq('email', process.env.RLS_USER_B_EMAIL ?? 'b@rls.test').single();
    if (aErr || bErr || !a?.company_id || !b?.company_id) throw new Error('Seeded companies unavailable');
    companyA = a.company_id;
    companyB = b.company_id;

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: `receipt-${unique}@rls.test`, password: 'Test1234!', email_confirm: true,
    });
    if (createError || !created.user) throw new Error(createError?.message ?? 'Manager creation failed');
    managerId = created.user.id;
    const { error: profileError } = await service.from('profiles')
      .update({ company_id: companyA, role: 'manager', status: 'active' }).eq('id', managerId);
    if (profileError) throw new Error(profileError.message);

    manager = createClient(url, anon, options);
    ordinary = createClient(url, anon, options);
    const managerLogin = await manager.auth.signInWithPassword({ email: `receipt-${unique}@rls.test`, password: 'Test1234!' });
    const ordinaryLogin = await ordinary.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    });
    if (managerLogin.error || ordinaryLogin.error) throw new Error('Test sign-in failed');

    const { data: branches, error: branchError } = await service.from('branches').insert([
      { company_id: companyA, code: `RA${unique}`, name: 'Receipt A' },
      { company_id: companyB, code: `RB${unique}`, name: 'Receipt B' },
    ]).select('id,company_id');
    if (branchError || !branches) throw new Error(branchError?.message ?? 'Branch creation failed');
    branchA = branches.find(branch => branch.company_id === companyA)?.id ?? '';
    branchB = branches.find(branch => branch.company_id === companyB)?.id ?? '';
  });

  afterAll(async () => {
    if (vehicles.length) await service.from('vehicles').delete().in('id', vehicles);
    if (invoices.length) await service.from('purchase_invoices').delete().in('id', invoices);
    if (branchA && branchB) await service.from('branches').delete().in('id', [branchA, branchB]);
    if (managerId) await service.auth.admin.deleteUser(managerId);
  });

  it('creates one correctly scoped Vehicle and audits the invoice transition', async () => {
    const invoiceId = await seedInvoice(`RCPT${unique}`);
    const { data: vehicleId, error } = await manager.rpc('receive_purchase_invoice', {
      p_company_id: companyA, p_invoice_id: invoiceId, p_branch_id: branchA,
    });
    expect(error).toBeNull();
    expect(vehicleId).toBeTruthy();
    vehicles.push(vehicleId);
    const { data: invoice } = await service.from('purchase_invoices').select('status,received_date').eq('id', invoiceId).single();
    const { data: vehicle } = await service.from('vehicles')
      .select('company_id,chassis_no,model,company_branch_id,branch_code,date_received_by_outlet')
      .eq('id', vehicleId).single();
    const { data: audit } = await service.from('audit_logs')
      .select('user_id,changes').eq('entity_id', invoiceId).eq('action', 'receive').single();
    expect(invoice?.status).toBe('received');
    expect(invoice?.received_date).toBeTruthy();
    expect(vehicle).toMatchObject({ company_id: companyA, model: 'X50', company_branch_id: branchA });
    expect(vehicle?.date_received_by_outlet).toBe(invoice?.received_date);
    expect(audit?.user_id).toBe(managerId);
    expect((audit?.changes as { vehicle_id?: string })?.vehicle_id).toBe(vehicleId);
    const replay = await manager.rpc('receive_purchase_invoice', {
      p_company_id: companyA, p_invoice_id: invoiceId, p_branch_id: branchA,
    });
    expect(replay.error?.message).toContain('Only pending');
  });

  it('rejects ordinary roles and foreign branches with no partial write', async () => {
    const invoiceId = await seedInvoice(`BLOCK${unique}`);
    const args = { p_company_id: companyA, p_invoice_id: invoiceId, p_branch_id: branchA };
    const denied = await ordinary.rpc('receive_purchase_invoice', args);
    expect(denied.error?.message).toContain('Not authorized');
    const foreign = await manager.rpc('receive_purchase_invoice', { ...args, p_branch_id: branchB });
    expect(foreign.error?.message).toContain('Receiving branch');
    const { data: invoice } = await service.from('purchase_invoices').select('status,received_date').eq('id', invoiceId).single();
    const { count } = await service.from('vehicles').select('id', { count: 'exact', head: true })
      .eq('company_id', companyA).eq('chassis_no', `BLOCK${unique}`);
    expect(invoice).toMatchObject({ status: 'pending', received_date: null });
    expect(count).toBe(0);
  });

  it('rolls back a conflicting inventory branch and preserves its facts', async () => {
    const chassis = `CONFLICT${unique}`;
    const invoiceId = await seedInvoice(chassis);
    const { data: otherBranch, error: branchError } = await service.from('branches')
      .insert({ company_id: companyA, code: `RX${unique}`, name: 'Other outlet' }).select('id').single();
    if (branchError || !otherBranch) throw new Error(branchError?.message ?? 'Other branch failed');
    try {
      const { data: existing, error: vehicleError } = await service.from('vehicles').insert({
        company_id: companyA, chassis_no: chassis, model: 'X50', branch_code: `RX${unique}`,
        company_branch_id: otherBranch.id,
      }).select('id').single();
      if (vehicleError || !existing) throw new Error(vehicleError?.message ?? 'Vehicle failed');
      vehicles.push(existing.id);
      const result = await manager.rpc('receive_purchase_invoice', {
        p_company_id: companyA, p_invoice_id: invoiceId, p_branch_id: branchA,
      });
      expect(result.error?.message).toContain('Inventory branch differs');
      const { data: invoice } = await service.from('purchase_invoices').select('status').eq('id', invoiceId).single();
      const { data: vehicle } = await service.from('vehicles')
        .select('company_branch_id,date_received_by_outlet').eq('id', existing.id).single();
      expect(invoice?.status).toBe('pending');
      expect(vehicle?.company_branch_id).toBe(otherBranch.id);
      expect(vehicle?.date_received_by_outlet).toBeNull();
    } finally {
      await service.from('branches').delete().eq('id', otherBranch.id);
    }
  });
});
