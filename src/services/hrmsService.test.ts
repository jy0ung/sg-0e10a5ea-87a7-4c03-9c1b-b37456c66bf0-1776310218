import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueuedResult = {
  data: unknown;
  error: { message: string } | null;
};

const queuedResults: QueuedResult[] = [];
const insertCalls: Array<{ table: string; values: unknown }> = [];
const updateCalls: Array<{ table: string; values: unknown }> = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const upsertCalls: Array<{ table: string; values: unknown }> = [];

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
    proxy.limit = (..._args: unknown[]) => proxy;
    proxy.ilike = (..._args: unknown[]) => proxy;
    proxy.gte = (..._args: unknown[]) => proxy;
    proxy.lte = (..._args: unknown[]) => proxy;
    proxy.single = () => Promise.resolve(drainResolve());
    proxy.maybeSingle = () => Promise.resolve(drainResolve());
    proxy.insert = (values: unknown) => {
      insertCalls.push({ table, values });
      return proxy;
    };
    proxy.update = (values: unknown) => {
      updateCalls.push({ table, values });
      return proxy;
    };
    proxy.upsert = (values: unknown) => {
      upsertCalls.push({ table, values });
      return proxy;
    };
    proxy.delete = () => proxy;
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

vi.mock('@/services/auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@flc/hrms-services', () => ({
  createLeaveRequest: vi.fn().mockResolvedValue('leave-1'),
}));

import {
  acknowledgeAppraisalItem,
  createAppraisal,
  createEmployee,
  createPayrollRun,
  listAppraisals,
  listAttendanceRecords,
  listEmployeeDirectory,
  listAppraisalItems,
  listLeaveRequests,
  listPayrollItems,
  listPayrollRuns,
  resubmitAppraisalActivation,
  resubmitPayrollRunFinalisation,
  reviewAppraisalItem,
  reviewAppraisalActivation,
  reviewLeaveRequest,
  reviewPayrollRunFinalisation,
  submitAppraisalSelfReview,
  upsertAttendance,
  updatePayrollRunStatus,
} from './hrmsService';
import { createEmployeeSchema, createLeaveRequestSchema, upsertAttendanceSchema } from '@/lib/validations';

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  eqCalls.length = 0;
  inCalls.length = 0;
  upsertCalls.length = 0;
});

describe('listEmployeeDirectory', () => {
  it('reads workforce employees when the new schema is available', async () => {
    queueResolves({
      data: [{
        id: 'emp-dir-1',
        company_id: 'c1',
        branch_id: 'b1',
        manager_employee_id: 'mgr-1',
        primary_role: 'manager',
        status: 'active',
        staff_code: 'EMP001',
        name: 'Maya',
        work_email: 'maya@company.com',
        ic_no: '900101-12-1234',
        contact_no: '0123456789',
        join_date: '2026-04-01',
        department_id: 'dept-1',
        job_title_id: 'jt-1',
        department: { name: 'HR' },
        job_title: { name: 'Manager' },
      }],
      error: null,
    });

    const result = await listEmployeeDirectory('c1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'emp-dir-1',
      role: 'manager',
      managerId: 'mgr-1',
      departmentName: 'HR',
      jobTitleName: 'Manager',
    });
  });

  it('falls back to legacy profiles when the workforce schema is unavailable', async () => {
    queueResolves(
      { data: null, error: { message: 'relation "employees" does not exist' } },
      {
        data: [{
          id: 'profile-1',
          email: 'legacy@company.com',
          name: 'Legacy User',
          role: 'analyst',
          company_id: 'c1',
          branch_id: 'b1',
          manager_id: null,
          status: 'active',
          staff_code: 'LG001',
          ic_no: null,
          contact_no: null,
          join_date: '2026-04-01',
          resign_date: null,
          avatar_url: null,
          department_id: null,
          job_title_id: null,
          department: null,
          job_title: null,
        }],
        error: null,
      },
    );

    const result = await listEmployeeDirectory('c1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({ id: 'profile-1', role: 'analyst' });
  });
});

describe('createEmployee', () => {
  it('creates workforce employees in the new schema', async () => {
    queueResolves(
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await createEmployee({
      id: 'emp-1',
      email: 'sales@company.com',
      name: 'Sales User',
      role: 'sales',
      companyId: 'c1',
      branchId: 'b1',
      staffCode: 'SA001',
    }, 'actor-1');

    expect(result.error).toBeNull();
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'employees',
      values: expect.objectContaining({
        id: 'emp-1',
        primary_role: 'sales',
      }),
    }));
  });

  it('falls back to legacy profile creation when the workforce schema is unavailable', async () => {
    queueResolves(
      { data: null, error: { message: 'relation "employees" does not exist' } },
      { data: null, error: null },
    );

    const result = await createEmployee({
      id: 'legacy-1',
      email: 'legacy@company.com',
      name: 'Legacy Employee',
      role: 'analyst',
      companyId: 'c1',
      staffCode: 'LG001',
    }, 'actor-1');

    expect(result.error).toBeNull();
    expect(insertCalls).toContainEqual(expect.objectContaining({ table: 'employees' }));
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'profiles',
      values: expect.objectContaining({
        id: 'legacy-1',
        role: 'analyst',
      }),
    }));
  });
});

describe('listLeaveRequests', () => {
  it('filters leave requests by both employee and linked profile ids during the ownership transition', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1' }, error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const result = await listLeaveRequests('c1', { employeeId: 'employee-1' });

    expect(result.error).toBeNull();
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'profiles', column: 'id', value: 'employee-1' },
      { table: 'profiles', column: 'employee_id', value: 'employee-1' },
    ]));
    expect(inCalls).toEqual(expect.arrayContaining([
      { table: 'leave_requests', column: 'employee_id', values: ['employee-1', 'profile-1'] },
    ]));
  });

  it('normalises profile-backed leave rows onto the linked employee identity', async () => {
    queueResolves(
      {
        data: [{
          id: 'leave-1',
          company_id: 'c1',
          employee_id: 'profile-1',
          leave_type_id: 'lt-1',
          start_date: '2026-04-10',
          end_date: '2026-04-12',
          days: 3,
          status: 'approved',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
          leave_types: { name: 'Annual Leave' },
        }],
        error: null,
      },
      {
        data: [{ id: 'profile-1', name: 'Aisyah', employee_id: 'employee-1' }],
        error: null,
      },
    );

    const result = await listLeaveRequests('c1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
    });
  });

  it('hydrates approval history when requested', async () => {
    queueResolves(
      {
        data: [{
          id: 'leave-1',
          company_id: 'c1',
          employee_id: 'emp-1',
          leave_type_id: 'lt-1',
          start_date: '2026-04-10',
          end_date: '2026-04-12',
          days: 3,
          status: 'pending',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
          leave_types: { name: 'Annual Leave' },
        }],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{ id: 'emp-1', name: 'Aisyah' }],
        error: null,
      },
      {
        data: [{
          id: 'ai-1',
          entity_id: 'leave-1',
          status: 'pending',
          current_step_order: 1,
          current_step_name: 'Manager Review',
          current_approver_role: 'manager',
          current_approver_user_id: null,
        }],
        error: null,
      },
      {
        data: [{
          id: 'decision-1',
          instance_id: 'ai-1',
          step_id: 'step-1',
          step_order: 1,
          approver_id: 'manager-1',
          decision: 'approved',
          note: 'Looks fine',
          decided_at: '2026-04-02T09:00:00.000Z',
          created_at: '2026-04-02T09:00:00.000Z',
          approver: { name: 'Nur Aina' },
          step: { name: 'Manager Review' },
        }],
        error: null,
      },
    );

    const result = await listLeaveRequests('c1', { includeApprovalHistory: true });

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'leave-1',
      approvalInstanceId: 'ai-1',
      currentApprovalStepName: 'Manager Review',
      approvalHistory: [{
        id: 'decision-1',
        decision: 'approved',
        approverName: 'Nur Aina',
        stepName: 'Manager Review',
      }],
    });
  });
});

describe('reviewLeaveRequest', () => {
  it('still blocks self-approval when the leave owner is stored as an employee id', async () => {
    queueResolves(
      { data: { employee_id: 'employee-1', company_id: 'c1' }, error: null },
      { data: null, error: null },
      { data: { id: 'profile-1' }, error: null },
      { data: { role: 'manager' }, error: null },
      { data: null, error: null },
    );

    const result = await reviewLeaveRequest('leave-1', 'profile-1', 'approved', 'Approved');

    expect(result.error).toBe('You cannot approve or reject your own leave request.');
  });

  it('finalises the leave request on the last approval step', async () => {
    queueResolves(
      { data: { employee_id: 'emp-1', company_id: 'c1' }, error: null },
      { data: { id: 'emp-1' }, error: null },
      { data: { role: 'general_manager' }, error: null },
      {
        data: {
          id: 'ai-1',
          flow_id: 'flow-1',
          requester_id: 'emp-1',
          status: 'pending',
          current_step_id: 'step-1',
          current_step_order: 1,
          current_step_name: 'GM Review',
          current_approver_role: 'general_manager',
          current_approver_user_id: null,
        },
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'GM Review',
          approver_type: 'role',
          approver_role: 'general_manager',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await reviewLeaveRequest('leave-1', 'gm-1', 'approved', 'Approved');

    expect(result.error).toBeNull();
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'approval_decisions',
      values: expect.objectContaining({
        instance_id: 'ai-1',
        decision: 'approved',
      }),
    }));
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({ status: 'approved' }),
    }));
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'leave_requests',
      values: expect.objectContaining({ status: 'approved' }),
    }));
  });
});

describe('listAttendanceRecords', () => {
  it('filters attendance by both employee and linked profile ids and normalises returned ids', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1' }, error: null },
      {
        data: [{
          id: 'att-1',
          company_id: 'c1',
          employee_id: 'profile-1',
          date: '2026-04-10',
          clock_in: '09:00:00',
          clock_out: '18:00:00',
          hours_worked: 8,
          status: 'present',
          notes: null,
          created_at: '2026-04-10T00:00:00.000Z',
          updated_at: '2026-04-10T00:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{ id: 'profile-1', name: 'Aisyah', employee_id: 'employee-1' }],
        error: null,
      },
    );

    const result = await listAttendanceRecords('c1', { employeeId: 'employee-1' });

    expect(result.error).toBeNull();
    expect(inCalls).toEqual(expect.arrayContaining([
      { table: 'attendance_records', column: 'employee_id', values: ['employee-1', 'profile-1'] },
    ]));
    expect(result.data[0]).toMatchObject({
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
    });
  });
});

describe('upsertAttendance', () => {
  it('falls back to the linked profile id when attendance ownership is still profile-backed', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1' }, error: null },
      { data: null, error: { message: 'violates foreign key constraint "attendance_records_employee_id_fkey"' } },
      { data: null, error: null },
    );

    const result = await upsertAttendance('c1', {
      employeeId: 'employee-1',
      date: '2026-04-10',
      status: 'present',
      clockIn: '09:00',
    });

    expect(result.error).toBeNull();
    expect(upsertCalls).toEqual([
      {
        table: 'attendance_records',
        values: expect.objectContaining({ employee_id: 'employee-1' }),
      },
      {
        table: 'attendance_records',
        values: expect.objectContaining({ employee_id: 'profile-1' }),
      },
    ]);
  });
});

describe('listPayrollRuns', () => {
  it('hydrates approval history when requested', async () => {
    queueResolves(
      {
        data: [{
          id: 'run-1',
          company_id: 'c1',
          period_year: 2026,
          period_month: 4,
          status: 'draft',
          total_headcount: 10,
          total_gross: 10000,
          total_net: 9000,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{
          id: 'ai-1',
          entity_id: 'run-1',
          status: 'pending',
          current_step_order: 1,
          current_step_name: 'Finance Review',
          current_approver_role: 'company_admin',
          current_approver_user_id: null,
        }],
        error: null,
      },
      {
        data: [{
          id: 'decision-1',
          instance_id: 'ai-1',
          step_id: 'step-1',
          step_order: 1,
          approver_id: 'admin-2',
          decision: 'approved',
          note: 'Numbers look right',
          decided_at: '2026-04-02T09:00:00.000Z',
          created_at: '2026-04-02T09:00:00.000Z',
          approver: { name: 'Finance Lead' },
          step: { name: 'Finance Review' },
        }],
        error: null,
      },
    );

    const result = await listPayrollRuns('c1', { includeApprovalHistory: true });

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'run-1',
      approvalInstanceId: 'ai-1',
      currentApprovalStepName: 'Finance Review',
      approvalHistory: [{
        id: 'decision-1',
        approverName: 'Finance Lead',
        stepName: 'Finance Review',
      }],
    });
  });
});

describe('listPayrollItems', () => {
  it('normalises profile-backed payroll items onto the linked employee identity', async () => {
    queueResolves(
      {
        data: [{
          id: 'item-1',
          payroll_run_id: 'run-1',
          employee_id: 'profile-1',
          basic_salary: 3000,
          allowances: 200,
          overtime: 150,
          gross_pay: 3350,
          epf_employee: 330,
          socso_employee: 25,
          income_tax: 100,
          other_deductions: 0,
          total_deductions: 455,
          net_pay: 2895,
          epf_employer: 390,
          socso_employer: 30,
          notes: null,
        }],
        error: null,
      },
      {
        data: [{ id: 'profile-1', name: 'Aisyah', employee_id: 'employee-1' }],
        error: null,
      },
    );

    const result = await listPayrollItems('run-1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'item-1',
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
    });
    expect(inCalls).toEqual(expect.arrayContaining([
      { table: 'profiles', column: 'id', values: ['profile-1'] },
    ]));
  });
});

describe('createPayrollRun', () => {
  it('bootstraps a payroll approval workflow when an active flow exists', async () => {
    queueResolves(
      {
        data: {
          id: 'run-1',
          company_id: 'c1',
          period_year: 2026,
          period_month: 4,
          status: 'draft',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
        error: null,
      },
      { data: [{ id: 'flow-1' }], error: null },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'Finance Review',
          approver_type: 'role',
          approver_role: 'company_admin',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
    );

    const result = await createPayrollRun('c1', 2026, 4, 'admin-1');

    expect(result.error).toBeNull();
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'payroll_runs',
      values: expect.objectContaining({
        company_id: 'c1',
        period_year: 2026,
        period_month: 4,
      }),
    }));
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({
        entity_type: 'payroll_run',
        entity_id: 'run-1',
        current_step_name: 'Finance Review',
      }),
    }));
  });
});

describe('updatePayrollRunStatus', () => {
  it('blocks direct finalisation when an approval workflow exists', async () => {
    queueResolves(
      { data: { status: 'draft' }, error: null },
      { data: { id: 'ai-1' }, error: null },
    );

    const result = await updatePayrollRunStatus('run-1', 'finalised');

    expect(result.error).toMatch(/approval workflow/i);
  });
});

describe('reviewPayrollRunFinalisation', () => {
  it('finalises the payroll run on the last approval step', async () => {
    queueResolves(
      { data: { status: 'draft', created_by: 'admin-1' }, error: null },
      { data: { role: 'company_admin' }, error: null },
      {
        data: {
          id: 'ai-1',
          flow_id: 'flow-1',
          requester_id: 'admin-1',
          status: 'pending',
          current_step_id: 'step-1',
          current_step_order: 1,
          current_step_name: 'Finance Review',
          current_approver_role: 'company_admin',
          current_approver_user_id: null,
        },
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'Finance Review',
          approver_type: 'role',
          approver_role: 'company_admin',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await reviewPayrollRunFinalisation('run-1', 'admin-2', 'approved', 'Approved');

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({ status: 'approved' }),
    }));
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'payroll_runs',
      values: expect.objectContaining({ status: 'finalised' }),
    }));
  });

  it('marks the payroll approval as rejected without finalising the run', async () => {
    queueResolves(
      { data: { status: 'draft', created_by: 'admin-1' }, error: null },
      { data: { role: 'company_admin' }, error: null },
      {
        data: {
          id: 'ai-1',
          flow_id: 'flow-1',
          requester_id: 'admin-1',
          status: 'pending',
          current_step_id: 'step-1',
          current_step_order: 1,
          current_step_name: 'Finance Review',
          current_approver_role: 'company_admin',
          current_approver_user_id: null,
        },
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'Finance Review',
          approver_type: 'role',
          approver_role: 'company_admin',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await reviewPayrollRunFinalisation('run-1', 'admin-2', 'rejected', 'Need corrections');

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({ status: 'rejected' }),
    }));
    expect(updateCalls.find(call => call.table === 'payroll_runs')).toBeUndefined();
  });
});

describe('resubmitPayrollRunFinalisation', () => {
  it('resubmits a rejected payroll approval to the first configured step', async () => {
    queueResolves(
      { data: { status: 'draft', created_by: 'admin-1' }, error: null },
      {
        data: {
          id: 'ai-1',
          flow_id: 'flow-1',
          requester_id: 'admin-1',
          status: 'rejected',
        },
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'GM Review',
          approver_type: 'role',
          approver_role: 'general_manager',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
    );

    const result = await resubmitPayrollRunFinalisation('run-1', 'admin-1');

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({
        status: 'pending',
        current_step_id: 'step-1',
        current_step_name: 'GM Review',
        current_approver_role: 'general_manager',
      }),
    }));
  });
});

describe('listAppraisals', () => {
  it('hydrates approval history when requested', async () => {
    queueResolves(
      {
        data: [{
          id: 'app-1',
          company_id: 'c1',
          title: 'Annual Review 2026',
          cycle: 'annual',
          period_start: '2026-01-01',
          period_end: '2026-12-31',
          status: 'in_progress',
          created_by: 'manager-1',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{
          id: 'ai-1',
          entity_id: 'app-1',
          status: 'pending',
          current_step_order: 1,
          current_step_name: 'GM Review',
          current_approver_role: 'general_manager',
          current_approver_user_id: null,
        }],
        error: null,
      },
      {
        data: [{
          id: 'decision-1',
          instance_id: 'ai-1',
          step_id: 'step-1',
          step_order: 1,
          approver_id: 'gm-1',
          decision: 'approved',
          note: 'Cycle structure looks good',
          decided_at: '2026-04-02T09:00:00.000Z',
          created_at: '2026-04-02T09:00:00.000Z',
          approver: { name: 'Farah Isa' },
          step: { name: 'GM Review' },
        }],
        error: null,
      },
    );

    const result = await listAppraisals('c1', { includeApprovalHistory: true });

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'app-1',
      approvalInstanceId: 'ai-1',
      approvalInstanceStatus: 'pending',
      currentApprovalStepName: 'GM Review',
      approvalHistory: [{
        id: 'decision-1',
        decision: 'approved',
        approverName: 'Farah Isa',
        stepName: 'GM Review',
      }],
    });
  });
});

describe('createAppraisal', () => {
  it('bootstraps an appraisal approval instance when an active flow exists', async () => {
    queueResolves(
      { data: [{ id: 'flow-1' }], error: null },
      {
        data: {
          id: 'app-1',
          company_id: 'c1',
          title: 'Annual Review 2026',
          cycle: 'annual',
          period_start: '2026-01-01',
          period_end: '2026-12-31',
          status: 'in_progress',
          created_by: 'manager-1',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
        error: null,
      },
      { data: [{ id: 'flow-1' }], error: null },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'GM Review',
          approver_type: 'role',
          approver_role: 'general_manager',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
    );

    const result = await createAppraisal('c1', {
      title: 'Annual Review 2026',
      cycle: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    }, 'manager-1');

    expect(result.error).toBeNull();
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'appraisals',
      values: expect.objectContaining({
        title: 'Annual Review 2026',
        status: 'in_progress',
      }),
    }));
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({
        entity_type: 'appraisal',
        entity_id: 'app-1',
        current_step_name: 'GM Review',
      }),
    }));
  });

  it('seeds appraisal items immediately when no activation approval flow exists', async () => {
    queueResolves(
      { data: [], error: null },
      {
        data: {
          id: 'app-1',
          company_id: 'c1',
          title: 'Probation Review 2026',
          cycle: 'probation',
          period_start: '2026-04-01',
          period_end: '2026-06-30',
          status: 'open',
          created_by: 'manager-1',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
        error: null,
      },
      { data: [], error: null },
      {
        data: [
          { id: 'emp-1', manager_employee_id: 'manager-employee-2', status: 'active' },
          { id: 'emp-2', manager_employee_id: null, status: 'active' },
        ],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{ id: 'manager-2', employee_id: 'manager-employee-2' }],
        error: null,
      },
      { data: null, error: null },
    );

    const result = await createAppraisal('c1', {
      title: 'Probation Review 2026',
      cycle: 'probation',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    }, 'manager-1');

    expect(result.error).toBeNull();
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: [
        expect.objectContaining({ appraisal_id: 'app-1', employee_id: 'emp-1', reviewer_id: 'manager-2' }),
        expect.objectContaining({ appraisal_id: 'app-1', employee_id: 'emp-2', reviewer_id: 'manager-1' }),
      ],
    }));
  });
});

describe('reviewAppraisalActivation', () => {
  it('opens the appraisal cycle when the last approval step is approved', async () => {
    queueResolves(
      { data: { status: 'in_progress', created_by: 'manager-1', company_id: 'c1' }, error: null },
      { data: { role: 'general_manager' }, error: null },
      {
        data: {
          id: 'ai-1',
          flow_id: 'flow-1',
          requester_id: 'manager-1',
          status: 'pending',
          current_step_id: 'step-1',
          current_step_order: 1,
          current_step_name: 'GM Review',
          current_approver_role: 'general_manager',
          current_approver_user_id: null,
        },
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'GM Review',
          approver_type: 'role',
          approver_role: 'general_manager',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: [], error: null },
      {
        data: [
          { id: 'emp-1', manager_employee_id: 'manager-employee-2', status: 'active' },
          { id: 'emp-2', manager_employee_id: null, status: 'active' },
        ],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{ id: 'manager-2', employee_id: 'manager-employee-2' }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await reviewAppraisalActivation('app-1', 'gm-1', 'approved', 'Launch the cycle');

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({ status: 'approved' }),
    }));
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisals',
      values: expect.objectContaining({ status: 'open' }),
    }));
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: [
        expect.objectContaining({ appraisal_id: 'app-1', employee_id: 'emp-1', reviewer_id: 'manager-2' }),
        expect.objectContaining({ appraisal_id: 'app-1', employee_id: 'emp-2', reviewer_id: 'gm-1' }),
      ],
    }));
  });

  it('marks the appraisal approval as rejected without opening the cycle', async () => {
    queueResolves(
      { data: { status: 'in_progress', created_by: 'manager-1' }, error: null },
      { data: { role: 'company_admin' }, error: null },
      {
        data: {
          id: 'ai-1',
          flow_id: 'flow-1',
          requester_id: 'manager-1',
          status: 'pending',
          current_step_id: 'step-1',
          current_step_order: 1,
          current_step_name: 'HR Review',
          current_approver_role: 'company_admin',
          current_approver_user_id: null,
        },
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'HR Review',
          approver_type: 'role',
          approver_role: 'company_admin',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await reviewAppraisalActivation('app-1', 'admin-2', 'rejected', 'Adjust the cycle scope');

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({ status: 'rejected' }),
    }));
    const appraisalUpdate = updateCalls.find(call => call.table === 'appraisals');
    expect(appraisalUpdate).toBeDefined();
    expect(appraisalUpdate?.values).not.toHaveProperty('status');
  });
});

describe('resubmitAppraisalActivation', () => {
  it('resubmits a rejected appraisal approval to the first configured step', async () => {
    queueResolves(
      { data: { status: 'in_progress', created_by: 'manager-1' }, error: null },
      {
        data: {
          id: 'ai-1',
          flow_id: 'flow-1',
          requester_id: 'manager-1',
          status: 'rejected',
        },
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          step_order: 1,
          name: 'GM Review',
          approver_type: 'role',
          approver_role: 'general_manager',
          approver_user_id: null,
          allow_self_approval: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await resubmitAppraisalActivation('app-1', 'manager-1');

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'approval_instances',
      values: expect.objectContaining({
        status: 'pending',
        current_step_id: 'step-1',
        current_step_name: 'GM Review',
        current_approver_role: 'general_manager',
      }),
    }));
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisals',
      values: expect.objectContaining({}),
    }));
  });
});

describe('listAppraisalItems', () => {
  it('backfills items for legacy open appraisal cycles that do not have seeded items yet', async () => {
    queueResolves(
      { data: [], error: null },
      {
        data: { company_id: 'c1', created_by: 'manager-1', status: 'open' },
        error: null,
      },
      { data: [], error: null },
      {
        data: [
          { id: 'employee-1', manager_employee_id: 'manager-employee-2', status: 'active' },
        ],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{ id: 'manager-2', employee_id: 'manager-employee-2' }],
        error: null,
      },
      { data: null, error: null },
      {
        data: [{
          id: 'item-1',
          appraisal_id: 'app-1',
          employee_id: 'employee-1',
          reviewer_id: 'manager-2',
          rating: null,
          goals: null,
          achievements: null,
          areas_to_improve: null,
          reviewer_comments: null,
          employee_comments: null,
          status: 'pending',
          reviewed_at: null,
          reviewer: { name: 'Nur Manager' },
        }],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{ id: 'employee-1', name: 'Aisyah Rahman' }],
        error: null,
      },
    );

    const result = await listAppraisalItems('app-1');

    expect(result.error).toBeNull();
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: [expect.objectContaining({ appraisal_id: 'app-1', employee_id: 'employee-1', reviewer_id: 'manager-2' })],
    }));
    expect(result.data[0]).toMatchObject({
      id: 'item-1',
      employeeId: 'employee-1',
      reviewerId: 'manager-2',
      status: 'pending',
    });
  });

  it('normalises profile-backed appraisal items onto the linked employee identity', async () => {
    queueResolves(
      {
        data: [{
          id: 'item-1',
          appraisal_id: 'app-1',
          employee_id: 'profile-1',
          reviewer_id: 'manager-1',
          rating: null,
          goals: null,
          achievements: null,
          areas_to_improve: null,
          reviewer_comments: null,
          employee_comments: null,
          status: 'pending',
          reviewed_at: null,
          reviewer: { name: 'Nur Manager' },
        }],
        error: null,
      },
      {
        data: [{ id: 'profile-1', name: 'Aisyah Rahman', employee_id: 'employee-1' }],
        error: null,
      },
    );

    const result = await listAppraisalItems('app-1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      employeeId: 'employee-1',
      employeeName: 'Aisyah Rahman',
      reviewerName: 'Nur Manager',
    });
  });
});

describe('submitAppraisalSelfReview', () => {
  it('accepts a linked employee ID for a legacy profile-backed appraisal item', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1', employee_id: 'employee-1' }, error: null },
      { data: { id: 'profile-1' }, error: null },
      {
        data: {
          id: 'item-1',
          appraisal_id: 'app-1',
          employee_id: 'profile-1',
          reviewer_id: 'manager-1',
          rating: null,
          goals: null,
          achievements: null,
          areas_to_improve: null,
          reviewer_comments: null,
          employee_comments: null,
          status: 'pending',
          reviewed_at: null,
        },
        error: null,
      },
      { data: { status: 'open' }, error: null },
      { data: null, error: null },
    );

    const result = await submitAppraisalSelfReview('item-1', 'employee-1', {
      goals: 'Improve leadership',
      achievements: 'Closed major project',
      areasToImprove: 'Delegation',
      employeeComments: 'Ready for next step',
    });

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: expect.objectContaining({
        status: 'self_reviewed',
        goals: 'Improve leadership',
      }),
    }));
  });

  it('accepts a linked employee ID when the appraisal item owner is stored as an employee id', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1', employee_id: 'employee-1' }, error: null },
      { data: { id: 'profile-1' }, error: null },
      {
        data: {
          id: 'item-1',
          appraisal_id: 'app-1',
          employee_id: 'employee-1',
          reviewer_id: 'manager-1',
          rating: null,
          goals: null,
          achievements: null,
          areas_to_improve: null,
          reviewer_comments: null,
          employee_comments: null,
          status: 'pending',
          reviewed_at: null,
        },
        error: null,
      },
      { data: { status: 'open' }, error: null },
      { data: null, error: null },
    );

    const result = await submitAppraisalSelfReview('item-1', 'employee-1', {
      goals: 'Improve leadership',
      achievements: 'Closed major project',
      areasToImprove: 'Delegation',
      employeeComments: 'Ready for next step',
    });

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: expect.objectContaining({
        status: 'self_reviewed',
        goals: 'Improve leadership',
      }),
    }));
  });

  it('moves an assigned item to self_reviewed for the employee', async () => {
    queueResolves(
      { data: { id: 'emp-1', employee_id: 'employee-1' }, error: null },
      { data: { id: 'emp-1' }, error: null },
      {
        data: {
          id: 'item-1',
          appraisal_id: 'app-1',
          employee_id: 'emp-1',
          reviewer_id: 'manager-1',
          rating: null,
          goals: null,
          achievements: null,
          areas_to_improve: null,
          reviewer_comments: null,
          employee_comments: null,
          status: 'pending',
          reviewed_at: null,
        },
        error: null,
      },
      { data: { status: 'open' }, error: null },
      { data: null, error: null },
    );

    const result = await submitAppraisalSelfReview('item-1', 'emp-1', {
      goals: 'Improve leadership',
      achievements: 'Closed major project',
      areasToImprove: 'Delegation',
      employeeComments: 'Ready for next step',
    });

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: expect.objectContaining({
        status: 'self_reviewed',
        goals: 'Improve leadership',
        achievements: 'Closed major project',
        areas_to_improve: 'Delegation',
        employee_comments: 'Ready for next step',
      }),
    }));
  });
});

describe('reviewAppraisalItem', () => {
  it('records manager review after self review is submitted', async () => {
    queueResolves(
      {
        data: {
          id: 'item-1',
          appraisal_id: 'app-1',
          employee_id: 'emp-1',
          reviewer_id: 'manager-1',
          rating: null,
          goals: 'Improve leadership',
          achievements: 'Closed major project',
          areas_to_improve: 'Delegation',
          reviewer_comments: null,
          employee_comments: 'Ready for next step',
          status: 'self_reviewed',
          reviewed_at: null,
        },
        error: null,
      },
      { data: { status: 'open' }, error: null },
      { data: null, error: null },
    );

    const result = await reviewAppraisalItem('item-1', 'manager-1', {
      rating: 4,
      reviewerComments: 'Strong delivery this cycle',
    });

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: expect.objectContaining({
        status: 'reviewed',
        rating: 4,
        reviewer_comments: 'Strong delivery this cycle',
      }),
    }));
  });
});

describe('acknowledgeAppraisalItem', () => {
  it('acknowledges the review and completes the appraisal when all items are done', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1', employee_id: 'employee-1' }, error: null },
      { data: { id: 'profile-1' }, error: null },
      {
        data: {
          id: 'item-1',
          appraisal_id: 'app-1',
          employee_id: 'employee-1',
          reviewer_id: 'manager-1',
          rating: 4,
          goals: 'Improve leadership',
          achievements: 'Closed major project',
          areas_to_improve: 'Delegation',
          reviewer_comments: 'Strong delivery this cycle',
          employee_comments: 'Ready for next step',
          status: 'reviewed',
          reviewed_at: '2026-04-03T09:00:00.000Z',
        },
        error: null,
      },
      { data: { status: 'open' }, error: null },
      { data: null, error: null },
      {
        data: [{ status: 'acknowledged' }, { status: 'acknowledged' }],
        error: null,
      },
      { data: null, error: null },
    );

    const result = await acknowledgeAppraisalItem('item-1', 'employee-1', 'Acknowledged and aligned');

    expect(result.error).toBeNull();
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisal_items',
      values: expect.objectContaining({
        status: 'acknowledged',
        employee_comments: 'Acknowledged and aligned',
      }),
    }));
    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: 'appraisals',
      values: expect.objectContaining({ status: 'completed' }),
    }));
  });
});

describe('createEmployeeSchema', () => {
  it('rejects missing staffCode', () => {
    const result = createEmployeeSchema.safeParse({ name: 'Alice', role: 'sales', joinDate: '2024-01-01' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed IC', () => {
    const result = createEmployeeSchema.safeParse({
      staffCode: 'E001',
      name: 'Alice',
      role: 'sales',
      joinDate: '2024-01-01',
      ic: '12345-67-8901',
    });
    expect(result.success).toBe(false);
  });

  it('accepts well-formed IC', () => {
    const result = createEmployeeSchema.safeParse({
      staffCode: 'E001',
      name: 'Alice',
      role: 'sales',
      joinDate: '2024-01-01',
      ic: '900101-14-1234',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createEmployeeSchema.safeParse({
      staffCode: 'E001',
      name: 'A',
      role: 'sales',
      joinDate: '2024-01-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('createLeaveRequestSchema', () => {
  it('rejects endDate before startDate', () => {
    const result = createLeaveRequestSchema.safeParse({
      leaveTypeId: 'lt-1',
      startDate: '2024-03-15',
      endDate: '2024-03-10',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].message).toMatch(/on or after/i);
  });

  it('accepts equal start and end date', () => {
    const result = createLeaveRequestSchema.safeParse({
      leaveTypeId: 'lt-1',
      startDate: '2024-03-10',
      endDate: '2024-03-10',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid date range', () => {
    const result = createLeaveRequestSchema.safeParse({
      leaveTypeId: 'lt-1',
      startDate: '2024-03-10',
      endDate: '2024-03-15',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing leaveTypeId', () => {
    const result = createLeaveRequestSchema.safeParse({
      startDate: '2024-03-10',
      endDate: '2024-03-15',
    });
    expect(result.success).toBe(false);
  });
});

describe('upsertAttendanceSchema', () => {
  it('rejects negative hoursWorked', () => {
    const result = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1',
      date: '2024-03-10',
      status: 'present',
      hoursWorked: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects hoursWorked > 24', () => {
    const result = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1',
      date: '2024-03-10',
      status: 'present',
      hoursWorked: 25,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid attendance record', () => {
    const result = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1',
      date: '2024-03-10',
      status: 'present',
      hoursWorked: 8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid clock time format', () => {
    const result = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1',
      date: '2024-03-10',
      status: 'present',
      clockIn: '9:00',
    });
    expect(result.success).toBe(false);
  });
});
