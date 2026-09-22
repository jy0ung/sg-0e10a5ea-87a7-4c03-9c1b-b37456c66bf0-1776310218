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
    q.then = (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject);
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

import {
  canAdvanceStage,
  createDeal,
  getNextAction,
  getResponsibleParty,
  getStageLabel,
  getStageOrder,
  getValidTransitions,
  listDeals,
  type DealStage,
} from './dealService';

beforeEach(() => {
  queued.length = 0;
  eqCalls.length = 0;
  inserts.length = 0;
  logErrorMock.mockReset();
  vi.clearAllMocks();
});

describe('dealService', () => {
  describe('getStageLabel', () => {
    it('returns correct labels for all stages', () => {
      expect(getStageLabel('lead')).toBe('Lead');
      expect(getStageLabel('prospect')).toBe('Prospect');
      expect(getStageLabel('booking')).toBe('Booking');
      expect(getStageLabel('loan_submission')).toBe('Loan Submission');
      expect(getStageLabel('lou')).toBe('LOU');
      expect(getStageLabel('shipment')).toBe('Shipment');
      expect(getStageLabel('receive')).toBe('Receive');
      expect(getStageLabel('registration')).toBe('Registration');
      expect(getStageLabel('delivery')).toBe('Delivery');
      expect(getStageLabel('disbursement')).toBe('Disbursement');
      expect(getStageLabel('completed')).toBe('Completed');
    });
  });

  describe('getStageOrder', () => {
    it('returns all 11 stages in order', () => {
      const stages = getStageOrder();
      expect(stages).toHaveLength(11);
      expect(stages[0]).toBe('lead');
      expect(stages[10]).toBe('completed');
    });
  });

  describe('getValidTransitions', () => {
    it('lead can only go to prospect', () => {
      expect(getValidTransitions('lead')).toEqual(['prospect']);
    });

    it('prospect can only go to booking', () => {
      expect(getValidTransitions('prospect')).toEqual(['booking']);
    });

    it('booking can only go to loan_submission', () => {
      expect(getValidTransitions('booking')).toEqual(['loan_submission']);
    });

    it('loan_submission can go to lou or booking', () => {
      expect(getValidTransitions('loan_submission')).toEqual(['lou', 'booking']);
    });

    it('completed has no transitions', () => {
      expect(getValidTransitions('completed')).toEqual([]);
    });
  });

  describe('canAdvanceStage', () => {
    it('allows valid transitions', () => {
      expect(canAdvanceStage('lead', 'prospect')).toBe(true);
      expect(canAdvanceStage('booking', 'loan_submission')).toBe(true);
      expect(canAdvanceStage('delivery', 'disbursement')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(canAdvanceStage('lead', 'booking')).toBe(false);
      expect(canAdvanceStage('lead', 'completed')).toBe(false);
      expect(canAdvanceStage('completed', 'lead')).toBe(false);
    });
  });

  describe('getResponsibleParty', () => {
    it('returns Sales Advisor for pre-sales stages', () => {
      expect(getResponsibleParty('lead')).toBe('Sales Advisor');
      expect(getResponsibleParty('prospect')).toBe('Sales Advisor');
      expect(getResponsibleParty('booking')).toBe('Sales Advisor');
      expect(getResponsibleParty('delivery')).toBe('Sales Advisor');
    });

    it('returns Finance Team for finance stages', () => {
      expect(getResponsibleParty('loan_submission')).toBe('Finance Team');
      expect(getResponsibleParty('lou')).toBe('Finance Team');
      expect(getResponsibleParty('disbursement')).toBe('Finance Team');
    });

    it('returns Operations for logistics stages', () => {
      expect(getResponsibleParty('shipment')).toBe('Operations');
      expect(getResponsibleParty('receive')).toBe('Operations');
      expect(getResponsibleParty('registration')).toBe('Operations');
    });
  });

  describe('getNextAction', () => {
    it('returns non-empty strings for all stages', () => {
      const stages: DealStage[] = [
        'lead', 'prospect', 'booking', 'loan_submission', 'lou',
        'shipment', 'receive', 'registration', 'delivery', 'disbursement', 'completed',
      ];
      for (const stage of stages) {
        const action = getNextAction(stage);
        expect(action).toBeTruthy();
        expect(typeof action).toBe('string');
      }
    });
  });
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
