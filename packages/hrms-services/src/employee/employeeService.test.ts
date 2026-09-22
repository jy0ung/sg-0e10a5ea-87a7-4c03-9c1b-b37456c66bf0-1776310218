import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = {
  data: any;
  error: { message: string; code?: string } | null;
};

const queued: Result[] = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const deleteCalls: string[] = [];

function nextResult(): Result {
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
    q.maybeSingle = () => Promise.resolve(nextResult());
    q.update = (payload: unknown) => {
      updateCalls.push({ table, payload });
      return q;
    };
    q.delete = () => {
      deleteCalls.push(table);
      return q;
    };
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
  deleteEmployeeRecord,
  disableEmployeeProfileAccess,
  getLinkedEmployeeProfile,
} from './employeeService';

beforeEach(() => {
  queued.length = 0;
  eqCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  vi.clearAllMocks();
});

describe('Employee deletion primitives', () => {
  it('resolves the linked Profile without mutating it', async () => {
    queued.push({
      data: {
        id: 'profile-1',
        status: 'pending',
        company_id: 'c1',
        access_scope: 'company',
      },
      error: null,
    });

    await expect(
      getLinkedEmployeeProfile('employee-1', 'c1'),
    ).resolves.toEqual({
      id: 'profile-1',
      status: 'pending',
      companyId: 'c1',
      accessScope: 'company',
    });

    expect(eqCalls).toContainEqual({
      table: 'profiles',
      column: 'employee_id',
      value: 'employee-1',
    });
    expect(updateCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });

  it('rejects a cross-company linked Profile', async () => {
    queued.push({
      data: {
        id: 'profile-1',
        status: 'active',
        company_id: 'c2',
        access_scope: 'company',
      },
      error: null,
    });

    await expect(
      getLinkedEmployeeProfile('employee-1', 'c1'),
    ).rejects.toThrow(/does not belong to the Employee company/i);
  });

  it('translates historical FK blockers into lifecycle guidance', async () => {
    queued.push({
      data: null,
      error: {
        code: '23503',
        message: 'violates foreign key constraint',
      },
    });

    await expect(
      deleteEmployeeRecord('employee-1', 'c1'),
    ).rejects.toThrow(
      'Cannot delete this employee because HR or business history exists. Mark the employee as resigned instead.',
    );

    expect(deleteCalls).toEqual(['employees']);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employees', column: 'id', value: 'employee-1' },
      { table: 'employees', column: 'company_id', value: 'c1' },
    ]));
  });

  it('deletes an unused Employee within company scope', async () => {
    queued.push({ data: { id: 'employee-1' }, error: null });

    await expect(
      deleteEmployeeRecord('employee-1', 'c1'),
    ).resolves.toBeUndefined();

    expect(deleteCalls).toEqual(['employees']);
  });

  it('can disable an orphaned Profile after post-delete auth cleanup failure', async () => {
    queued.push({ data: null, error: null });

    await expect(
      disableEmployeeProfileAccess('profile-1'),
    ).resolves.toBeUndefined();

    expect(updateCalls).toEqual([
      {
        table: 'profiles',
        payload: { status: 'inactive', employee_id: null },
      },
    ]);
    expect(eqCalls).toContainEqual({
      table: 'profiles',
      column: 'id',
      value: 'profile-1',
    });
  });
});
