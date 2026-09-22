import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = {
  data: any;
  error: { message: string; code?: string } | null;
};

const queued: Result[] = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const deleteCalls: string[] = [];
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

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
      rpc: rpcMock,
    },
  };
});

import {
  createEmployeeRecord,
  deleteEmployeeRecord,
  disableEmployeeProfileAccess,
  getLinkedEmployeeProfile,
  updateEmployee,
} from './employeeService';

beforeEach(() => {
  queued.length = 0;
  eqCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: 'employee-1', error: null });
});

describe('atomic Employee mutation', () => {
  it('creates a Sales Employee through the database-owned mutation command', async () => {
    await expect(createEmployeeRecord({
      id: 'employee-1',
      companyId: 'c1',
      name: 'Sales User',
      role: 'sales',
      branchId: 'branch-1',
      staffCode: 'sa001',
      workEmail: 'sales@company.com',
    })).resolves.toBeUndefined();

    expect(rpcMock).toHaveBeenCalledWith(
      'mutate_employee_with_assignments',
      {
        p_company_id: 'c1',
        p_employee_id: 'employee-1',
        p_create: true,
        p_changes: expect.objectContaining({
          name: 'Sales User',
          primary_role: 'sales',
          branch_id: 'branch-1',
          staff_code: 'sa001',
          work_email: 'sales@company.com',
          status: 'active',
        }),
      },
    );
  });

  it('preserves explicit nulls when updating nullable workforce references', async () => {
    await expect(updateEmployee(
      'employee-1',
      {
        role: 'manager',
        branchId: null,
        managerId: null,
        departmentId: null,
        jobTitleId: null,
      },
      'c1',
    )).resolves.toBeUndefined();

    expect(rpcMock).toHaveBeenCalledWith(
      'mutate_employee_with_assignments',
      {
        p_company_id: 'c1',
        p_employee_id: 'employee-1',
        p_create: false,
        p_changes: {
          primary_role: 'manager',
          branch_id: null,
          manager_employee_id: null,
          department_id: null,
          job_title_id: null,
        },
      },
    );
  });

  it('fails before mutation when company scope is missing', async () => {
    await expect(
      updateEmployee('employee-1', { role: 'sales' }),
    ).rejects.toThrow('Company is required for Employee mutation.');

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('propagates database command failures without a second client-side write', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Branch does not belong to the Employee company' },
    });

    await expect(createEmployeeRecord({
      id: 'employee-1',
      companyId: 'c1',
      name: 'Bad Reference',
      role: 'sales',
      branchId: 'branch-other',
    })).rejects.toThrow('Branch does not belong to the Employee company');

    expect(updateCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });
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
      'Cannot delete this employee because HR history exists. Mark the employee as resigned instead.',
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
