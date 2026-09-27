import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { createCommissionRule, getCommissionRecords, updateCommissionRule } from './commissionService';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('./loggingService', () => ({ loggingService: { error: vi.fn() } }));
vi.mock('./performanceService', () => ({ performanceService: { startQueryTimer: vi.fn(), endQueryTimer: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('Commission Employee identity caller', () => {
  it('creates a scoped rule with an Employee ID and no caller-provided name identity', async () => {
    const query = {
      insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {
        id: 'rule-1', company_id: 'company-1', employee_id: 'employee-1',
        salesman_name: 'Current name', branch_code: null, rule_name: 'Bonus',
        threshold_days: null, amount: 100,
      }, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(query as never);
    const result = await createCommissionRule({
      companyId: 'company-1', employeeId: 'employee-1', salesmanName: 'Untrusted name',
      ruleName: 'Bonus', amount: 100,
    });
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      employee_id: 'employee-1', salesman_name: null, company_id: 'company-1',
    }));
    expect(result.data).toMatchObject({ employeeId: 'employee-1', salesmanName: 'Current name' });
  });

  it('filters earning records by Employee ID instead of duplicate display names', async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis() };
    // The query's final Employee filter resolves as a thenable PostgREST builder.
    query.eq.mockImplementation(() => query);
    Object.assign(query, { then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) });
    vi.mocked(supabase.from).mockReturnValue(query as never);
    const result = await getCommissionRecords('company-1', { employeeId: 'employee-1' });
    expect(result.error).toBeNull();
    expect(query.eq).toHaveBeenCalledWith('company_id', 'company-1');
    expect(query.eq).toHaveBeenCalledWith('employee_id', 'employee-1');
    expect(query.eq).not.toHaveBeenCalledWith('salesman_name', expect.anything());
  });

  it('explicitly clears legacy name scope when a rule is converted to all advisors', async () => {
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
    vi.mocked(supabase.from).mockReturnValue(query as never);
    const result = await updateCommissionRule('company-1', 'rule-1', { employeeId: null });
    expect(result.error).toBeNull();
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ employee_id: null, salesman_name: null }));
  });
});
