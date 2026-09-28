import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };
const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let svc: SupabaseClient;
let finance: SupabaseClient;
let outsider: SupabaseClient;
let actorId = '';
let oldRole = '';
let companyId = '';
let periodId = '';
const accountIds: string[] = [];
const orderIds: string[] = [];
const invoiceIds: string[] = [];
const eventIds: string[] = [];
const journalIds: string[] = [];

async function seedInvoice(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: order, error: orderError } = await svc.from('sales_orders').insert({
    company_id: companyId, order_no: `AR-POST-${unique}-${orderIds.length}`,
    salesman_name: 'Finance Test', branch_code: 'KK', model: 'X50', booking_date: today,
  }).select('id').single();
  if (orderError || !order) throw new Error(orderError?.message ?? 'Sales order failed');
  orderIds.push(order.id);
  const { data: invoice, error: invoiceError } = await svc.from('invoices').insert({
    company_id: companyId, sales_order_id: order.id,
    invoice_no: `AR-POST-${unique}-${invoiceIds.length}`,
    invoice_date: today, amount: 50_000, total_amount: 50_000,
  }).select('id').single();
  if (invoiceError || !invoice) throw new Error(invoiceError?.message ?? 'AR invoice failed');
  invoiceIds.push(invoice.id);
  return invoice.id;
}

live('Finance AR posting', () => {
  beforeAll(async () => {
    svc = createClient(url, serviceKey, options);
    const { data: profile, error: profileError } = await svc.from('profiles')
      .select('id,company_id,role').eq('email', process.env.RLS_USER_A_EMAIL ?? 'a@rls.test').single();
    if (profileError || !profile) throw new Error(profileError?.message ?? 'Actor profile failed');
    actorId = profile.id;
    companyId = profile.company_id;
    oldRole = profile.role;
    const elevated = await svc.from('profiles').update({ role: 'company_admin' }).eq('id', actorId);
    if (elevated.error) throw new Error(elevated.error.message);
    finance = createClient(url, anon, options);
    outsider = createClient(url, anon, options);
    const loginA = await finance.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    });
    const loginB = await outsider.auth.signInWithPassword({
      email: process.env.RLS_USER_B_EMAIL ?? 'b@rls.test',
      password: process.env.RLS_USER_B_PASSWORD ?? 'Test1234!',
    });
    if (loginA.error || loginB.error) throw new Error('Sign-in failed');

    for (const account of [
      { code: '1100', name: 'Accounts Receivable', type: 'asset' },
      { code: '1000', name: 'Cash and Bank', type: 'asset' },
    ]) {
      const { data: existing } = await svc.from('accounts').select('id')
        .eq('company_id', companyId).eq('code', account.code).maybeSingle();
      if (!existing) {
        const { data: created, error } = await svc.from('accounts').insert({
          company_id: companyId, ...account, is_system: true, is_active: true,
        }).select('id').single();
        if (error || !created) throw new Error(error?.message ?? 'Account insert failed');
        accountIds.push(created.id);
      }
    }
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const { data: period, error: periodError } = await svc.from('accounting_periods').insert({
      company_id: companyId, name: `AR Posting ${unique}`,
      period_year: now.getUTCFullYear(), period_month: now.getUTCMonth() + 1,
      start_date: start, end_date: end, status: 'open',
    }).select('id').single();
    if (periodError || !period) throw new Error(periodError?.message ?? 'Period insert failed');
    periodId = period.id;
  });

  afterAll(async () => {
    if (journalIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', journalIds);
      await svc.from('journal_entries').delete().in('id', journalIds);
    }
    if (eventIds.length) {
      await svc.from('audit_logs').delete().in('entity_id', eventIds);
      await svc.from('payment_events').delete().in('id', eventIds);
    }
    if (invoiceIds.length) await svc.from('invoices').delete().in('id', invoiceIds);
    if (orderIds.length) await svc.from('sales_orders').delete().in('id', orderIds);
    if (periodId) await svc.from('accounting_periods').delete().eq('id', periodId);
    if (accountIds.length) await svc.from('accounts').delete().in('id', accountIds);
    if (oldRole && actorId) await svc.from('profiles').update({ role: oldRole }).eq('id', actorId);
  });

  it('posts once with balanced Cash/AR lines and rejects posted reversal', async () => {
    const invoiceId = await seedInvoice();
    const payment = await finance.rpc('record_payment_event', {
      p_invoice_id: invoiceId, p_amount: 50_000,
      p_payment_date: new Date().toISOString().slice(0, 10),
    });
    expect(payment.error).toBeNull();
    const eventId = payment.data as string;
    eventIds.push(eventId);

    const denied = await outsider.rpc('post_ar_payment_to_gl', { p_payment_event_id: eventId });
    expect(denied.error?.message).toContain('Not authorized');
    const before = await finance.rpc('get_period_close_unposted', {
      p_company_id: companyId, p_period_id: periodId,
    });
    expect((before.data as Array<{ event_id: string }>).some(row => row.event_id === eventId)).toBe(true);
    const posted = await finance.rpc('post_ar_payment_to_gl', { p_payment_event_id: eventId });
    expect(posted.error).toBeNull();
    const journalId = posted.data as string;
    journalIds.push(journalId);
    const replay = await finance.rpc('post_ar_payment_to_gl', { p_payment_event_id: eventId });
    expect(replay.data).toBe(journalId);
    const { data: lines } = await svc.from('journal_entry_lines')
      .select('debit,credit').eq('journal_entry_id', journalId);
    expect(lines).toHaveLength(2);
    expect(lines?.reduce((sum, row) => sum + Number(row.debit), 0)).toBe(50_000);
    expect(lines?.reduce((sum, row) => sum + Number(row.credit), 0)).toBe(50_000);
    const reversal = await finance.rpc('reverse_payment_event', { p_event_id: eventId });
    expect(reversal.error?.message).toContain('Finance correction');
    const after = await finance.rpc('get_period_close_unposted', {
      p_company_id: companyId, p_period_id: periodId,
    });
    expect((after.data as Array<{ event_id: string }>).some(row => row.event_id === eventId)).toBe(false);
  });

  it('excludes a reversed unposted AR event from the close queue', async () => {
    const invoiceId = await seedInvoice();
    const payment = await finance.rpc('record_payment_event', {
      p_invoice_id: invoiceId, p_amount: 10_000,
      p_payment_date: new Date().toISOString().slice(0, 10),
    });
    expect(payment.error).toBeNull();
    const eventId = payment.data as string;
    eventIds.push(eventId);
    const reversed = await finance.rpc('reverse_payment_event', { p_event_id: eventId });
    expect(reversed.error).toBeNull();
    eventIds.push(reversed.data as string);
    const posting = await finance.rpc('post_ar_payment_to_gl', { p_payment_event_id: eventId });
    expect(posting.error?.message).toContain('Reversed customer payment');
    const unposted = await finance.rpc('get_period_close_unposted', {
      p_company_id: companyId, p_period_id: periodId,
    });
    expect((unposted.data as Array<{ event_id: string }>).some(row => row.event_id === eventId)).toBe(false);
    const summary = await finance.rpc('get_period_close_summary', {
      p_company_id: companyId, p_period_id: periodId,
    });
    expect(summary.error).toBeNull();
    expect((summary.data as Array<{ unposted_ar_payment_count: number }>)[0]?.unposted_ar_payment_count).toBe(0);
  });

  it('guards Accounts settlement, outstanding balance, and computed invoice state', async () => {
    const invoiceId = await seedInvoice();
    const today = new Date().toISOString().slice(0, 10);
    const forged = await finance.from('invoices').update({ paid_amount: 1, payment_status: 'partial' }).eq('id', invoiceId);
    expect(forged.error?.message).toContain('domain commands');
    const changedRole = await svc.from('profiles').update({ role: 'manager' }).eq('id', actorId);
    expect(changedRole.error).toBeNull();
    try {
      const denied = await finance.rpc('record_payment_event', {
        p_invoice_id: invoiceId, p_amount: 1, p_payment_date: today,
      });
      expect(denied.error?.message).toContain('Not authorized');
    } finally {
      const restored = await svc.from('profiles').update({ role: 'company_admin' }).eq('id', actorId);
      expect(restored.error).toBeNull();
    }
    const overpay = await finance.rpc('record_payment_event', {
      p_invoice_id: invoiceId, p_amount: 50_001, p_payment_date: today,
    });
    expect(overpay.error?.message).toContain('outstanding balance');
    const future = await finance.rpc('record_payment_event', {
      p_invoice_id: invoiceId, p_amount: 1, p_payment_date: '2999-01-01',
    });
    expect(future.error?.message).toContain('future');
    const payment = await finance.rpc('record_payment_event', {
      p_invoice_id: invoiceId, p_amount: 40_000, p_payment_date: today,
    });
    expect(payment.error).toBeNull();
    eventIds.push(payment.data as string);
    const concurrentBalance = await finance.rpc('record_payment_event', {
      p_invoice_id: invoiceId, p_amount: 20_000, p_payment_date: today,
    });
    expect(concurrentBalance.error?.message).toContain('outstanding balance');
    const altered = await finance.from('invoices').update({ total_amount: 1 }).eq('id', invoiceId);
    expect(altered.error?.message).toContain('domain commands');
    const reversal = await finance.rpc('reverse_payment_event', { p_event_id: payment.data });
    expect(reversal.error).toBeNull();
    eventIds.push(reversal.data as string);
    const duplicate = await finance.rpc('reverse_payment_event', { p_event_id: payment.data });
    expect(duplicate.error?.message).toContain('already reversed');
    const { data: invoice } = await svc.from('invoices').select('paid_amount,payment_status').eq('id', invoiceId).single();
    expect(Number(invoice?.paid_amount)).toBe(0);
    expect(invoice?.payment_status).toBe('unpaid');
  });

  it('serializes simultaneous payments against one invoice balance', async () => {
    const invoiceId = await seedInvoice();
    const args = { p_invoice_id: invoiceId, p_amount: 30_000, p_payment_date: new Date().toISOString().slice(0, 10) };
    const attempts = await Promise.all([
      finance.rpc('record_payment_event', args),
      finance.rpc('record_payment_event', args),
    ]);
    const successes = attempts.filter(result => !result.error);
    expect(successes).toHaveLength(1);
    expect(attempts.filter(result => result.error?.message.includes('outstanding balance'))).toHaveLength(1);
    eventIds.push(successes[0].data as string);
    const { data: invoice } = await svc.from('invoices').select('paid_amount').eq('id', invoiceId).single();
    expect(Number(invoice?.paid_amount)).toBe(30_000);
  });
});
