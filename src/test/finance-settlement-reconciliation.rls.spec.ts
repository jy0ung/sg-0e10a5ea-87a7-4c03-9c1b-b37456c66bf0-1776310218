import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };
const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const paymentDate = '2024-01-20';
const februaryDate = '2024-02-15';

let svc: SupabaseClient;
let actor: SupabaseClient;
let outsider: SupabaseClient;
let actorId = '';
let oldRole = '';
let companyId = '';
let januaryId = '';
let februaryId = '';
let marchId = '';
let aprilId = '';
const accounts = new Map<string, string>();
const createdAccountIds: string[] = [];
const orderIds: string[] = [];
const arInvoiceIds: string[] = [];
const apInvoiceIds: string[] = [];
const arEventIds: string[] = [];
const apEventIds: string[] = [];
const journalIds: string[] = [];

type Summary = {
  period_status: string;
  journal_entry_count: number;
  total_debit: number;
  total_credit: number;
  unposted_ar_payment_count: number;
  unposted_ap_payment_count: number;
  open_ar_invoice_count: number;
};
type Balance = { account_code: string; total_debit: number; total_credit: number; net_balance: number };
type Sheet = { account_code: string; balance: number };
type Profit = { account_code: string; amount: number };

async function summary(periodId: string): Promise<Summary> {
  const result = await actor.rpc('get_period_close_summary', { p_company_id: companyId, p_period_id: periodId });
  if (result.error) throw result.error;
  return (result.data as Summary[])[0];
}

async function trialBalance(periodId: string): Promise<Map<string, Balance>> {
  const result = await actor.rpc('get_trial_balance', { p_company_id: companyId, p_period_id: periodId });
  if (result.error) throw result.error;
  return new Map((result.data as Balance[]).map(row => [row.account_code, row]));
}

async function seedArInvoice(label = 'AR-UAT'): Promise<string> {
  const order = await svc.from('sales_orders').insert({
    company_id: companyId, order_no: `${label}-${unique}`,
    salesman_name: 'Finance UAT', branch_code: 'KK', model: 'X50', booking_date: '2024-01-05',
  }).select('id').single();
  if (order.error || !order.data) throw new Error(order.error?.message ?? 'Sales order fixture failed');
  orderIds.push(order.data.id);
  const invoice = await svc.from('invoices').insert({
    company_id: companyId, sales_order_id: order.data.id, invoice_no: `${label}-${unique}`,
    invoice_date: '2024-01-05', due_date: '2024-01-31', amount: 50_000, total_amount: 50_000,
  }).select('id').single();
  if (invoice.error || !invoice.data) throw new Error(invoice.error?.message ?? 'AR invoice fixture failed');
  arInvoiceIds.push(invoice.data.id);
  return invoice.data.id;
}

async function seedApInvoice(label = 'AP-UAT'): Promise<string> {
  const invoice = await svc.from('purchase_invoices').insert({
    company_id: companyId, invoice_no: `${label}-${unique}`,
    supplier: 'Finance UAT Supplier', chassis_no: `${label}${unique}`,
    model: 'X50', invoice_date: '2024-01-05', due_date: '2024-01-31',
    amount: 30_000, status: 'received', lifecycle_status: 'approved',
  }).select('id').single();
  if (invoice.error || !invoice.data) throw new Error(invoice.error?.message ?? 'AP invoice fixture failed');
  apInvoiceIds.push(invoice.data.id);
  return invoice.data.id;
}

live('AR/AP settlement to close and report reconciliation', () => {
  beforeAll(async () => {
    svc = createClient(url, serviceKey, options);
    actor = createClient(url, anon, options);
    outsider = createClient(url, anon, options);
    const profile = await svc.from('profiles').select('id,company_id,role')
      .eq('email', process.env.RLS_USER_A_EMAIL ?? 'a@rls.test').single();
    if (profile.error || !profile.data) throw new Error(profile.error?.message ?? 'Actor fixture missing');
    actorId = profile.data.id;
    companyId = profile.data.company_id;
    oldRole = profile.data.role;
    const elevated = await svc.from('profiles').update({ role: 'company_admin' }).eq('id', actorId);
    if (elevated.error) throw elevated.error;
    const [loginA, loginB] = await Promise.all([
      actor.auth.signInWithPassword({ email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test', password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!' }),
      outsider.auth.signInWithPassword({ email: process.env.RLS_USER_B_EMAIL ?? 'b@rls.test', password: process.env.RLS_USER_B_PASSWORD ?? 'Test1234!' }),
    ]);
    if (loginA.error || loginB.error) throw new Error('Finance UAT actors could not sign in');

    for (const account of [
      { code: '1000', name: 'Cash and Bank', type: 'asset' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset' },
      { code: '2100', name: 'Accounts Payable', type: 'liability' },
      { code: '4100', name: 'Sales Revenue', type: 'revenue' },
    ]) {
      const existing = await svc.from('accounts').select('id').eq('company_id', companyId).eq('code', account.code).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        accounts.set(account.code, existing.data.id);
      } else {
        const created = await svc.from('accounts').insert({ company_id: companyId, ...account, is_system: true, is_active: true }).select('id').single();
        if (created.error || !created.data) throw new Error(created.error?.message ?? 'GL account fixture failed');
        createdAccountIds.push(created.data.id);
        accounts.set(account.code, created.data.id);
      }
    }
    for (const period of [
      { name: `Finance UAT Jan ${unique}`, period_year: 2024, period_month: 1, start_date: '2024-01-01', end_date: '2024-01-31' },
      { name: `Finance UAT Feb ${unique}`, period_year: 2024, period_month: 2, start_date: '2024-02-01', end_date: '2024-02-29' },
    ]) {
      const created = await svc.from('accounting_periods').insert({ company_id: companyId, ...period, status: 'open' }).select('id').single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? 'Period fixture failed');
      if (period.period_month === 1) januaryId = created.data.id;
      else februaryId = created.data.id;
    }
  });

  afterAll(async () => {
    if (!svc) return;
    if (journalIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', journalIds);
      await svc.from('journal_entries').delete().in('id', journalIds);
    }
    if (arEventIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', arEventIds);
      await svc.from('payment_events').delete().in('id', arEventIds);
    }
    if (apEventIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', apEventIds);
      await svc.from('supplier_payment_events').delete().in('id', apEventIds);
    }
    if (arInvoiceIds.length) await svc.from('invoices').delete().in('id', arInvoiceIds);
    if (orderIds.length) await svc.from('sales_orders').delete().in('id', orderIds);
    if (apInvoiceIds.length) await svc.from('purchase_invoices').delete().in('id', apInvoiceIds);
    if (januaryId) await svc.from('accounting_periods').delete().eq('id', januaryId);
    if (februaryId) await svc.from('accounting_periods').delete().eq('id', februaryId);
    if (marchId) await svc.from('accounting_periods').delete().eq('id', marchId);
    if (aprilId) await svc.from('accounting_periods').delete().eq('id', aprilId);
    if (createdAccountIds.length) await svc.from('accounts').delete().in('id', createdAccountIds);
    if (oldRole && actorId) await svc.from('profiles').update({ role: oldRole }).eq('id', actorId);
  });

  it('reconciles payment events, journals, close queue, and period-scoped reports', async () => {
    const arInvoiceId = await seedArInvoice();
    const apInvoiceId = await seedApInvoice();
    const ar = await actor.rpc('record_payment_event', {
      p_invoice_id: arInvoiceId, p_amount: 50_000, p_payment_date: paymentDate,
    });
    const ap = await actor.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: apInvoiceId, p_amount: 30_000, p_payment_date: paymentDate,
    });
    expect(ar.error).toBeNull();
    expect(ap.error).toBeNull();
    const arEventId = ar.data as string;
    const apEventId = ap.data as string;
    arEventIds.push(arEventId);
    apEventIds.push(apEventId);

    const before = await summary(januaryId);
    expect(before.unposted_ar_payment_count).toBe(1);
    expect(before.unposted_ap_payment_count).toBe(1);
    // This is the browser service's current close path. It must reject a
    // period with legitimate unposted settlement events.
    const prematureClose = await actor.from('accounting_periods')
      .update({ status: 'closed' }).eq('id', januaryId).select('status').single();
    expect(prematureClose.error).not.toBeNull();
    const stillOpen = await actor.from('accounting_periods')
      .select('status,closed_at,closed_by').eq('id', januaryId).single();
    expect(stillOpen.error).toBeNull();
    expect(stillOpen.data).toMatchObject({ status: 'open', closed_at: null, closed_by: null });
    const falseCloseAudit = await svc.from('audit_logs').select('id')
      .eq('entity_id', januaryId).eq('action', 'close');
    expect(falseCloseAudit.error).toBeNull();
    expect(falseCloseAudit.data).toEqual([]);
    const rejectedBoth = await actor.rpc('close_accounting_period', { p_period_id: januaryId });
    expect(rejectedBoth.error?.message).toContain('AR: 1, AP: 1');
    const unposted = await actor.rpc('get_period_close_unposted', { p_company_id: companyId, p_period_id: januaryId });
    expect(unposted.error).toBeNull();
    expect((unposted.data as Array<{ event_id: string }>).map(row => row.event_id)).toEqual(expect.arrayContaining([arEventId, apEventId]));

    const postedAr = await actor.rpc('post_ar_payment_to_gl', { p_payment_event_id: arEventId });
    expect(postedAr.error).toBeNull();
    journalIds.push(postedAr.data as string);
    const rejectedAp = await actor.rpc('close_accounting_period', { p_period_id: januaryId });
    expect(rejectedAp.error?.message).toContain('AR: 0, AP: 1');
    const postedAp = await actor.rpc('post_ap_payment_to_gl', { p_supplier_payment_event_id: apEventId });
    expect(postedAp.error).toBeNull();
    journalIds.push(postedAp.data as string);
    const after = await summary(januaryId);
    expect(after.unposted_ar_payment_count).toBe(0);
    expect(after.unposted_ap_payment_count).toBe(0);
    expect(after.journal_entry_count).toBe(2);
    expect(Number(after.total_debit)).toBe(80_000);
    expect(Number(after.total_credit)).toBe(80_000);
    const postedQueue = await actor.rpc('get_period_close_unposted', { p_company_id: companyId, p_period_id: januaryId });
    expect(postedQueue.error).toBeNull();
    expect((postedQueue.data as Array<{ event_id: string }>).some(row => [arEventId, apEventId].includes(row.event_id))).toBe(false);

    // A later-period revenue journal exposes report queries that accidentally
    // sum all lines before applying the journal period/date join.
    const later = await svc.from('journal_entries').insert({
      company_id: companyId, period_id: februaryId, entry_date: februaryDate,
      description: 'Later-period report cut-off fixture', source_type: 'manual', posted_by: actorId,
    }).select('id').single();
    if (later.error || !later.data) throw new Error(later.error?.message ?? 'Later journal failed');
    journalIds.push(later.data.id);
    const laterLines = await svc.from('journal_entry_lines').insert([
      { journal_entry_id: later.data.id, account_id: accounts.get('1000')!, debit: 7_000, credit: 0 },
      { journal_entry_id: later.data.id, account_id: accounts.get('4100')!, debit: 0, credit: 7_000 },
    ]);
    if (laterLines.error) throw laterLines.error;

    const january = await trialBalance(januaryId);
    expect(Number(january.get('1000')?.net_balance)).toBe(20_000);
    expect(Number(january.get('1100')?.net_balance)).toBe(-50_000);
    expect(Number(january.get('2100')?.net_balance)).toBe(30_000);
    expect(Number(january.get('4100')?.net_balance)).toBe(0);
    expect([...january.values()].reduce((sum, row) => sum + Number(row.total_debit), 0)).toBe(80_000);
    expect([...january.values()].reduce((sum, row) => sum + Number(row.total_credit), 0)).toBe(80_000);
    const february = await trialBalance(februaryId);
    expect(Number(february.get('1000')?.net_balance)).toBe(7_000);
    expect(Number(february.get('4100')?.net_balance)).toBe(-7_000);
    expect([...february.values()].reduce((sum, row) => sum + Number(row.total_debit), 0)).toBe(7_000);
    expect([...february.values()].reduce((sum, row) => sum + Number(row.total_credit), 0)).toBe(7_000);
    const profit = await actor.rpc('get_profit_loss', { p_company_id: companyId, p_period_id: januaryId });
    expect(profit.error).toBeNull();
    expect(Number((profit.data as Profit[]).find(row => row.account_code === '4100')?.amount)).toBe(0);
    const laterProfit = await actor.rpc('get_profit_loss', { p_company_id: companyId, p_period_id: februaryId });
    expect(laterProfit.error).toBeNull();
    expect(Number((laterProfit.data as Profit[]).find(row => row.account_code === '4100')?.amount)).toBe(7_000);
    const sheet = await actor.rpc('get_balance_sheet', { p_company_id: companyId, p_period_id: januaryId });
    expect(sheet.error).toBeNull();
    expect(Number((sheet.data as Sheet[]).find(row => row.account_code === '1000')?.balance)).toBe(20_000);
    expect(Number((sheet.data as Sheet[]).find(row => row.account_code === '9999')?.balance)).toBe(0);
    const laterSheet = await actor.rpc('get_balance_sheet', { p_company_id: companyId, p_period_id: februaryId });
    expect(laterSheet.error).toBeNull();
    expect(Number((laterSheet.data as Sheet[]).find(row => row.account_code === '1000')?.balance)).toBe(27_000);
    expect(Number((laterSheet.data as Sheet[]).find(row => row.account_code === '9999')?.balance)).toBe(7_000);

    const denied = await outsider.rpc('get_trial_balance', { p_company_id: companyId, p_period_id: januaryId });
    expect(denied.error?.message).toContain('Unauthorized');

    await seedArInvoice('AR-OPEN');
    const openInvoiceSummary = await summary(januaryId);
    expect(openInvoiceSummary.open_ar_invoice_count).toBeGreaterThan(0);
    const closed = await actor.rpc('close_accounting_period', { p_period_id: januaryId });
    expect(closed.error).toBeNull();
    expect(closed.data?.status).toBe('closed');
    expect(closed.data?.closed_at).toBeTruthy();
    expect(closed.data?.closed_by).toBe(actorId);
    const closeAudit = await svc.from('audit_logs').select('changes')
      .eq('entity_id', januaryId).eq('action', 'close');
    expect(closeAudit.error).toBeNull();
    expect(closeAudit.data).toHaveLength(1);
    expect(closeAudit.data?.[0].changes).toMatchObject({
      previous_status: 'open', new_status: 'closed', journal_count: 2,
      total_debit: 80_000, total_credit: 80_000,
      unposted_ar_count: 0, unposted_ap_count: 0,
    });
    const repeated = await actor.rpc('close_accounting_period', { p_period_id: januaryId });
    expect(repeated.error?.message).toContain('already closed');
    const auditAfterRepeat = await svc.from('audit_logs').select('id')
      .eq('entity_id', januaryId).eq('action', 'close');
    expect(auditAfterRepeat.data).toHaveLength(1);
    const directMutation = await actor.from('accounting_periods').update({ status: 'open' }).eq('id', januaryId);
    expect(directMutation.error).not.toBeNull();
    const closedSummary = await summary(januaryId);
    expect(closedSummary.period_status).toBe('closed');
    expect(closedSummary.unposted_ar_payment_count + closedSummary.unposted_ap_payment_count).toBe(0);
    expect(Number((await trialBalance(januaryId)).get('1000')?.net_balance)).toBe(20_000);
    const closedProfit = await actor.rpc('get_profit_loss', { p_company_id: companyId, p_period_id: januaryId });
    const closedSheet = await actor.rpc('get_balance_sheet', { p_company_id: companyId, p_period_id: januaryId });
    expect(Number((closedProfit.data as Profit[]).find(row => row.account_code === '4100')?.amount)).toBe(0);
    expect(Number((closedSheet.data as Sheet[]).find(row => row.account_code === '1000')?.balance)).toBe(20_000);

    // A later adjustment must leave the already-closed original period stable.
    const adjustment = await svc.from('journal_entries').insert({
      company_id: companyId, period_id: februaryId, entry_date: februaryDate,
      description: 'Later-period correction-scope fixture', source_type: 'adjustment',
      source_id: postedAr.data as string, posted_by: actorId,
    }).select('id').single();
    if (adjustment.error || !adjustment.data) throw new Error(adjustment.error?.message ?? 'Adjustment fixture failed');
    journalIds.push(adjustment.data.id);
    const adjustmentLines = await svc.from('journal_entry_lines').insert([
      { journal_entry_id: adjustment.data.id, account_id: accounts.get('1000')!, debit: 500, credit: 0 },
      { journal_entry_id: adjustment.data.id, account_id: accounts.get('4100')!, debit: 0, credit: 500 },
    ]);
    if (adjustmentLines.error) throw adjustmentLines.error;
    expect(Number((await trialBalance(januaryId)).get('1000')?.net_balance)).toBe(20_000);
    expect(Number((await trialBalance(februaryId)).get('1000')?.net_balance)).toBe(7_500);
    const adjustedProfit = await actor.rpc('get_profit_loss', { p_company_id: companyId, p_period_id: januaryId });
    const adjustedSheet = await actor.rpc('get_balance_sheet', { p_company_id: companyId, p_period_id: januaryId });
    expect(Number((adjustedProfit.data as Profit[]).find(row => row.account_code === '4100')?.amount)).toBe(0);
    expect(Number((adjustedSheet.data as Sheet[]).find(row => row.account_code === '1000')?.balance)).toBe(20_000);
    const locked = await actor.rpc('lock_accounting_period', { p_period_id: januaryId });
    expect(locked.error).toBeNull();
    expect(locked.data?.status).toBe('locked');
    const closeLocked = await actor.rpc('close_accounting_period', { p_period_id: januaryId });
    expect(closeLocked.error?.message).toContain('Only an open');
  });

  it('rejects backdated AR and AP settlement after a period is locked', async () => {
    const arInvoiceId = await seedArInvoice('AR-LATE');
    const apInvoiceId = await seedApInvoice('AP-LATE');
    const ar = await actor.rpc('record_payment_event', {
      p_invoice_id: arInvoiceId, p_amount: 100, p_payment_date: paymentDate,
    });
    const ap = await actor.rpc('record_supplier_payment_event', {
      p_purchase_invoice_id: apInvoiceId, p_amount: 100, p_payment_date: paymentDate,
    });
    expect(ar.error?.message).toContain('closed or locked accounting period');
    expect(ap.error?.message).toContain('closed or locked accounting period');
    const [arInvoice, apInvoice] = await Promise.all([
      svc.from('invoices').select('paid_amount').eq('id', arInvoiceId).single(),
      svc.from('purchase_invoices').select('paid_amount').eq('id', apInvoiceId).single(),
    ]);
    expect(Number(arInvoice.data?.paid_amount)).toBe(0);
    expect(Number(apInvoice.data?.paid_amount)).toBe(0);
  });

  it('rejects cross-company and unauthorized close attempts', async () => {
    const crossCompany = await outsider.rpc('close_accounting_period', { p_period_id: februaryId });
    expect(crossCompany.error?.message).toContain('not found or close not authorized');
    const otherProfile = await svc.from('profiles').select('id,role,access_scope')
      .eq('email', process.env.RLS_USER_B_EMAIL ?? 'b@rls.test').single();
    if (otherProfile.error || !otherProfile.data) throw new Error('Other-company actor fixture missing');
    const global = await svc.from('profiles').update({ role: 'super_admin', access_scope: 'global' })
      .eq('id', otherProfile.data.id);
    if (global.error) throw global.error;
    let otherRestoreError: Error | null = null;
    try {
      const deniedGlobal = await outsider.rpc('close_accounting_period', { p_period_id: februaryId });
      expect(deniedGlobal.error?.message).toContain('not found or close not authorized');
    } finally {
      const restored = await svc.from('profiles').update({
        role: otherProfile.data.role, access_scope: otherProfile.data.access_scope,
      }).eq('id', otherProfile.data.id);
      otherRestoreError = restored.error;
    }
    if (otherRestoreError) throw otherRestoreError;
    const demoted = await svc.from('profiles').update({ role: 'sales' }).eq('id', actorId);
    if (demoted.error) throw demoted.error;
    let restoreError: Error | null = null;
    try {
      const denied = await actor.rpc('close_accounting_period', { p_period_id: februaryId });
      expect(denied.error?.message).toContain('not found or close not authorized');
    } finally {
      const restored = await svc.from('profiles').update({ role: 'company_admin' }).eq('id', actorId);
      restoreError = restored.error;
    }
    if (restoreError) throw restoreError;
    const period = await actor.from('accounting_periods').select('status,closed_at,closed_by').eq('id', februaryId).single();
    expect(period.data).toMatchObject({ status: 'open', closed_at: null, closed_by: null });
  });

  it('serializes posting and close and preserves authenticated period creation', async () => {
    const forbiddenInsert = await actor.from('accounting_periods').insert({
      company_id: companyId, name: `Finance UAT Apr ${unique}`,
      period_year: 2024, period_month: 4,
      start_date: '2024-04-01', end_date: '2024-04-30', status: 'closed',
    });
    expect(forbiddenInsert.error).not.toBeNull();
    const created = await actor.from('accounting_periods').insert({
      company_id: companyId, name: `Finance UAT Mar ${unique}`,
      period_year: 2024, period_month: 3,
      start_date: '2024-03-01', end_date: '2024-03-31',
    }).select('id,status').single();
    expect(created.error).toBeNull();
    expect(created.data?.status).toBe('open');
    marchId = created.data!.id;
    const invoiceId = await seedArInvoice('AR-RACE');
    const payment = await actor.rpc('record_payment_event', {
      p_invoice_id: invoiceId, p_amount: 100, p_payment_date: '2024-03-15',
    });
    expect(payment.error).toBeNull();
    arEventIds.push(payment.data as string);

    const [posting, closing] = await Promise.all([
      actor.rpc('post_ar_payment_to_gl', { p_payment_event_id: payment.data as string }),
      actor.rpc('close_accounting_period', { p_period_id: marchId }),
    ]);
    expect(posting.error).toBeNull();
    journalIds.push(posting.data as string);
    const journal = await svc.from('journal_entries').select('id,period_id')
      .eq('id', posting.data as string).single();
    expect(journal.data?.period_id).toBe(marchId);
    const period = await actor.from('accounting_periods').select('status').eq('id', marchId).single();
    if (closing.error) {
      expect(closing.error.message).toContain('unposted payments');
      expect(period.data?.status).toBe('open');
      const retry = await actor.rpc('close_accounting_period', { p_period_id: marchId });
      expect(retry.error).toBeNull();
    } else {
      expect(period.data?.status).toBe('closed');
    }
    const final = await actor.from('accounting_periods').select('status').eq('id', marchId).single();
    expect(final.data?.status).toBe('closed');
  });

  it('serializes a new source settlement against close', async () => {
    const created = await actor.from('accounting_periods').insert({
      company_id: companyId, name: `Finance UAT Apr ${unique}`,
      period_year: 2024, period_month: 4,
      start_date: '2024-04-01', end_date: '2024-04-30',
    }).select('id').single();
    expect(created.error).toBeNull();
    aprilId = created.data!.id;
    const invoiceId = await seedArInvoice('AR-SOURCE-RACE');
    const [recording, closing] = await Promise.all([
      actor.rpc('record_payment_event', {
        p_invoice_id: invoiceId, p_amount: 100, p_payment_date: '2024-04-15',
      }),
      actor.rpc('close_accounting_period', { p_period_id: aprilId }),
    ]);
    const period = await actor.from('accounting_periods').select('status').eq('id', aprilId).single();
    if (recording.error) {
      expect(recording.error.message).toContain('closed or locked accounting period');
      expect(closing.error).toBeNull();
      expect(period.data?.status).toBe('closed');
    } else {
      arEventIds.push(recording.data as string);
      expect(closing.error?.message).toContain('unposted payments');
      expect(period.data?.status).toBe('open');
      const posted = await actor.rpc('post_ar_payment_to_gl', { p_payment_event_id: recording.data as string });
      expect(posted.error).toBeNull();
      journalIds.push(posted.data as string);
      const retry = await actor.rpc('close_accounting_period', { p_period_id: aprilId });
      expect(retry.error).toBeNull();
    }
  });

  it.runIf(!!process.env.RLS_DB_CONTAINER)('rejects a controlled legacy unbalanced journal', async () => {
    const journal = await svc.from('journal_entries').insert({
      company_id: companyId, period_id: februaryId, entry_date: februaryDate,
      description: 'Controlled local unbalanced fixture', source_type: 'manual', posted_by: actorId,
    }).select('id').single();
    if (journal.error || !journal.data) throw new Error(journal.error?.message ?? 'Journal fixture failed');
    journalIds.push(journal.data.id);
    const sql = `BEGIN; ALTER TABLE public.journal_entry_lines DISABLE TRIGGER trg_validate_je_balance; INSERT INTO public.journal_entry_lines (journal_entry_id,account_id,debit,credit) VALUES ('${journal.data.id}'::uuid,'${accounts.get('1000')}'::uuid,1,0); ALTER TABLE public.journal_entry_lines ENABLE TRIGGER trg_validate_je_balance; COMMIT;`;
    execFileSync('docker', ['exec', process.env.RLS_DB_CONTAINER!, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql]);
    const rejected = await actor.rpc('close_accounting_period', { p_period_id: februaryId });
    expect(rejected.error?.message).toContain('unbalanced');
    const period = await actor.from('accounting_periods').select('status,closed_at,closed_by').eq('id', februaryId).single();
    expect(period.data).toMatchObject({ status: 'open', closed_at: null, closed_by: null });
    const falseAudit = await svc.from('audit_logs').select('id').eq('entity_id', februaryId).eq('action', 'close');
    expect(falseAudit.data).toEqual([]);
  });
});
