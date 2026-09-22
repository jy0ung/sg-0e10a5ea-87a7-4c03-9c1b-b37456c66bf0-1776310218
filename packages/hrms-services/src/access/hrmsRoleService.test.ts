import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: any; error: { message: string } | null };
const queued: Result[] = [];
const selectCalls: Array<{ table: string; columns: unknown }> = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const orCalls: Array<{ table: string; filter: string }> = [];
const insertCalls: Array<{ table: string; payload: unknown }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

function nextResult(): Result {
  return queued.shift() ?? { data: null, error: null };
}

vi.mock('../shared/supabaseClient', () => {
  function query(table: string): any {
    const q: Record<string, any> = {};
    q.select = (columns?: unknown) => {
      selectCalls.push({ table, columns });
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
    q.or = (filter: string) => {
      orCalls.push({ table, filter });
      return q;
    };
    q.order = () => q;
    q.limit = () => q;
    q.insert = (payload: unknown) => {
      insertCalls.push({ table, payload });
      return q;
    };
    q.update = (payload: unknown) => {
      updateCalls.push({ table, payload });
      return q;
    };
    q.single = () => Promise.resolve(nextResult());
    q.maybeSingle = () => Promise.resolve(nextResult());
    q.then = (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject);
    return q;
  }

  return {
    supabase: {
      from: (table: string) => query(table),
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve(nextResult());
      },
    },
  };
});

import {
  createHrmsRole,
  listAssignedHrmsRoles,
  listHrmsRoles,
  replaceHrmsRoleEmployeeAssignments,
  userHasHrmsRole,
} from './hrmsRoleService';

beforeEach(() => {
  queued.length = 0;
  selectCalls.length = 0;
  eqCalls.length = 0;
  inCalls.length = 0;
  orCalls.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  rpcCalls.length = 0;
  vi.clearAllMocks();
});

describe('canonical HRMS role service', () => {
  it('lists roles with updater identity and assignment counts', async () => {
    queued.push(
      {
        data: [{
          id: 'role-1',
          company_id: 'c1',
          code: 'hr_manager',
          name: 'HR Manager',
          category: 'hr',
          scope: 'company',
          authority_level: 30,
          can_approve_requests: true,
          can_manage_employee_records: true,
          can_view_hrms_reports: true,
          is_active: true,
          is_system_default: true,
          updated_by_profile: { name: 'Admin User' },
        }],
        error: null,
      },
      {
        data: [
          { hrms_role_id: 'role-1' },
          { hrms_role_id: 'role-1' },
        ],
        error: null,
      },
    );

    const result = await listHrmsRoles('c1');

    expect(result[0]).toMatchObject({
      id: 'role-1',
      assignedUserCount: 2,
      lastUpdatedByName: 'Admin User',
    });
    expect(inCalls).toContainEqual({
      table: 'employee_hrms_role_assignments',
      column: 'hrms_role_id',
      values: ['role-1'],
    });
  });

  it('normalizes role code and records actor metadata on create', async () => {
    queued.push({
      data: {
        id: 'role-1',
        company_id: 'c1',
        code: 'sales_team_lead',
        name: ' Sales Team Lead ',
        category: 'department',
        scope: 'department',
        authority_level: 50,
        can_approve_requests: true,
        can_manage_employee_records: false,
        can_view_hrms_reports: false,
        is_active: true,
        is_system_default: false,
      },
      error: null,
    });

    await createHrmsRole('c1', 'profile-admin', {
      name: ' Sales Team Lead ',
      category: 'department',
      scope: 'department',
      authorityLevel: 50,
      description: ' Team lead ',
      canApproveRequests: true,
      canManageEmployeeRecords: false,
      canViewHrmsReports: false,
      isActive: true,
    });

    expect(insertCalls).toEqual([
      {
        table: 'hrms_roles',
        payload: expect.objectContaining({
          company_id: 'c1',
          code: 'sales_team_lead',
          name: 'Sales Team Lead',
          description: 'Team lead',
          created_by: 'profile-admin',
          updated_by: 'profile-admin',
          is_system_default: false,
        }),
      },
    ]);
  });

  it('deduplicates Employee IDs before the atomic assignment RPC', async () => {
    queued.push({ data: null, error: null });

    await replaceHrmsRoleEmployeeAssignments(
      'c1',
      'role-1',
      ['employee-1', 'employee-1', '', 'employee-2'],
    );

    expect(rpcCalls).toEqual([
      {
        fn: 'replace_hrms_role_employee_assignments',
        args: {
          p_company_id: 'c1',
          p_hrms_role_id: 'role-1',
          p_employee_ids: ['employee-1', 'employee-2'],
        },
      },
    ]);
  });

  it('deduplicates roles returned through Profile/Employee compatibility lookup', async () => {
    queued.push({
      data: [
        {
          hrms_role: {
            id: 'role-1',
            company_id: 'c1',
            code: 'manager',
            name: 'Manager',
            category: 'department',
            scope: 'department',
            authority_level: 50,
            is_active: true,
          },
        },
        {
          hrms_role: {
            id: 'role-1',
            company_id: 'c1',
            code: 'manager',
            name: 'Manager',
            category: 'department',
            scope: 'department',
            authority_level: 50,
            is_active: true,
          },
        },
      ],
      error: null,
    });

    const result = await listAssignedHrmsRoles(
      'c1',
      'profile-1',
      'employee-1',
    );

    expect(result).toHaveLength(1);
    expect(orCalls).toContainEqual({
      table: 'employee_hrms_role_assignments',
      filter: 'profile_id.eq.profile-1,employee_id.eq.employee-1',
    });
  });

  it('checks both authenticated Profile and canonical Employee assignment identity', async () => {
    queued.push(
      { data: { employee_id: 'employee-1' }, error: null },
      { data: [{ id: 'assignment-1' }], error: null },
    );

    await expect(
      userHasHrmsRole('c1', 'profile-1', 'role-1'),
    ).resolves.toBe(true);

    expect(orCalls).toContainEqual({
      table: 'employee_hrms_role_assignments',
      filter: 'profile_id.eq.profile-1,employee_id.eq.employee-1',
    });
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employee_hrms_role_assignments', column: 'company_id', value: 'c1' },
      { table: 'employee_hrms_role_assignments', column: 'hrms_role_id', value: 'role-1' },
    ]));
  });
});
