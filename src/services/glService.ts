import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  GlAccount,
  GlAccountType,
  AccountingPeriod,
  AccountingPeriodStatus,
  JournalEntry,
  JournalEntryLine,
  JournalEntrySourceType,
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

export async function lockAccountingPeriod(
  periodId: string,
): Promise<{ data: AccountingPeriod | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('accounting_periods')
    .update({ status: 'locked' })
    .eq('id', periodId)
    .select()
    .single();
  if (error) {
    loggingService.error('lockAccountingPeriod failed', { periodId, error }, 'glService');
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
