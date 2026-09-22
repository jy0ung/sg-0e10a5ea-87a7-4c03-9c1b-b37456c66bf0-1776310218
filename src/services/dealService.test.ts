import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: any; error: { message: string } | null };
const queued: Result[] = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inserts: Array<{ table: string; payload: any }> = [];
const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }));

function nextResult(): Result {
  return queued.shift() ?? { data: null, error: null };
}

vi.mock('@/integrations/supabase/client', () => {
  function query(table: string): any {
    const q: Record<string, any> = {};
    q.select = () => q;
    q.insert = (payload: any) => {
      inserts.push({ table, payload });
      return q;
    };
    q.update = () => q;
    q.eq = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return q;
    };
    q.neq = () => q;
    q.order = () => q;
    q.in = () => q;
    q.range = () => q;
    q.gte = () => q;
    q.lte = () => q;
    q.or = () => q;
    q.single = () => Promise.resolve(nextResult());
    q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(nextResult()).then(resolve, reject);
    return q;
  }

  return {
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: 'DEAL/KCH/26/09/001', error: null }),
      from: (table: string) => query(table),
    },
  };
});

vi.mock('./loggingService', () => ({
  loggingService: {
    error: logErrorMock,
    warn: vi.fn(),
  },
}));

vi.mock('./notificationService', () => ({
  createNotifications: vi.fn(),
}));

import { createDeal, listDeals } from './dealService';

beforeEach(() => {
  queued.length = 0;
  eqCalls.length = 0;
  inserts.length = 0;
  logErrorMock.mockReset();
  vi.clearAllMocks();
});

describe('Deal employee-backed sales ownership', () => {
  it('persists canonical Employee ownership together with the legacy Profile compatibility reference', async () => {
    queued.push(
      {
        data: {
          id: 'deal-1',
          company_id: 'c1',
          deal_no: 'DEAL/KCH/26/09/001',
          stage: 'lead',
          sales_advisor_id: 'profile-1',
          sales_advisor_employee_id: 'employee-1',
        },
        error: null,
      },
      { data: null, error: null },
    );

    const result = await createDeal({
      company_id: 'c1',
      branch_id: 'b1',
      customer_name: 'Customer',
      sales_advisor_id: 'profile-1',
      sales_advisor_employee_id: 'employee-1',
      sales_advisor_name: 'Advisor',
    }, 'profile-1');

    expect(result.error).toBeNull();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'deals',
        payload: expect.objectContaining({
          sales_advisor_id: 'profile-1',
          sales_advisor_employee_id: 'employee-1',
          sales_advisor_name: 'Advisor',
        }),
      }),
    ]));
  });

  it('keeps legacy Deal creation compatible when no Employee link is available', async () => {
    queued.push(
      {
        data: {
          id: 'deal-legacy',
          company_id: 'c1',
          deal_no: 'DEAL/KCH/26/09/002',
          stage: 'lead',
          sales_advisor_id: 'profile-legacy',
          sales_advisor_employee_id: null,
        },
        error: null,
      },
      { data: null, error: null },
    );

    const result = await createDeal({
      company_id: 'c1',
      branch_id: 'b1',
      customer_name: 'Legacy Customer',
      sales_advisor_id: 'profile-legacy',
      sales_advisor_name: 'Legacy Advisor',
    }, 'profile-legacy');

    expect(result.error).toBeNull();
    expect(inserts[0]?.payload.sales_advisor_employee_id).toBeUndefined();
  });

  it('supports filtering by canonical Employee ownership', async () => {
    queued.push({ data: [], error: null });

    const result = await listDeals({
      company_id: 'c1',
      sales_advisor_employee_id: 'employee-1',
    });

    expect(result.error).toBeNull();
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'deals', column: 'company_id', value: 'c1' },
      { table: 'deals', column: 'sales_advisor_employee_id', value: 'employee-1' },
    ]));
  });
});
