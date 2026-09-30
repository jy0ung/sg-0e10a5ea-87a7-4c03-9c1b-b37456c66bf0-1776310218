import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

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

async function seedArInvoice(): Promise<string> {
  const order = await svc.from('sales_orders').insert({
    company_id: companyId, order_no: `AR-UAT-${unique}`,
    salesman_name: 'Finance UAT', branch_code: 'KK', model: 'X50', booking_date: '2024-01-05',
  }).select('id').single();
  if (order.error || !order.data) throw new Error(order.error?.message ?? 'Sales order fixture failed');
  orderIds.push(order.data.id);
  const invoice = await svc.from('invoices').insert({
    company_id: companyId, sales_order_id: order.data.id, invoice_no: `AR-UAT-${unique}`,
    invoice_date: '2024-01-05', due_date: '2024-01-31', amount: 50_000, total_amount: 50_000,
  }).select('id').single();
  if (invoice.error || !invoice.data) throw new Error(invoice.error?.message ?? 'AR invoice fixture failed');
  arInvoiceIds.push(invoice.data.id);
  return invoice.data.id;
}

async function seedApInvoice(): Promise<string> {
  const invoice = await svc.from('purchase_invoices').insert({
    company_id: companyId, invoice_no: `AP-UAT-${unique}`,
    supplier: 'Finance UAT Supplier', chassis_no: `UAT${unique}`,
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
    const unposted = await actor.rpc('get_period_close_unposted', { p_company_id: companyId, p_period_id: januaryId });
    expect(unposted.error).toBeNull();
    expect((unposted.data as Array<{ event_id: string }>).map(row => row.event_id)).toEqual(expect.arrayContaining([arEventId, apEventId]));

    const postedAr = await actor.rpc('post_ar_payment_to_gl', { p_payment_event_id: arEventId });
    const postedAp = await actor.rpc('post_ap_payment_to_gl', { p_supplier_payment_event_id: apEventId });
    expect(postedAr.error).toBeNull();
    expect(postedAp.error).toBeNull();
    journalIds.push(postedAr.data as string, postedAp.data as string);
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

    const closed = await actor.from('accounting_periods').update({ status: 'closed' })
      .eq('id', januaryId).select('status').single();
    expect(closed.error).toBeNull();
    expect(closed.data?.status).toBe('closed');
    const closedSummary = await summary(januaryId);
    expect(closedSummary.period_status).toBe('closed');
    expect(closedSummary.unposted_ar_payment_count + closedSummary.unposted_ap_payment_count).toBe(0);
    expect(Number((await trialBalance(januaryId)).get('1000')?.net_balance)).toBe(20_000);
  });
});
