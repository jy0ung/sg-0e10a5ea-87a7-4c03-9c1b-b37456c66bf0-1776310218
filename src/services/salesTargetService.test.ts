import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { computeSalesmanActuals, deleteSalesmanTarget, upsertSalesmanTarget } from './salesTargetService';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('./auditService', () => ({ logUserAction: vi.fn() }));
vi.mock('./loggingService', () => ({ loggingService: { error: vi.fn() } }));
vi.mock('./performanceService', () => ({ performanceService: { startQueryTimer: vi.fn(), endQueryTimer: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('Sales target identity caller', () => {
  it('preserves Employee keys and keeps unresolved legacy targets out of achievement calculations', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [
      { identity_key: 'employee:a', employee_id: 'a', salesman_name: 'Same', branch_code: 'A', total_deals: 2, closed_deals: 1, total_revenue: 100, target_units: 4, target_revenue: 200 },
      { identity_key: 'target:b', employee_id: null, salesman_name: 'Same', branch_code: 'A', total_deals: 0, closed_deals: 0, total_revenue: 0, target_units: 4, target_revenue: 200 },
    ], error: null } as never);
    const result = await computeSalesmanActuals('tenant', 2026, 2);
    expect(supabase.rpc).toHaveBeenCalledWith('salesman_actuals', { p_company_id: 'tenant', p_year: 2026, p_month: 2 });
    expect(result.data[0]).toMatchObject({ employeeId: 'a', identityKey: 'employee:a', targetAchievement: 50, avgDealValue: 50, conversionRate: 50 });
    expect(result.data[1]).toMatchObject({ employeeId: null, identityStatus: 'unresolved', targetUnits: 4, targetAchievement: undefined });
  });

  it('propagates report errors instead of returning misleading success', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Report unavailable' } } as never);
    expect((await computeSalesmanActuals('tenant', 2026, 2)).error?.message).toBe('Report unavailable');
  });

  it('does not report successful deletion when RLS hides the target', async () => {
    const query = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    vi.mocked(supabase.from).mockReturnValue(query as never);
    const result = await deleteSalesmanTarget('tenant', 'target-id');
    expect(result.error?.message).toContain('permission');
    expect(query.eq).toHaveBeenCalledWith('company_id', 'tenant');
  });

  it('rejects invalid periods and missing Employee identity before a request', async () => {
    expect((await computeSalesmanActuals('tenant', 2026, 13)).error).not.toBeNull();
    expect((await upsertSalesmanTarget('tenant', { employeeId: null, salesmanName: 'Same', branchCode: 'A', periodYear: 2026, periodMonth: 2, targetUnits: 1, targetRevenue: 0 })).error).not.toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
