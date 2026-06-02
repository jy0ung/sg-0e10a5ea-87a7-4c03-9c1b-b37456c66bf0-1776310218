import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runLeaveBalanceRollover } from './rolloverService';
import { supabase } from '../shared/supabaseClient';

vi.mock('../shared/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('runLeaveBalanceRollover', () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it('invokes the rollover edge function with normalized payload keys', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: null } as never);

    await runLeaveBalanceRollover({
      companyId: 'company-1',
      fromYear: 2025,
      toYear: 2026,
      maxCarryDays: 14,
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('rollover-leave-balances', {
      body: {
        company_id: 'company-1',
        from_year: 2025,
        to_year: 2026,
        max_carry_days: 14,
      },
    });
  });

  it('throws edge function errors for the caller to present', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error('rollover failed'),
    } as never);

    await expect(runLeaveBalanceRollover({
      companyId: 'company-1',
      fromYear: 2025,
      toYear: 2026,
      maxCarryDays: 14,
    })).rejects.toThrow('rollover failed');
  });
});
