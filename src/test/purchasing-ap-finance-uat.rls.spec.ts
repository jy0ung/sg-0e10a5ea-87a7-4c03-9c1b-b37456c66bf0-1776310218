/** A single authenticated Purchasing-originated transaction through Finance. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };
const nonce = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const purchaseDate = '2024-03-12';
const supplier = 'UBS UAT Supplier';
const model = 'X50';
const chassis = `UAT${nonce}`.toUpperCase();

let svc: SupabaseClient;
let manager: SupabaseClient;
let accounts: SupabaseClient;
let outsider: SupabaseClient;
let companyId = '';
let otherCompanyId = '';
let managerId = '';
let accountsId = '';
let branchId = '';
let periodId = '';
let correctionPeriodId = '';
let poId = '';
let lineId = '';
let invoiceId = '';
let originalRole = '';
const grnIds: string[] = [];
const extraPoIds: string[] = [];
const extraInvoiceIds: string[] = [];
const vehicleIds: string[] = [];
const eventIds: string[] = [];
const journalIds: string[] = [];
const accountIds: string[] = [];

function must<T>(result: { data: T; error: { message: string } | null }, label: string): NonNullable<T> {
  if (result.error || result.data == null) throw new Error(`${label}: ${result.error?.message ?? 'no data'}`);
  return result.data as NonNullable<T>;
}

function sql(statement: string) {
  const container = process.env.RLS_DB_CONTAINER;
  if (!container) throw new Error('RLS_DB_CONTAINER is required for the concurrent GRN barrier');
  execFileSync('docker', ['exec', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', statement],
    { stdio: 'pipe' });
}

async function poStatus(target: string, client = manager, company = companyId) {
  return client.rpc('transition_po_status', { p_company_id: company, p_id: poId, p_target_status: target });
}

async function grn(number: number, quantity: number, client = manager, company = companyId, order = poId) {
  return client.rpc('create_grn', {
    p_company_id: company, p_grn_no: `UAT-GRN-${nonce}-${number}`,
    p_po_id: order, p_received_date: purchaseDate, p_supplier_dn_no: null, p_notes: null,
    p_lines: [{ purchase_order_line_id: lineId, received_quantity: quantity }],
  });
}

async function match() {
  const result = await manager.rpc('get_three_way_match_status', { p_company_id: companyId, p_pi_id: invoiceId });
  return must(result, 'match')[0] as { match_status: string; received_quantity: number; expected_amount: number };
}

live('Purchasing → AP → Finance live UAT', () => {
  beforeAll(async () => {
    svc = createClient(url, serviceKey, options);
    manager = createClient(url, anon, options);
    accounts = createClient(url, anon, options);
    outsider = createClient(url, anon, options);
    const a = must(await svc.from('profiles').select('id,company_id,role')
      .eq('email', process.env.RLS_USER_A_EMAIL ?? 'a@rls.test').single(), 'company A actor');
    const b = must(await svc.from('profiles').select('company_id')
      .eq('email', process.env.RLS_USER_B_EMAIL ?? 'b@rls.test').single(), 'company B actor');
    managerId = a.id;
    companyId = a.company_id;
    originalRole = a.role;
    otherCompanyId = b.company_id;
    must(await svc.from('profiles').update({ role: 'company_admin' }).eq('id', managerId).select('id').single(), 'manager role');

    const newAccounts = await svc.auth.admin.createUser({
      email: `uat-accounts-${nonce}@rls.test`, password: 'Test1234!', email_confirm: true,
    });
    if (newAccounts.error || !newAccounts.data.user) throw new Error(newAccounts.error?.message ?? 'accounts user missing');
    accountsId = newAccounts.data.user.id;
    must(await svc.from('profiles').update({ company_id: companyId, role: 'accounts', status: 'active' })
      .eq('id', accountsId).select('id').single(), 'accounts profile');
    const signins = await Promise.all([
      manager.auth.signInWithPassword({ email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test', password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!' }),
      accounts.auth.signInWithPassword({ email: `uat-accounts-${nonce}@rls.test`, password: 'Test1234!' }),
      outsider.auth.signInWithPassword({ email: process.env.RLS_USER_B_EMAIL ?? 'b@rls.test', password: process.env.RLS_USER_B_PASSWORD ?? 'Test1234!' }),
    ]);
    for (const login of signins) if (login.error) throw login.error;
    branchId = must(await svc.from('branches').insert({ company_id: companyId, code: `UT${nonce}`, name: 'UAT purchasing branch' })
      .select('id').single(), 'branch').id;
    for (const account of [
      { code: '1000', name: 'Cash and Bank', type: 'asset' },
      { code: '2100', name: 'Accounts Payable', type: 'liability' },
    ]) {
      const existing = await svc.from('accounts').select('id').eq('company_id', companyId).eq('code', account.code).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) continue;
      const created = must(await svc.from('accounts').insert({ company_id: companyId, ...account, is_system: true, is_active: true })
        .select('id').single(), 'system account');
      accountIds.push(created.id);
    }
    periodId = must(await svc.from('accounting_periods').insert({
      company_id: companyId, name: `Purchasing UAT ${nonce}`, period_year: 2024, period_month: 3,
      start_date: '2024-03-01', end_date: '2024-03-31', status: 'open',
    }).select('id').single(), 'period').id;
  });

  afterAll(async () => {
    if (!svc) return;
    if (journalIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', journalIds);
      await svc.from('journal_entries').delete().in('id', journalIds);
    }
    if (eventIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', eventIds);
      await svc.from('supplier_payment_events').delete().in('id', eventIds);
    }
    if (invoiceId) {
      await svc.from('audit_logs').delete().eq('entity_id', invoiceId);
      await svc.from('purchase_invoices').delete().eq('id', invoiceId);
    }
    if (extraInvoiceIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', extraInvoiceIds);
      await svc.from('purchase_invoices').delete().in('id', extraInvoiceIds);
    }
    if (grnIds.length) await svc.from('goods_receipt_notes').delete().in('id', grnIds);
    if (vehicleIds.length) await svc.from('vehicles').delete().in('id', vehicleIds);
    if (poId) await svc.from('purchase_orders').delete().eq('id', poId);
    if (extraPoIds.length) await svc.from('purchase_orders').delete().in('id', extraPoIds);
    if (periodId) {
      await svc.from('audit_logs').delete().eq('entity_id', periodId);
      await svc.from('accounting_periods').delete().eq('id', periodId);
    }
    if (correctionPeriodId) await svc.from('accounting_periods').delete().eq('id', correctionPeriodId);
    if (accountIds.length) await svc.from('accounts').delete().in('id', accountIds);
    if (branchId) await svc.from('branches').delete().eq('id', branchId);
    if (accountsId) await svc.auth.admin.deleteUser(accountsId);
    if (managerId && originalRole) await svc.from('profiles').update({ role: originalRole }).eq('id', managerId);
  });

  it('uses product commands for the complete PO, receipt, match, AP, and Finance chain', async () => {
    poId = must(await manager.rpc('create_purchase_order', {
      p_company_id: companyId, p_po_no: `UAT-PO-${nonce}`, p_supplier: supplier,
      p_order_date: purchaseDate, p_expected_delivery_date: null, p_notes: 'Live UAT',
      p_lines: [{ line_no: 1, chassis_no: chassis, model, quantity: 2, unit_price: 40000 }],
    }), 'PO');
    const po = must(await svc.from('purchase_orders').select('company_id,total_amount,created_by,lifecycle_status')
      .eq('id', poId).single(), 'PO row');
    expect(po).toMatchObject({ company_id: companyId, created_by: managerId, lifecycle_status: 'draft' });
    expect(Number(po.total_amount)).toBe(80000);
    const line = must(await svc.from('purchase_order_lines').select('id,company_id,purchase_order_id,line_amount,quantity')
      .eq('purchase_order_id', poId).single(), 'PO line');
    lineId = line.id;
    expect(line).toMatchObject({ company_id: companyId, purchase_order_id: poId });
    expect(Number(line.line_amount)).toBe(80000);
    expect((await poStatus('approved')).error).not.toBeNull();
    expect((await outsider.from('purchase_orders').select('id').eq('id', poId)).data).toEqual([]);
    expect((await poStatus('submitted', outsider, otherCompanyId)).error).not.toBeNull();
    expect((await poStatus('submitted')).error).toBeNull();
    expect((await poStatus('approved', accounts)).error).not.toBeNull();
    expect((await poStatus('approved')).error).toBeNull();
    const approved = must(await svc.from('purchase_orders').select('lifecycle_status,approved_at,approved_by')
      .eq('id', poId).single(), 'approved PO');
    expect(approved.lifecycle_status).toBe('approved');
    expect(approved.approved_at).toBeTruthy();
    expect(approved.approved_by).toBe(managerId);

    expect((await grn(0, 1, outsider, otherCompanyId)).error).not.toBeNull();
    const firstGrn = must(await grn(1, 1), 'partial GRN');
    grnIds.push(firstGrn);
    const firstLine = must(await svc.from('grn_lines').select('purchase_order_line_id,received_quantity')
      .eq('goods_receipt_note_id', firstGrn).single(), 'GRN line');
    expect(firstLine.purchase_order_line_id).toBe(lineId);
    expect(Number(firstLine.received_quantity)).toBe(1);
    expect((await grn(2, 2)).error).not.toBeNull();
    expect((await svc.from('purchase_orders').select('lifecycle_status').eq('id', poId).single()).data?.lifecycle_status).toBe('approved');

    // Current product insert creates an unmatched invoice; the canonical link
    // below must be established by an authenticated Purchasing command.
    invoiceId = must(await manager.from('purchase_invoices').insert({
      company_id: companyId, invoice_no: `UAT-PI-${nonce}`, supplier, chassis_no: chassis,
      model, invoice_date: purchaseDate, amount: 80002, status: 'pending',
    }).select('id').single(), 'purchase invoice').id;
    expect((await match()).match_status).toBe('unmatched');
    expect((await outsider.rpc('get_three_way_match_status', { p_company_id: companyId, p_pi_id: invoiceId })).error).not.toBeNull();
    expect((await outsider.from('purchase_invoices').select('id').eq('id', invoiceId)).data).toEqual([]);
    expect((await manager.from('purchase_invoices').update({ po_line_id: lineId }).eq('id', invoiceId)).error).not.toBeNull();
    expect((await outsider.rpc('link_purchase_invoice_po_line', { p_invoice_id: invoiceId, p_po_line_id: lineId })).error).not.toBeNull();
    const link = await manager.rpc('link_purchase_invoice_po_line', { p_invoice_id: invoiceId, p_po_line_id: lineId });
    expect(link.error).toBeNull();
    const linkAudit = must(await svc.from('audit_logs').select('user_id,changes')
      .eq('entity_id', invoiceId).eq('action', 'link').single(), 'PO link audit');
    expect(linkAudit.user_id).toBe(managerId);
    expect((linkAudit.changes as { after_po_line_id: string }).after_po_line_id).toBe(lineId);
    const linkedDetail = must(await manager.from('purchase_invoices')
      .select('po_line_id,_po:purchase_order_lines!po_line_id(purchase_order_id,quantity,unit_price,purchase_orders!purchase_order_id(po_no))')
      .eq('id', invoiceId).single(), 'invoice detail PO reference');
    expect(linkedDetail.po_line_id).toBe(lineId);
    expect((linkedDetail._po as unknown as { purchase_order_id: string } | null)?.purchase_order_id).toBe(poId);
    expect((await match()).match_status).toBe('pending_receipt');

    const secondGrn = must(await grn(3, 1), 'final GRN');
    grnIds.push(secondGrn);
    expect((await svc.from('purchase_orders').select('lifecycle_status').eq('id', poId).single()).data?.lifecycle_status).toBe('fulfilled');
    expect((await grn(4, 1)).error).not.toBeNull();
    expect((await match()).match_status).toBe('amount_variance');
    must(await manager.from('purchase_invoices').update({ amount: 80000 }).eq('id', invoiceId).select('id').single(), 'correct invoice amount');
    expect((await match()).match_status).toBe('matched');
    expect((await manager.rpc('transition_pi_lifecycle', { p_id: invoiceId, p_target_status: 'verified' })).error).not.toBeNull();
    const vehicleId = must(await manager.rpc('receive_purchase_invoice', {
      p_company_id: companyId, p_invoice_id: invoiceId, p_branch_id: branchId,
    }), 'invoice physical receipt');
    vehicleIds.push(vehicleId);
    const vehicle = must(await svc.from('vehicles').select('company_id,chassis_no,company_branch_id,invoice_no')
      .eq('id', vehicleId).single(), 'Vehicle');
    expect(vehicle).toMatchObject({ company_id: companyId, chassis_no: chassis, company_branch_id: branchId, invoice_no: `UAT-PI-${nonce}` });
    const invoiceReceived = must(await svc.from('purchase_invoices').select('status,received_date')
      .eq('id', invoiceId).single(), 'received invoice');
    expect(invoiceReceived.status).toBe('received');
    expect(invoiceReceived.received_date).toBeTruthy();
    expect((await outsider.rpc('transition_pi_lifecycle', { p_id: invoiceId, p_target_status: 'verified' })).error).not.toBeNull();
    expect((await accounts.rpc('transition_pi_lifecycle', { p_id: invoiceId, p_target_status: 'verified' })).error).toBeNull();
    expect((await accounts.rpc('transition_pi_lifecycle', { p_id: invoiceId, p_target_status: 'approved' })).error).not.toBeNull();
    expect((await manager.rpc('transition_pi_lifecycle', { p_id: invoiceId, p_target_status: 'approved' })).error).toBeNull();

    const payment = must(await accounts.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: invoiceId, p_amount: 80000, p_payment_date: purchaseDate,
      p_payment_method: 'Bank Transfer', p_reference_no: `UAT-${nonce}`,
    }), 'supplier payment');
    eventIds.push(payment);
    expect((await outsider.rpc('post_ap_payment_to_gl', { p_supplier_payment_event_id: payment })).error).not.toBeNull();
    expect((await outsider.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: invoiceId, p_amount: 1, p_payment_date: purchaseDate,
    })).error).not.toBeNull();
    expect((await accounts.from('supplier_payment_events').update({ amount: 1 }).eq('id', payment)).error).not.toBeNull();
    expect((await accounts.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: invoiceId, p_amount: 1, p_payment_date: purchaseDate,
    })).error).not.toBeNull();
    const paid = must(await svc.from('purchase_invoices').select('paid_amount,payment_status')
      .eq('id', invoiceId).single(), 'paid invoice');
    expect(Number(paid.paid_amount)).toBe(80000);
    expect(paid.payment_status).toBe('paid');
    const unposted = must(await manager.rpc('get_period_close_summary', { p_company_id: companyId, p_period_id: periodId }), 'preclose')[0];
    expect(Number(unposted.unposted_ap_payment_count)).toBe(1);
    const journalId = must(await accounts.rpc('post_ap_payment_to_gl', { p_supplier_payment_event_id: payment }), 'AP journal');
    journalIds.push(journalId);
    expect((await accounts.rpc('post_ap_payment_to_gl', { p_supplier_payment_event_id: payment })).data).toBe(journalId);
    const journal = must(await svc.from('journal_entries').select('company_id,period_id,source_type,source_id')
      .eq('id', journalId).single(), 'journal row');
    expect(journal).toMatchObject({ company_id: companyId, period_id: periodId, source_type: 'ap_payment', source_id: payment });
    const lines = must(await svc.from('journal_entry_lines').select('debit,credit,account_id')
      .eq('journal_entry_id', journalId), 'journal lines');
    const glAccounts = must(await svc.from('accounts').select('id,code').eq('company_id', companyId)
      .in('code', ['1000', '2100']), 'GL accounts');
    const codeById = new Map(glAccounts.map(account => [account.id, account.code]));
    expect(lines).toHaveLength(2);
    expect(lines.map(row => [codeById.get(row.account_id), Number(row.debit), Number(row.credit)]))
      .toEqual(expect.arrayContaining([['2100', 80000, 0], ['1000', 0, 80000]]));
    const balance = must(await manager.rpc('get_trial_balance', { p_company_id: companyId, p_period_id: periodId }), 'trial balance');
    expect(balance.find((row: { account_code: string }) => row.account_code === '2100')?.total_debit).toBe(80000);
    expect(balance.find((row: { account_code: string }) => row.account_code === '1000')?.total_credit).toBe(80000);
    const aging = must(await accounts.rpc('get_ap_aging_summary', { p_company_id: companyId }), 'AP aging');
    expect(aging.reduce((sum: number, row: { total_outstanding: number }) => sum + Number(row.total_outstanding), 0)).toBe(0);
    const closeReady = must(await manager.rpc('get_period_close_summary', { p_company_id: companyId, p_period_id: periodId }), 'close readiness')[0];
    expect(Number(closeReady.unposted_ap_payment_count)).toBe(0);
    expect(Number(closeReady.unposted_ar_payment_count)).toBe(0);
    expect(Number(closeReady.total_debit)).toBe(80000);
    expect(Number(closeReady.total_credit)).toBe(80000);
    const closed = must(await manager.rpc('close_accounting_period', { p_period_id: periodId }), 'period close');
    expect(closed).toMatchObject({ status: 'closed', closed_by: managerId });
    expect(closed.closed_at).toBeTruthy();
    expect((await svc.from('audit_logs').select('id').eq('entity_id', periodId).eq('action', 'close')).data).toHaveLength(1);
    expect((await accounts.rpc('post_ap_payment_to_gl', { p_supplier_payment_event_id: payment })).data).toBe(journalId);
    expect((await manager.rpc('link_purchase_invoice_po_line', { p_invoice_id: invoiceId, p_po_line_id: null })).error).not.toBeNull();

    // A historical close stays fixed while the existing Finance correction
    // command reopens the payable in the current open period.
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    correctionPeriodId = must(await svc.from('accounting_periods').insert({
      company_id: companyId, name: `UAT correction ${nonce}`, period_year: year, period_month: month,
      start_date: firstDay, end_date: lastDay, status: 'open',
    }).select('id').single(), 'correction period').id;
    const reversalId = must(await accounts.rpc('reverse_supplier_payment_event', {
      p_event_id: payment, p_reason: 'UAT controlled posted-payment correction',
    }), 'supplier payment correction');
    eventIds.push(reversalId);
    const correction = must(await svc.from('journal_entries').select('id,period_id,source_type,source_id')
      .eq('source_type', 'adjustment').eq('source_id', journalId).single(), 'correction journal');
    journalIds.push(correction.id);
    expect(correction).toMatchObject({ period_id: correctionPeriodId, source_type: 'adjustment', source_id: journalId });
    const historical = must(await svc.from('journal_entries').select('period_id,source_type,source_id')
      .eq('id', journalId).single(), 'historical journal');
    expect(historical).toMatchObject({ period_id: periodId, source_type: 'ap_payment', source_id: payment });
    const historicalLines = must(await svc.from('journal_entry_lines').select('debit,credit,account_id')
      .eq('journal_entry_id', journalId), 'historical journal lines');
    expect(historicalLines).toEqual(expect.arrayContaining(lines));
    expect(historicalLines).toHaveLength(lines.length);
    const correctionLines = must(await svc.from('journal_entry_lines').select('debit,credit,account_id')
      .eq('journal_entry_id', correction.id), 'correction journal lines');
    expect(correctionLines).toHaveLength(2);
    expect(correctionLines.map(row => [codeById.get(row.account_id), Number(row.debit), Number(row.credit)]))
      .toEqual(expect.arrayContaining([['2100', 0, 80000], ['1000', 80000, 0]]));
    const reopened = must(await svc.from('purchase_invoices').select('paid_amount,payment_status,lifecycle_status')
      .eq('id', invoiceId).single(), 'reopened payable');
    expect(reopened).toMatchObject({ payment_status: 'unpaid', lifecycle_status: 'approved' });
    expect(Number(reopened.paid_amount)).toBe(0);
    const restoredAging = must(await accounts.rpc('get_ap_aging_summary', { p_company_id: companyId }), 'restored AP aging');
    expect(restoredAging.reduce((sum: number, row: { total_outstanding: number }) => sum + Number(row.total_outstanding), 0)).toBe(80000);
    expect((await manager.rpc('get_period_close_summary', {
      p_company_id: companyId, p_period_id: periodId,
    })).data?.[0]?.period_status).toBe('closed');
  });

  it('does not over-receive when two authenticated GRNs race for one remaining unit', async () => {
    const concurrentPoId = must(await manager.rpc('create_purchase_order', {
      p_company_id: companyId, p_po_no: `UAT-RACE-${nonce}`, p_supplier: supplier,
      p_order_date: purchaseDate, p_expected_delivery_date: null, p_notes: null,
      p_lines: [{ line_no: 1, chassis_no: null, model, quantity: 1, unit_price: 100 }],
    }), 'concurrent PO');
    extraPoIds.push(concurrentPoId);
    const concurrentLineId = must(await svc.from('purchase_order_lines').select('id')
      .eq('purchase_order_id', concurrentPoId).single(), 'concurrent PO line').id;
    const args = (number: number) => ({
      p_company_id: companyId, p_grn_no: `UAT-RACE-GRN-${nonce}-${number}`,
      p_po_id: concurrentPoId, p_received_date: purchaseDate, p_supplier_dn_no: null, p_notes: null,
      p_lines: [{ purchase_order_line_id: concurrentLineId, received_quantity: 1 }],
    });
    expect((await manager.rpc('create_grn', args(0))).error).not.toBeNull();
    expect((await manager.rpc('transition_po_status', {
      p_company_id: companyId, p_id: concurrentPoId, p_target_status: 'submitted',
    })).error).toBeNull();
    expect((await manager.rpc('transition_po_status', {
      p_company_id: companyId, p_id: concurrentPoId, p_target_status: 'approved',
    })).error).toBeNull();
    // A disposable test-only trigger holds both calls after the prior-receipt
    // read, making the lost-update window deterministic without editing the
    // product function under test.
    sql(`CREATE FUNCTION public.uat_delay_grn_insert() RETURNS trigger LANGUAGE plpgsql
      SET search_path = pg_catalog, public AS $$ BEGIN
      IF NEW.purchase_order_line_id = '${concurrentLineId}'::uuid THEN PERFORM pg_sleep(0.8); END IF;
      RETURN NEW; END; $$;
      CREATE TRIGGER uat_delay_grn_insert BEFORE INSERT ON public.grn_lines
      FOR EACH ROW EXECUTE FUNCTION public.uat_delay_grn_insert();`);
    let attempts;
    try {
      attempts = await Promise.all([
        manager.rpc('create_grn', args(1)),
        accounts.rpc('create_grn', args(2)),
      ]);
    } finally {
      sql('DROP TRIGGER IF EXISTS uat_delay_grn_insert ON public.grn_lines; DROP FUNCTION IF EXISTS public.uat_delay_grn_insert()');
    }
    for (const result of attempts) if (result.data) grnIds.push(result.data as string);
    const received = must(await svc.from('grn_lines').select('received_quantity')
      .eq('purchase_order_line_id', concurrentLineId), 'concurrent receipts');
    expect(received.reduce((sum, row) => sum + Number(row.received_quantity), 0)).toBeLessThanOrEqual(1);
    expect(attempts.filter(result => !result.error)).toHaveLength(1);
  });

  it('blocks pending and variance matches at AP approval and rejects foreign PO-line identity', async () => {
    const negativeChassis = `NEG${nonce}`.toUpperCase();
    const negativePoId = must(await manager.rpc('create_purchase_order', {
      p_company_id: companyId, p_po_no: `UAT-NEG-${nonce}`, p_supplier: supplier,
      p_order_date: purchaseDate, p_expected_delivery_date: null, p_notes: null,
      p_lines: [{ line_no: 1, chassis_no: negativeChassis, model, quantity: 1, unit_price: 100 }],
    }), 'negative PO');
    extraPoIds.push(negativePoId);
    const negativeLineId = must(await svc.from('purchase_order_lines').select('id')
      .eq('purchase_order_id', negativePoId).single(), 'negative PO line').id;
    const foreignPoId = must(await outsider.rpc('create_purchase_order', {
      p_company_id: otherCompanyId, p_po_no: `UAT-FOREIGN-${nonce}`, p_supplier: supplier,
      p_order_date: purchaseDate, p_expected_delivery_date: null, p_notes: null,
      p_lines: [{ line_no: 1, chassis_no: negativeChassis, model, quantity: 1, unit_price: 100 }],
    }), 'foreign PO');
    extraPoIds.push(foreignPoId);
    const foreignLineId = must(await svc.from('purchase_order_lines').select('id')
      .eq('purchase_order_id', foreignPoId).single(), 'foreign PO line').id;
    expect((await outsider.from('purchase_order_lines').select('id').eq('id', negativeLineId)).data).toEqual([]);
    for (const target of ['submitted', 'approved']) {
      expect((await manager.rpc('transition_po_status', {
        p_company_id: companyId, p_id: negativePoId, p_target_status: target,
      })).error).toBeNull();
    }
    const linkedArgs = {
      p_invoice_no: `UAT-NEG-PI-${nonce}`, p_supplier: supplier,
      p_chassis_no: negativeChassis, p_model: model, p_invoice_date: purchaseDate,
      p_amount: 102, p_remark: null, p_po_line_id: negativeLineId,
    };
    expect((await manager.rpc('create_linked_purchase_invoice', {
      ...linkedArgs, p_invoice_no: `UAT-FOREIGN-PI-${nonce}`, p_po_line_id: foreignLineId,
    })).error).not.toBeNull();
    expect((await svc.from('purchase_invoices').select('id')
      .eq('invoice_no', `UAT-FOREIGN-PI-${nonce}`)).data).toEqual([]);
    const negativeInvoiceId = must(await manager.rpc('create_linked_purchase_invoice', linkedArgs), 'atomic linked invoice');
    extraInvoiceIds.push(negativeInvoiceId);
    expect((await manager.rpc('link_purchase_invoice_po_line', {
      p_invoice_id: negativeInvoiceId, p_po_line_id: foreignLineId,
    })).error).not.toBeNull();
    expect((await svc.from('purchase_invoices').select('po_line_id').eq('id', negativeInvoiceId).single()).data?.po_line_id)
      .toBe(negativeLineId);
    const negativeVehicleId = must(await manager.rpc('receive_purchase_invoice', {
      p_company_id: companyId, p_invoice_id: negativeInvoiceId, p_branch_id: branchId,
    }), 'negative invoice receipt');
    vehicleIds.push(negativeVehicleId);
    expect((await accounts.rpc('transition_pi_lifecycle', {
      p_id: negativeInvoiceId, p_target_status: 'verified',
    })).error).toBeNull();
    const pending = await manager.rpc('get_three_way_match_status', { p_company_id: companyId, p_pi_id: negativeInvoiceId });
    expect(pending.data?.[0]?.match_status).toBe('pending_receipt');
    expect((await manager.rpc('transition_pi_lifecycle', {
      p_id: negativeInvoiceId, p_target_status: 'approved',
    })).error?.message).toMatch(/must match/i);
    const completeGrn = must(await manager.rpc('create_grn', {
      p_company_id: companyId, p_grn_no: `UAT-NEG-GRN-${nonce}`, p_po_id: negativePoId,
      p_received_date: purchaseDate, p_supplier_dn_no: null, p_notes: null,
      p_lines: [{ purchase_order_line_id: negativeLineId, received_quantity: 1 }],
    }), 'negative PO GRN');
    grnIds.push(completeGrn);
    const variance = await manager.rpc('get_three_way_match_status', { p_company_id: companyId, p_pi_id: negativeInvoiceId });
    expect(variance.data?.[0]?.match_status).toBe('amount_variance');
    expect((await manager.rpc('transition_pi_lifecycle', {
      p_id: negativeInvoiceId, p_target_status: 'approved',
    })).error?.message).toMatch(/must match/i);
    expect((await accounts.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: negativeInvoiceId, p_amount: 1, p_payment_date: purchaseDate,
    })).error).not.toBeNull();
  });
});
