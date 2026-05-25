import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  postArPaymentToGl,
  postApPaymentToGl,
  getTrialBalance,
  getProfitLoss,
  getBalanceSheet,
  listAccountingPeriods,
  createAccountingPeriod,
  closeAccountingPeriod,
  listAccounts,
  createGlAccount,
  listJournalEntries,
} from './glService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── postArPaymentToGl ─────────────────────────────────────────────────────────

describe('postArPaymentToGl', () => {
  it('calls post_ar_payment_to_gl RPC with payment event id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'je-uuid-1', error: null } as never);

    const result = await postArPaymentToGl('pe-uuid-1');

    expect(supabase.rpc).toHaveBeenCalledWith('post_ar_payment_to_gl', {
      p_payment_event_id: 'pe-uuid-1',
    });
    expect(result.data).toBe('je-uuid-1');
    expect(result.error).toBeNull();
  });

  it('returns an Error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'period not found' },
    } as never);

    const result = await postArPaymentToGl('pe-bad');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('period not found');
  });
});

// ── postApPaymentToGl ─────────────────────────────────────────────────────────

describe('postApPaymentToGl', () => {
  it('calls post_ap_payment_to_gl RPC with supplier payment event id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'je-uuid-2', error: null } as never);

    const result = await postApPaymentToGl('spe-uuid-1');

    expect(supabase.rpc).toHaveBeenCalledWith('post_ap_payment_to_gl', {
      p_supplier_payment_event_id: 'spe-uuid-1',
    });
    expect(result.data).toBe('je-uuid-2');
    expect(result.error).toBeNull();
  });

  it('returns an Error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'account not found' },
    } as never);

    const result = await postApPaymentToGl('spe-bad');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});

// ── getTrialBalance ───────────────────────────────────────────────────────────

describe('getTrialBalance', () => {
  it('calls get_trial_balance RPC and maps rows', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          account_id:   'acc-1',
          account_code: '1000',
          account_name: 'Cash and Bank',
          account_type: 'asset',
          total_debit:  100_000,
          total_credit: 20_000,
          net_balance:  80_000,
        },
      ],
      error: null,
    } as never);

    const result = await getTrialBalance('company-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_trial_balance', {
      p_company_id: 'company-1',
      p_period_id: null,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data![0]).toMatchObject({
      accountId:   'acc-1',
      accountCode: '1000',
      accountName: 'Cash and Bank',
      accountType: 'asset',
      totalDebit:  100_000,
      totalCredit: 20_000,
      netBalance:  80_000,
    });
  });

  it('passes periodId when provided', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    await getTrialBalance('company-1', 'period-uuid-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_trial_balance', {
      p_company_id: 'company-1',
      p_period_id: 'period-uuid-1',
    });
  });

  it('returns an Error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'access denied' },
    } as never);

    const result = await getTrialBalance('company-bad');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});

// ── getProfitLoss ─────────────────────────────────────────────────────────────

describe('getProfitLoss', () => {
  it('calls get_profit_loss RPC with company and period and maps rows', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          account_id:   'acc-rev-1',
          account_code: '4100',
          account_name: 'Sales Revenue',
          account_type: 'revenue',
          amount:       250_000,
        },
        {
          account_id:   'acc-exp-1',
          account_code: '5100',
          account_name: 'Cost of Goods Sold',
          account_type: 'expense',
          amount:       180_000,
        },
      ],
      error: null,
    } as never);

    const result = await getProfitLoss('company-1', 'period-uuid-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_profit_loss', {
      p_company_id: 'company-1',
      p_period_id:  'period-uuid-1',
    });
    expect(result.data).toHaveLength(2);
    expect(result.data![0]).toMatchObject({
      accountId:   'acc-rev-1',
      accountCode: '4100',
      accountName: 'Sales Revenue',
      accountType: 'revenue',
      amount:      250_000,
    });
    expect(result.data![1]).toMatchObject({
      accountType: 'expense',
      amount:      180_000,
    });
    expect(result.error).toBeNull();
  });

  it('returns an Error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'access denied' },
    } as never);

    const result = await getProfitLoss('company-bad', 'period-x');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('access denied');
  });

  it('returns empty array when no revenue or expense activity', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    const result = await getProfitLoss('company-1', 'period-uuid-1');

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });
});

// ── getBalanceSheet ───────────────────────────────────────────────────────────

describe('getBalanceSheet', () => {
  it('calls get_balance_sheet RPC and maps rows including the synthetic earnings row', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          account_id:   'acc-asset-1',
          account_code: '1000',
          account_name: 'Cash and Bank',
          account_type: 'asset',
          balance:      150_000,
        },
        {
          account_id:   'acc-liab-1',
          account_code: '2100',
          account_name: 'Accounts Payable',
          account_type: 'liability',
          balance:      40_000,
        },
        {
          account_id:   'acc-eq-1',
          account_code: '3100',
          account_name: 'Retained Earnings',
          account_type: 'equity',
          balance:      90_000,
        },
        {
          account_id:   null,
          account_code: '9999',
          account_name: 'Current Period Earnings (unclosed)',
          account_type: 'equity',
          balance:      20_000,
        },
      ],
      error: null,
    } as never);

    const result = await getBalanceSheet('company-1', 'period-uuid-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_balance_sheet', {
      p_company_id: 'company-1',
      p_period_id:  'period-uuid-1',
    });
    expect(result.data).toHaveLength(4);
    expect(result.data![0]).toMatchObject({
      accountId:   'acc-asset-1',
      accountCode: '1000',
      accountType: 'asset',
      balance:     150_000,
    });
    // Synthetic earnings row has null accountId
    expect(result.data![3]).toMatchObject({
      accountId:   null,
      accountCode: '9999',
      accountType: 'equity',
      balance:     20_000,
    });
    expect(result.error).toBeNull();
  });

  it('returns an Error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'period not found' },
    } as never);

    const result = await getBalanceSheet('company-1', 'bad-period');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('period not found');
  });

  it('handles negative balances (debit-balanced liability or asset overdraft)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          account_id:   'acc-asset-1',
          account_code: '1000',
          account_name: 'Cash and Bank',
          account_type: 'asset',
          balance:      -5_000,
        },
      ],
      error: null,
    } as never);

    const result = await getBalanceSheet('company-1', 'period-uuid-1');

    expect(result.data![0].balance).toBe(-5_000);
  });
});

// ── listAccountingPeriods ─────────────────────────────────────────────────────

describe('listAccountingPeriods', () => {
  it('queries accounting_periods table filtered by company', async () => {
    const chain = makeChain({
      order: vi.fn().mockReturnThis(),
    });
    (chain.order as ReturnType<typeof vi.fn>).mockImplementation(
      (_col: string, _opts: unknown) => ({ ...chain, then: (cb: (v: unknown) => unknown) => cb({ data: [], error: null }) }),
    );
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    // Let the second order() return the final promise
    let callCount = 0;
    (chain.order as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return Promise.resolve({ data: [], error: null });
      }
      return chain;
    });

    await listAccountingPeriods('company-1');

    expect(supabase.from).toHaveBeenCalledWith('accounting_periods');
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('maps returned rows correctly', async () => {
    const row = {
      id: 'period-1', company_id: 'co-1', name: 'Jan 2026',
      period_year: 2026, period_month: 1,
      start_date: '2026-01-01', end_date: '2026-01-31',
      status: 'open', closed_at: null, closed_by: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    const chain = makeChain();
    (chain.order as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(chain)
      .mockResolvedValueOnce({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listAccountingPeriods('co-1');

    expect(result.data).toHaveLength(1);
    expect(result.data![0]).toMatchObject({
      id: 'period-1',
      companyId: 'co-1',
      name: 'Jan 2026',
      periodYear: 2026,
      periodMonth: 1,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'open',
    });
  });
});

// ── createAccountingPeriod ────────────────────────────────────────────────────

describe('createAccountingPeriod', () => {
  it('inserts into accounting_periods with correct payload', async () => {
    const row = {
      id: 'period-new', company_id: 'co-1', name: 'Feb 2026',
      period_year: 2026, period_month: 2,
      start_date: '2026-02-01', end_date: '2026-02-28',
      status: 'open', closed_at: null, closed_by: null,
      created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
    };
    const chain = makeChain({
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await createAccountingPeriod('co-1', {
      name: 'Feb 2026',
      periodYear: 2026,
      periodMonth: 2,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    expect(supabase.from).toHaveBeenCalledWith('accounting_periods');
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      company_id:   'co-1',
      name:         'Feb 2026',
      period_year:  2026,
      period_month: 2,
    }));
    expect(result.data!.id).toBe('period-new');
    expect(result.error).toBeNull();
  });
});

// ── closeAccountingPeriod ─────────────────────────────────────────────────────

describe('closeAccountingPeriod', () => {
  it('updates status to closed', async () => {
    const row = {
      id: 'period-1', company_id: 'co-1', name: 'Jan 2026',
      period_year: 2026, period_month: 1,
      start_date: '2026-01-01', end_date: '2026-01-31',
      status: 'closed', closed_at: '2026-02-01T00:00:00Z', closed_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
    };
    const chain = makeChain({
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await closeAccountingPeriod('period-1');

    expect(chain.update).toHaveBeenCalledWith({ status: 'closed' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'period-1');
    expect(result.data!.status).toBe('closed');
  });
});

// ── listAccounts ──────────────────────────────────────────────────────────────

describe('listAccounts', () => {
  it('queries accounts table for active accounts sorted by code', async () => {
    const row = {
      id: 'acc-1', company_id: 'co-1', code: '1000', name: 'Cash and Bank',
      type: 'asset', is_system: true, description: null, is_active: true,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    const chain = makeChain({
      order: vi.fn().mockResolvedValue({ data: [row], error: null }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listAccounts('co-1');

    expect(supabase.from).toHaveBeenCalledWith('accounts');
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co-1');
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0]).toMatchObject({
      id: 'acc-1',
      code: '1000',
      name: 'Cash and Bank',
      type: 'asset',
      isSystem: true,
    });
  });
});

// ── createGlAccount ───────────────────────────────────────────────────────────

describe('createGlAccount', () => {
  it('inserts a new account row', async () => {
    const row = {
      id: 'acc-new', company_id: 'co-1', code: '6000', name: 'Travel Expenses',
      type: 'expense', is_system: false, description: 'T&E', is_active: true,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    const chain = makeChain({
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await createGlAccount('co-1', {
      code: '6000',
      name: 'Travel Expenses',
      type: 'expense',
      description: 'T&E',
    });

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      company_id: 'co-1',
      code: '6000',
      name: 'Travel Expenses',
      type: 'expense',
    }));
    expect(result.data!.id).toBe('acc-new');
    expect(result.error).toBeNull();
  });
});

// ── listJournalEntries ────────────────────────────────────────────────────────

describe('listJournalEntries', () => {
  it('queries journal_entries with lines for a company', async () => {
    const row = {
      id: 'je-1', company_id: 'co-1', period_id: 'period-1',
      entry_date: '2026-01-15', description: 'AR Payment',
      source_type: 'ar_payment', source_id: 'pe-uuid-1',
      reference_no: null, posted_by: 'user-1', posted_at: '2026-01-15T10:00:00Z',
      created_at: '2026-01-15T10:00:00Z',
      journal_entry_lines: [
        { id: 'jel-1', journal_entry_id: 'je-1', account_id: 'acc-1', debit: 1000, credit: 0, created_at: '2026-01-15T10:00:00Z' },
        { id: 'jel-2', journal_entry_id: 'je-1', account_id: 'acc-2', debit: 0, credit: 1000, created_at: '2026-01-15T10:00:00Z' },
      ],
    };
    const chain = makeChain({
      order: vi.fn().mockResolvedValue({ data: [row], error: null }),
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listJournalEntries('co-1');

    expect(supabase.from).toHaveBeenCalledWith('journal_entries');
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co-1');
    expect(result.data).toHaveLength(1);
    expect(result.data![0].lines).toHaveLength(2);
    expect(result.data![0].lines![0]).toMatchObject({ debit: 1000, credit: 0 });
  });
});
