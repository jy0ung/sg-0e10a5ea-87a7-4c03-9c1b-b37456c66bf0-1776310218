import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueuedResult = {
  data: unknown;
  error: { message: string } | null;
};

const queuedResults: QueuedResult[] = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const { logErrorMock } = vi.hoisted(() => ({
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
    proxy.insert = (..._args: unknown[]) => proxy;
    proxy.update = (..._args: unknown[]) => proxy;
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
  logErrorMock.mockReset();
  vi.clearAllMocks();
});

describe('listSalesAdvisors', () => {
  it('lists sales advisors from the sales_advisors table', async () => {
    queueResolves({
      data: [{
        id: 'advisor-1',
        code: 'SA001',
        name: 'Aisyah Rahman',
        email: 'aisyah@company.com',
        ic_no: '900101-01-1234',
        contact_no: '0123456789',
        branch_code: 'b1',
        join_date: '2026-04-01',
        resign_date: null,
        status: 'active',
      }],
      error: null,
    });

    const result = await listSalesAdvisors('c1');

    expect(result).toEqual([
      {
        id: 'advisor-1',
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
      { table: 'sales_advisors', column: 'company_id', value: 'c1' },
    ]));
  });

  it('surfaces an error when sales_advisors table is unavailable', async () => {
    queueResolves({ data: null, error: { message: 'relation "sales_advisors" does not exist' } });

    await expect(listSalesAdvisors('c1')).rejects.toThrow('relation "sales_advisors" does not exist');
    expect(logErrorMock).toHaveBeenCalledWith(
      'listSalesAdvisors failed',
      expect.objectContaining({ companyId: 'c1' }),
      'SalesAdvisorService',
    );
  });
});

describe('createSalesAdvisor', () => {
  it('returns an error when the insert fails', async () => {
    queueResolves({ data: null, error: { message: 'duplicate key value violates unique constraint' } });

    const result = await createSalesAdvisor({
      companyId: 'c1',
      code: 'sa001',
      name: 'Aisyah Rahman',
      branch: 'b1',
    });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('duplicate key value violates unique constraint');
  });
});

describe('updateSalesAdvisorStatus', () => {
  it('returns an error when the update fails', async () => {
    queueResolves({ data: null, error: { message: 'relation "sales_advisors" does not exist' } });

    const result = await updateSalesAdvisorStatus('c1', 'advisor-1', 'inactive');

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('relation "sales_advisors" does not exist');
  });
});