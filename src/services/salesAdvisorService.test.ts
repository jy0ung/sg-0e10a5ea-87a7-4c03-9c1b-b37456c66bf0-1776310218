import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueuedResult = {
  data: unknown;
  error: { message: string } | null;
};

const queuedResults: QueuedResult[] = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const { createEmployeeMock, updateEmployeeMock, logErrorMock } = vi.hoisted(() => ({
  createEmployeeMock: vi.fn(),
  updateEmployeeMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

function queueResolves(...results: QueuedResult[]) {
  queuedResults.push(...results);
}

function drainResolve(): QueuedResult {
  return queuedResults.shift() ?? { data: null, error: null };
}

vi.mock('@/integrations/supabase/client', () => {
  function makeProxy(table: string): any {
    const proxy: Record<string, unknown> = {};

    proxy.select = (..._args: unknown[]) => proxy;
    proxy.eq = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return proxy;
    };
    proxy.in = (column: string, values: unknown[]) => {
      inCalls.push({ table, column, values });
      return proxy;
    };
    proxy.order = (..._args: unknown[]) => proxy;
    proxy.then = (
      resolve: (value: QueuedResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(drainResolve()).then(resolve, reject);

    return proxy;
  }

  return {
    supabase: {
      from: (table: string) => makeProxy(table),
    },
  };
});

vi.mock('./hrmsService', () => ({
  createEmployee: createEmployeeMock,
  updateEmployee: updateEmployeeMock,
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: logErrorMock,
  },
}));

import {
  createSalesAdvisor,
  listSalesAdvisors,
  updateSalesAdvisorStatus,
} from './salesAdvisorService';

beforeEach(() => {
  queuedResults.length = 0;
  eqCalls.length = 0;
  inCalls.length = 0;
  createEmployeeMock.mockReset();
  updateEmployeeMock.mockReset();
  logErrorMock.mockReset();
  vi.clearAllMocks();
});

describe('listSalesAdvisors', () => {
  it('lists sales advisors from employee module assignments', async () => {
    queueResolves(
      {
        data: [{ employee_id: 'employee-1' }],
        error: null,
      },
      {
        data: [{
          id: 'employee-1',
          branch_id: 'b1',
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

    const result = await listSalesAdvisors('c1');

    expect(result).toEqual([
      {
        id: 'employee-1',
        code: 'SA001',
        name: 'Aisyah Rahman',
        ic: '900101-01-1234',
        email: 'aisyah@company.com',
        contact: '0123456789',
        branch: 'b1',
        joinDate: '2026-04-01',
        resignDate: undefined,
        status: 'active',
      },
    ]);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employee_module_assignments', column: 'company_id', value: 'c1' },
      { table: 'employee_module_assignments', column: 'module_key', value: 'sales' },
      { table: 'employee_module_assignments', column: 'assignment_role', value: 'sales_advisor' },
      { table: 'employee_module_assignments', column: 'active', value: true },
      { table: 'employees', column: 'company_id', value: 'c1' },
    ]));
    expect(inCalls).toEqual([
      { table: 'employees', column: 'id', values: ['employee-1'] },
    ]);
  });

  it('surfaces an error when workforce assignment tables are unavailable', async () => {
    queueResolves({ data: null, error: { message: 'relation "employee_module_assignments" does not exist' } });

    await expect(listSalesAdvisors('c1')).rejects.toThrow('relation "employee_module_assignments" does not exist');
    expect(logErrorMock).toHaveBeenCalledWith(
      'listSalesAdvisors failed',
      expect.objectContaining({ companyId: 'c1' }),
      'SalesAdvisorService',
    );
    expect(eqCalls).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'profiles' }),
    ]));
  });
});

describe('createSalesAdvisor', () => {
  it('returns an error when employee creation fails', async () => {
    createEmployeeMock.mockResolvedValue({ error: 'relation "employees" does not exist' });

    const result = await createSalesAdvisor({
      companyId: 'c1',
      code: 'sa001',
      name: 'Aisyah Rahman',
      branch: 'b1',
    });

    expect(createEmployeeMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'c1',
      staffCode: 'SA001',
      role: 'sales',
    }));
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('relation "employees" does not exist');
  });
});

describe('updateSalesAdvisorStatus', () => {
  it('returns an error when employee updates fail', async () => {
    updateEmployeeMock.mockResolvedValue({ error: 'relation "employees" does not exist' });

    const result = await updateSalesAdvisorStatus('employee-1', 'inactive');

    expect(updateEmployeeMock).toHaveBeenCalledWith('employee-1', { status: 'inactive' });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('relation "employees" does not exist');
  });
});