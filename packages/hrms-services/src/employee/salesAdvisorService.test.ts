import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueuedResult = { data: any; error: { message: string } | null };
const queued: QueuedResult[] = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

function nextResult(): QueuedResult {
  return queued.shift() ?? { data: null, error: null };
}

vi.mock('../shared/supabaseClient', () => {
  function query(table: string): any {
    const q: Record<string, any> = {};
    q.select = () => q;
    q.eq = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return q;
    };
    q.in = (column: string, values: unknown[]) => {
      inCalls.push({ table, column, values });
      return q;
    };
    q.order = () => q;
    q.update = (payload: unknown) => {
      updateCalls.push({ table, payload });
      return q;
    };
    q.then = (
      resolve: (value: QueuedResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject);
    return q;
  }

  return {
    supabase: {
      from: (table: string) => query(table),
      rpc: rpcMock,
    },
  };
});

import {
  createSalesAdvisor,
  listSalesAdvisors,
  updateSalesAdvisorStatus,
} from './salesAdvisorService';

beforeEach(() => {
  queued.length = 0;
  eqCalls.length = 0;
  inCalls.length = 0;
  updateCalls.length = 0;
  vi.clearAllMocks();
});

describe('canonical Sales Advisor service', () => {
  it('lists Employees with active sales_advisor assignments', async () => {
    queued.push(
      { data: [{ employee_id: 'employee-1' }], error: null },
      {
        data: [{
          id: 'employee-1',
          branch_id: 'branch-1',
          staff_code: 'SA001',
          name: 'Aisyah Rahman',
          work_email: 'aisyah@company.com',
          ic_no: '900101-01-1234',
          contact_no: '0123456789',
          join_date: '2026-04-01',
          resign_date: null,
          status: 'active',
        }],
        error: null,
      },
    );

    await expect(listSalesAdvisors('c1')).resolves.toEqual([{
      id: 'employee-1',
      code: 'SA001',
      name: 'Aisyah Rahman',
      ic: '900101-01-1234',
      email: 'aisyah@company.com',
      contact: '0123456789',
      branchId: 'branch-1',
      joinDate: '2026-04-01',
      resignDate: undefined,
      status: 'active',
    }]);

    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employee_module_assignments', column: 'company_id', value: 'c1' },
      { table: 'employee_module_assignments', column: 'module_key', value: 'sales' },
      { table: 'employee_module_assignments', column: 'assignment_role', value: 'sales_advisor' },
      { table: 'employee_module_assignments', column: 'active', value: true },
      { table: 'employees', column: 'company_id', value: 'c1' },
    ]));
    expect(inCalls).toEqual([{ table: 'employees', column: 'id', values: ['employee-1'] }]);
  });

  it('creates Employee and assignment through the atomic RPC', async () => {
    rpcMock.mockResolvedValue({ data: 'employee-1', error: null });

    await expect(createSalesAdvisor({
      companyId: 'c1',
      branchId: 'branch-1',
      code: 'sa001',
      name: 'Aisyah',
      email: 'aisyah@company.com',
    })).resolves.toBe('employee-1');

    expect(rpcMock).toHaveBeenCalledWith('create_sales_advisor_employee', expect.objectContaining({
      p_company_id: 'c1',
      p_branch_id: 'branch-1',
      p_staff_code: 'sa001',
      p_name: 'Aisyah',
    }));
  });

  it('updates status on the canonical Employee row', async () => {
    queued.push({ data: null, error: null });

    await expect(updateSalesAdvisorStatus('c1', 'employee-1', 'inactive')).resolves.toBeUndefined();

    expect(updateCalls).toEqual([{ table: 'employees', payload: { status: 'inactive' } }]);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employees', column: 'id', value: 'employee-1' },
      { table: 'employees', column: 'company_id', value: 'c1' },
    ]));
  });
});
