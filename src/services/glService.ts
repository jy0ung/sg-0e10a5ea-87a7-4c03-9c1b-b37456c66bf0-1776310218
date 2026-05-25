import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  BalanceSheetRow,
  CashPositionRow,
  GlAccount,
  GlAccountType,
  AccountingPeriod,
  AccountingPeriodStatus,
  JournalEntry,
  JournalEntryLine,
  JournalEntrySourceType,
  PeriodCloseSummary,
  PeriodCloseUnpostedRow,
  ProfitLossRow,
  TrialBalanceRow,
  CreateAccountingPeriodInput,
  CreateGlAccountInput,
} from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAccount(row: Record<string, unknown>): GlAccount {
  return {
    id:          String(row.id ?? ''),
    companyId:   String(row.company_id ?? ''),
    code:        String(row.code ?? ''),
    name:        String(row.name ?? ''),
    type:        (row.type as GlAccountType) ?? 'asset',
    isSystem:    Boolean(row.is_system),
    description: row.description ? String(row.description) : undefined,
    isActive:    Boolean(row.is_active),
    createdAt:   String(row.created_at ?? ''),
    updatedAt:   String(row.updated_at ?? ''),
  };
}

function mapPeriod(row: Record<string, unknown>): AccountingPeriod {
  return {
    id:          String(row.id ?? ''),
    companyId:   String(row.company_id ?? ''),
    name:        String(row.name ?? ''),
    periodYear:  Number(row.period_year ?? 0),
    periodMonth: Number(row.period_month ?? 0),
    startDate:   String(row.start_date ?? ''),
    endDate:     String(row.end_date ?? ''),
    status:      (row.status as AccountingPeriodStatus) ?? 'open',
    closedAt:    row.closed_at ? String(row.closed_at) : undefined,
    closedBy:    row.closed_by ? String(row.closed_by) : undefined,
    createdAt:   String(row.created_at ?? ''),
    updatedAt:   String(row.updated_at ?? ''),
  };
}

function mapJournalEntry(row: Record<string, unknown>): JournalEntry {
  return {
    id:          String(row.id ?? ''),
    companyId:   String(row.company_id ?? ''),
    periodId:    String(row.period_id ?? ''),
    entryDate:   String(row.entry_date ?? ''),
    description: String(row.description ?? ''),
    sourceType:  (row.source_type as JournalEntrySourceType) ?? 'manual',
    sourceId:    row.source_id ? String(row.source_id) : undefined,
    referenceNo: row.reference_no ? String(row.reference_no) : undefined,
    postedBy:    row.posted_by ? String(row.posted_by) : undefined,
    postedAt:    String(row.posted_at ?? ''),
    createdAt:   String(row.created_at ?? ''),
  };
}

function mapJournalEntryLine(row: Record<string, unknown>): JournalEntryLine {
  return {
    id:             String(row.id ?? ''),
    journalEntryId: String(row.journal_entry_id ?? ''),
    accountId:      String(row.account_id ?? ''),
    accountCode:    row.account_code ? String(row.account_code) : undefined,
    accountName:    row.account_name ? String(row.account_name) : undefined,
    description:    row.description ? String(row.description) : undefined,
    debit:          Number(row.debit ?? 0),
    credit:         Number(row.credit ?? 0),
    createdAt:      String(row.created_at ?? ''),
  };
}

function mapProfitLossRow(row: Record<string, unknown>): ProfitLossRow {
  return {
    accountId:   String(row.account_id ?? ''),
    accountCode: String(row.account_code ?? ''),
    accountName: String(row.account_name ?? ''),
    accountType: (row.account_type as ProfitLossRow['accountType']) ?? 'revenue',
    amount:      Number(row.amount ?? 0),
  };
}

function mapBalanceSheetRow(row: Record<string, unknown>): BalanceSheetRow {
  return {
    accountId:   row.account_id ? String(row.account_id) : null,
    accountCode: String(row.account_code ?? ''),
    accountName: String(row.account_name ?? ''),
    accountType: (row.account_type as BalanceSheetRow['accountType']) ?? 'asset',
    balance:     Number(row.balance ?? 0),
  };
}

function mapCashPositionRow(row: Record<string, unknown>): CashPositionRow {
  return {
    positionDate:   String(row.position_date ?? ''),
    dailyDebit:     Number(row.daily_debit ?? 0),
    dailyCredit:    Number(row.daily_credit ?? 0),
    dailyNet:       Number(row.daily_net ?? 0),
    runningBalance: Number(row.running_balance ?? 0),
  };
}

function mapPeriodCloseSummary(row: Record<string, unknown>): PeriodCloseSummary {
  return {
    periodStatus:             (row.period_status as AccountingPeriodStatus) ?? 'open',
    periodStartDate:          String(row.period_start_date ?? ''),
    periodEndDate:            String(row.period_end_date ?? ''),
    journalEntryCount:        Number(row.journal_entry_count ?? 0),
    totalDebit:               Number(row.total_debit ?? 0),
    totalCredit:              Number(row.total_credit ?? 0),
    unpostedArPaymentCount:   Number(row.unposted_ar_payment_count ?? 0),
    unpostedArPaymentAmount:  Number(row.unposted_ar_payment_amount ?? 0),
    unpostedApPaymentCount:   Number(row.unposted_ap_payment_count ?? 0),
    unpostedApPaymentAmount:  Number(row.unposted_ap_payment_amount ?? 0),
    openArInvoiceCount:       Number(row.open_ar_invoice_count ?? 0),
    openArInvoiceOutstanding: Number(row.open_ar_invoice_outstanding ?? 0),
    openApInvoiceCount:       Number(row.open_ap_invoice_count ?? 0),
    openApInvoiceOutstanding: Number(row.open_ap_invoice_outstanding ?? 0),
  };
}

function mapPeriodCloseUnpostedRow(row: Record<string, unknown>): PeriodCloseUnpostedRow {
  return {
    kind:        (row.kind as PeriodCloseUnpostedRow['kind']) ?? 'ar_payment',
    eventId:     String(row.event_id ?? ''),
    documentId:  String(row.document_id ?? ''),
    paymentDate: String(row.payment_date ?? ''),
    amount:      Number(row.amount ?? 0),
    reference:   row.reference ? String(row.reference) : null,
  };
}

function mapTrialBalanceRow(row: Record<string, unknown>): TrialBalanceRow {
  return {
    accountId:    String(row.account_id ?? ''),
    accountCode:  String(row.account_code ?? ''),
    accountName:  String(row.account_name ?? ''),
    accountType:  (row.account_type as GlAccountType) ?? 'asset',
    totalDebit:   Number(row.total_debit ?? 0),
    totalCredit:  Number(row.total_credit ?? 0),
    netBalance:   Number(row.net_balance ?? 0),
  };
}

// ── Posting RPCs ──────────────────────────────────────────────────────────────

/**
 * Post an AR payment event to the GL (DR Cash / CR Accounts Receivable).
 * Idempotent — returns the existing journal_entry id if already posted.
 */
export async function postArPaymentToGl(
  paymentEventId: string,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('post_ar_payment_to_gl', {
    p_payment_event_id: paymentEventId,
  });
  if (error) {
    loggingService.error('postArPaymentToGl failed', { paymentEventId , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}

/**
 * Post an AP supplier payment event to the GL (DR Accounts Payable / CR Cash).
 * Idempotent — returns the existing journal_entry id if already posted.
 */
export async function postApPaymentToGl(
  supplierPaymentEventId: string,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('post_ap_payment_to_gl', {
    p_supplier_payment_event_id: supplierPaymentEventId,
  });
  if (error) {
    loggingService.error('postApPaymentToGl failed', { supplierPaymentEventId , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}

// ── Trial Balance ─────────────────────────────────────────────────────────────

/**
 * Fetch the trial balance for a company and optional accounting period.
 * Returns one row per active account showing total debits, credits, and net balance.
 */
export async function getTrialBalance(
  companyId: string,
  periodId?: string,
): Promise<{ data: TrialBalanceRow[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_trial_balance', {
    p_company_id: companyId,
    p_period_id: periodId ?? null,
  });
  if (error) {
    loggingService.error('getTrialBalance failed', { companyId, periodId , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapTrialBalanceRow),
    error: null,
  };
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────

/**
 * Fetch the Profit & Loss report for a company and accounting period.
 * Returns one row per active revenue/expense account; `amount` is the natural
 * P&L impact (credit-net for revenue, debit-net for expense). Net income is
 * computed client-side as sum(revenue) - sum(expense).
 */
export async function getProfitLoss(
  companyId: string,
  periodId: string,
): Promise<{ data: ProfitLossRow[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_profit_loss', {
    p_company_id: companyId,
    p_period_id: periodId,
  });
  if (error) {
    loggingService.error('getProfitLoss failed', { companyId, periodId, error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapProfitLossRow),
    error: null,
  };
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────

/**
 * Fetch the Balance Sheet snapshot as of the selected period's end_date.
 * Returns asset/liability/equity rows with cumulative balances, plus one
 * synthetic equity row carrying the period's unclosed net income so the
 * sheet balances before period close.
 */
export async function getBalanceSheet(
  companyId: string,
  periodId: string,
): Promise<{ data: BalanceSheetRow[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_balance_sheet', {
    p_company_id: companyId,
    p_period_id: periodId,
  });
  if (error) {
    loggingService.error('getBalanceSheet failed', { companyId, periodId, error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapBalanceSheetRow),
    error: null,
  };
}

// ── Cash Position ─────────────────────────────────────────────────────────────

/**
 * Fetch the daily cash position series over a date range. Returns a dense
 * series — every day in [fromDate, toDate] is included even with zero
 * activity — so consumers can render flat segments rather than gaps.
 */
export async function getCashPosition(
  companyId: string,
  fromDate: string,
  toDate: string,
): Promise<{ data: CashPositionRow[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_cash_position', {
    p_company_id: companyId,
    p_from_date:  fromDate,
    p_to_date:    toDate,
  });
  if (error) {
    loggingService.error('getCashPosition failed', { companyId, fromDate, toDate, error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapCashPositionRow),
    error: null,
  };
}

// ── Period Close Drilldown ────────────────────────────────────────────────────

/**
 * Fetch the period-close readiness summary: counts and amounts of GL postings,
 * unposted source payments (the gaps), and open invoices with due dates in
 * the period. Returns null when the period exists but the company has no
 * activity — never throws on empty.
 */
export async function getPeriodCloseSummary(
  companyId: string,
  periodId: string,
): Promise<{ data: PeriodCloseSummary | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_period_close_summary', {
    p_company_id: companyId,
    p_period_id:  periodId,
  });
  if (error) {
    loggingService.error('getPeriodCloseSummary failed', { companyId, periodId, error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  const rows = data as Record<string, unknown>[] | null;
  if (!rows || rows.length === 0) return { data: null, error: null };
  return { data: mapPeriodCloseSummary(rows[0]), error: null };
}

/**
 * Drilldown list of unposted AR/AP payment events for the period — the
 * actual rows behind unposted_*_payment_count on the summary.
 */
export async function getPeriodCloseUnposted(
  companyId: string,
  periodId: string,
): Promise<{ data: PeriodCloseUnpostedRow[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_period_close_unposted', {
    p_company_id: companyId,
    p_period_id:  periodId,
  });
  if (error) {
    loggingService.error('getPeriodCloseUnposted failed', { companyId, periodId, error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapPeriodCloseUnpostedRow),
    error: null,
  };
}

// ── Accounting Periods ────────────────────────────────────────────────────────

export async function listAccountingPeriods(
  companyId: string,
): Promise<{ data: AccountingPeriod[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('accounting_periods')
    .select('*')
    .eq('company_id', companyId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (error) {
    loggingService.error('listAccountingPeriods failed', { companyId , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapPeriod),
    error: null,
  };
}

export async function createAccountingPeriod(
  companyId: string,
  input: CreateAccountingPeriodInput,
): Promise<{ data: AccountingPeriod | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('accounting_periods')
    .insert({
      company_id:   companyId,
      name:         input.name,
      period_year:  input.periodYear,
      period_month: input.periodMonth,
      start_date:   input.startDate,
      end_date:     input.endDate,
    })
    .select()
    .single();
  if (error) {
    loggingService.error('createAccountingPeriod failed', { companyId, input , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: mapPeriod(data as Record<string, unknown>), error: null };
}

export async function closeAccountingPeriod(
  periodId: string,
): Promise<{ data: AccountingPeriod | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('accounting_periods')
    .update({ status: 'closed' })
    .eq('id', periodId)
    .select()
    .single();
  if (error) {
    loggingService.error('closeAccountingPeriod failed', { periodId , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: mapPeriod(data as Record<string, unknown>), error: null };
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function listAccounts(
  companyId: string,
): Promise<{ data: GlAccount[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('code');
  if (error) {
    loggingService.error('listAccounts failed', { companyId , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapAccount),
    error: null,
  };
}

export async function createGlAccount(
  companyId: string,
  input: CreateGlAccountInput,
): Promise<{ data: GlAccount | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      company_id:  companyId,
      code:        input.code,
      name:        input.name,
      type:        input.type,
      description: input.description,
    })
    .select()
    .single();
  if (error) {
    loggingService.error('createGlAccount failed', { companyId, input , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: mapAccount(data as Record<string, unknown>), error: null };
}

// ── Journal Entries ───────────────────────────────────────────────────────────

export async function listJournalEntries(
  companyId: string,
  periodId?: string,
): Promise<{ data: JournalEntry[] | null; error: Error | null }> {
  let query = supabase
    .from('journal_entries')
    .select('*, journal_entry_lines(*)')
    .eq('company_id', companyId)
    .order('entry_date', { ascending: false });
  if (periodId) {
    query = query.eq('period_id', periodId);
  }
  const { data, error } = await query;
  if (error) {
    loggingService.error('listJournalEntries failed', { companyId, periodId , error }, 'glService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(row => ({
      ...mapJournalEntry(row),
      lines: Array.isArray(row.journal_entry_lines)
        ? (row.journal_entry_lines as Record<string, unknown>[]).map(mapJournalEntryLine)
        : [],
    })),
    error: null,
  };
}
