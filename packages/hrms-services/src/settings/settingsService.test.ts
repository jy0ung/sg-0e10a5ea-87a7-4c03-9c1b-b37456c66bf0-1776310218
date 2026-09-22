import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: any; error: { message: string } | null; count?: number | null };
const queued: Result[] = [];
const selectCalls: Array<{ table: string; columns: unknown; options: unknown }> = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const insertCalls: Array<{ table: string; payload: unknown }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const deleteCalls: string[] = [];

function nextResult(): Result {
  return queued.shift() ?? { data: null, error: null };
}

vi.mock('../shared/supabaseClient', () => {
  function query(table: string): any {
    const q: Record<string, any> = {};
    q.select = (columns?: unknown, options?: unknown) => {
      selectCalls.push({ table, columns, options });
      return q;
    };
    q.eq = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return q;
    };
    q.in = (column: string, values: unknown[]) => {
      inCalls.push({ table, column, values });
      return q;
    };
    q.order = () => q;
    q.insert = (payload: unknown) => {
      insertCalls.push({ table, payload });
      return q;
    };
    q.update = (payload: unknown) => {
      updateCalls.push({ table, payload });
      return q;
    };
    q.delete = () => {
      deleteCalls.push(table);
      return q;
    };
    q.single = () => Promise.resolve(nextResult());
    q.then = (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject);
    return q;
  }

  return {
    supabase: {
      from: (table: string) => query(table),
    },
  };
});

import {
  createDepartment,
  deleteDepartment,
  createLeaveType,
  createPublicHoliday,
  deletePublicHoliday,
  listPublicHolidays,
  updatePublicHoliday,
  deleteJobTitle,
  deleteLeaveType,
  listDepartments,
  listJobTitles,
  updateLeaveType,
} from './settingsService';

beforeEach(() => {
  queued.length = 0;
  selectCalls.length = 0;
  eqCalls.length = 0;
  inCalls.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  vi.clearAllMocks();
});

describe('canonical Department settings service', () => {
  it('hydrates Employee-backed department-head names', async () => {
    queued.push(
      {
        data: [{
          id: 'dept-1',
          company_id: 'c1',
          name: 'Sales',
          description: null,
          head_employee_id: 'employee-1',
          cost_centre: 'CC-SALES',
          is_active: true,
          created_at: '2026-09-22T00:00:00.000Z',
          updated_at: '2026-09-22T00:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{ id: 'employee-1', name: 'Aisyah Rahman' }],
        error: null,
      },
    );

    const result = await listDepartments('c1');

    expect(result[0]).toMatchObject({
      id: 'dept-1',
      headEmployeeId: 'employee-1',
      headEmployeeName: 'Aisyah Rahman',
    });
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'departments', column: 'company_id', value: 'c1' },
      { table: 'employees', column: 'company_id', value: 'c1' },
    ]));
    expect(inCalls).toEqual([
      { table: 'employees', column: 'id', values: ['employee-1'] },
    ]);
  });

  it('returns the hydrated Employee head after create', async () => {
    queued.push(
      {
        data: {
          id: 'dept-1',
          company_id: 'c1',
          name: 'Sales',
          description: null,
          head_employee_id: 'employee-1',
          cost_centre: 'CC-SALES',
          is_active: true,
          created_at: '2026-09-22T00:00:00.000Z',
          updated_at: '2026-09-22T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [{ id: 'employee-1', name: 'Aisyah Rahman' }],
        error: null,
      },
    );

    const result = await createDepartment('c1', {
      name: 'Sales',
      headEmployeeId: 'employee-1',
      costCentre: 'CC-SALES',
      isActive: true,
    });

    expect(result).toMatchObject({
      id: 'dept-1',
      headEmployeeId: 'employee-1',
      headEmployeeName: 'Aisyah Rahman',
    });
  });

  it('blocks deletion while canonical Employees are assigned', async () => {
    queued.push({ data: null, error: null, count: 2 });

    await expect(deleteDepartment('c1', 'dept-1')).rejects.toThrow(
      'Cannot delete: 2 employee(s) are assigned to this department. Reassign them first.',
    );

    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employees', column: 'company_id', value: 'c1' },
      { table: 'employees', column: 'department_id', value: 'dept-1' },
    ]));
    expect(deleteCalls).toEqual([]);
  });
});

describe('canonical Job Title settings service', () => {
  it('lists Job Titles through the real Job Title department relationship', async () => {
    queued.push({
      data: [{
        id: 'job-1',
        company_id: 'c1',
        name: 'Sales Executive',
        department_id: 'dept-1',
        department: { name: 'Sales' },
        level: 'executive',
        description: null,
        is_active: true,
        created_at: '2026-09-22T00:00:00.000Z',
        updated_at: '2026-09-22T00:00:00.000Z',
      }],
      error: null,
    });

    const result = await listJobTitles('c1');

    expect(result[0]).toMatchObject({
      id: 'job-1',
      departmentId: 'dept-1',
      departmentName: 'Sales',
    });
    expect(selectCalls).toContainEqual({
      table: 'job_titles',
      columns: '*, department:departments!job_titles_department_id_fkey(name)',
      options: undefined,
    });
  });

  it('blocks deletion while canonical Employees are assigned', async () => {
    queued.push({ data: null, error: null, count: 2 });

    await expect(deleteJobTitle('c1', 'job-1')).rejects.toThrow(
      'Cannot delete: 2 employee(s) are assigned to this job title. Reassign them first.',
    );

    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employees', column: 'company_id', value: 'c1' },
      { table: 'employees', column: 'job_title_id', value: 'job-1' },
    ]));
    expect(deleteCalls).toEqual([]);
  });

  it('deletes only after the canonical Employee reference count is zero', async () => {
    queued.push(
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    );

    await expect(deleteJobTitle('c1', 'job-1')).resolves.toBeUndefined();

    expect(deleteCalls).toEqual(['job_titles']);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'job_titles', column: 'company_id', value: 'c1' },
      { table: 'job_titles', column: 'id', value: 'job-1' },
    ]));
  });
});


describe('canonical Leave Type settings service', () => {
  it('creates with all business rules and canonical defaults', async () => {
    queued.push({
      data: {
        id: 'lt-1',
        company_id: 'c1',
        name: 'Annual Leave',
        code: 'AL',
        days_per_year: 14,
        default_days: 14,
        carry_forward: true,
        is_paid: true,
        requires_balance: true,
        min_advance_notice_days: 7,
        active: true,
        created_at: '2026-09-22T00:00:00.000Z',
        updated_at: '2026-09-22T00:00:00.000Z',
      },
      error: null,
    });

    const result = await createLeaveType('c1', {
      name: 'Annual Leave',
      code: 'al',
      daysPerYear: 14,
      isPaid: true,
      minAdvanceNoticeDays: 7,
      active: true,
    });

    expect(result).toMatchObject({
      code: 'AL',
      carryForward: true,
      requiresBalance: true,
      minAdvanceNoticeDays: 7,
    });
    expect(insertCalls).toEqual([
      {
        table: 'leave_types',
        payload: expect.objectContaining({
          company_id: 'c1',
          code: 'AL',
          days_per_year: 14,
          default_days: 14,
          carry_forward: true,
          is_paid: true,
          requires_balance: true,
          min_advance_notice_days: 7,
          active: true,
        }),
      },
    ]);
  });

  it('updates the complete Leave Type rule set', async () => {
    queued.push({ data: null, error: null });

    await expect(updateLeaveType('c1', 'lt-1', {
      name: 'Unpaid Leave',
      code: 'ul',
      daysPerYear: 0,
      defaultDays: 0,
      carryForward: false,
      isPaid: false,
      requiresBalance: false,
      minAdvanceNoticeDays: null,
      active: true,
    })).resolves.toBeUndefined();

    expect(updateCalls).toEqual([
      {
        table: 'leave_types',
        payload: expect.objectContaining({
          name: 'Unpaid Leave',
          code: 'UL',
          days_per_year: 0,
          default_days: 0,
          carry_forward: false,
          is_paid: false,
          requires_balance: false,
          min_advance_notice_days: null,
          active: true,
        }),
      },
    ]);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'leave_types', column: 'company_id', value: 'c1' },
      { table: 'leave_types', column: 'id', value: 'lt-1' },
    ]));
  });

  it('does not mutate when Leave Type reference lookup fails', async () => {
    queued.push({
      data: null,
      error: { message: 'balance lookup denied' },
      count: null,
    });

    await expect(deleteLeaveType('c1', 'lt-1')).rejects.toThrow(
      'balance lookup denied',
    );

    expect(updateCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });

  it('soft-deactivates a Leave Type referenced by balances', async () => {
    queued.push(
      { data: null, error: null, count: 3 },
      { data: null, error: null },
    );

    await expect(deleteLeaveType('c1', 'lt-1')).resolves.toBe('deactivated');

    expect(updateCalls).toEqual([
      {
        table: 'leave_types',
        payload: expect.objectContaining({ active: false }),
      },
    ]);
    expect(deleteCalls).toEqual([]);
  });

  it('hard-deletes an unreferenced Leave Type', async () => {
    queued.push(
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    );

    await expect(deleteLeaveType('c1', 'lt-1')).resolves.toBe('deleted');

    expect(deleteCalls).toEqual(['leave_types']);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'leave_balances', column: 'leave_type_id', value: 'lt-1' },
      { table: 'leave_types', column: 'company_id', value: 'c1' },
      { table: 'leave_types', column: 'id', value: 'lt-1' },
    ]));
  });
});


describe('canonical Public Holiday settings service', () => {
  const holidayInput = {
    name: 'Malaysia Day',
    date: '2026-09-16',
    holidayType: 'public' as const,
    isRecurring: true,
  };

  it('lists company-scoped Holidays and maps the public contract', async () => {
    queued.push({
      data: [{
        id: 'holiday-1',
        company_id: 'c1',
        name: 'Malaysia Day',
        date: '2026-09-16',
        holiday_type: 'public',
        is_recurring: true,
        created_at: '2026-09-22T00:00:00.000Z',
        updated_at: '2026-09-22T00:00:00.000Z',
      }],
      error: null,
    });

    const result = await listPublicHolidays('c1');

    expect(result).toEqual([{
      id: 'holiday-1',
      companyId: 'c1',
      name: 'Malaysia Day',
      date: '2026-09-16',
      holidayType: 'public',
      isRecurring: true,
      createdAt: '2026-09-22T00:00:00.000Z',
      updatedAt: '2026-09-22T00:00:00.000Z',
    }]);
    expect(eqCalls).toContainEqual({
      table: 'public_holidays',
      column: 'company_id',
      value: 'c1',
    });
  });

  it('creates a Holiday through the canonical package service', async () => {
    queued.push({
      data: {
        id: 'holiday-1',
        company_id: 'c1',
        name: 'Malaysia Day',
        date: '2026-09-16',
        holiday_type: 'public',
        is_recurring: true,
        created_at: '2026-09-22T00:00:00.000Z',
        updated_at: '2026-09-22T00:00:00.000Z',
      },
      error: null,
    });

    const result = await createPublicHoliday('c1', holidayInput);

    expect(result.id).toBe('holiday-1');
    expect(insertCalls).toEqual([
      {
        table: 'public_holidays',
        payload: {
          company_id: 'c1',
          name: 'Malaysia Day',
          date: '2026-09-16',
          holiday_type: 'public',
          is_recurring: true,
        },
      },
    ]);
  });

  it('updates and deletes only within the requested company', async () => {
    queued.push(
      { data: null, error: null },
      { data: null, error: null },
    );

    await expect(
      updatePublicHoliday('c1', 'holiday-1', holidayInput),
    ).resolves.toBeUndefined();
    await expect(
      deletePublicHoliday('c1', 'holiday-1'),
    ).resolves.toBeUndefined();

    expect(updateCalls[0]).toEqual({
      table: 'public_holidays',
      payload: expect.objectContaining({
        name: 'Malaysia Day',
        date: '2026-09-16',
        holiday_type: 'public',
        is_recurring: true,
      }),
    });
    expect(deleteCalls).toEqual(['public_holidays']);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'public_holidays', column: 'company_id', value: 'c1' },
      { table: 'public_holidays', column: 'id', value: 'holiday-1' },
    ]));
  });
});
