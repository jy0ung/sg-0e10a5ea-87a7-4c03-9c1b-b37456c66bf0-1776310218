import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as hrmsServicesMock from '@flc/hrms-services';

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
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    },
  };
});

vi.mock('@/services/auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@flc/hrms-services', () => ({
  createLeaveRequest: vi.fn().mockResolvedValue('leave-1'),
  listLeaveTypes: vi.fn().mockResolvedValue([]),
  listLeaveBalances: vi.fn().mockResolvedValue([]),
  listLeaveHolidays: vi.fn().mockResolvedValue([]),
  getLeaveEmployeeInfo: vi.fn().mockResolvedValue(null),
  getLeaveApprovalPreview: vi.fn().mockResolvedValue(null),
  listLeaveRequests: vi.fn().mockResolvedValue([]),
  reviewLeaveRequest: vi.fn().mockResolvedValue(undefined),
  listPayrollRuns: vi.fn().mockResolvedValue([]),
  createPayrollRun: vi.fn().mockResolvedValue({ id: 'run-new', companyId: 'c1', periodYear: 2026, periodMonth: 4, status: 'draft', totalHeadcount: 0, totalGross: 0, totalNet: 0, createdAt: '', updatedAt: '' }),
  updatePayrollRunStatus: vi.fn().mockResolvedValue(undefined),
  reviewPayrollRunFinalisation: vi.fn().mockResolvedValue(undefined),
  resubmitPayrollRunFinalisation: vi.fn().mockResolvedValue(undefined),
  listPayrollItems: vi.fn().mockResolvedValue([]),
  getMyPayslips: vi.fn().mockResolvedValue([]),
  listAppraisals: vi.fn().mockResolvedValue([]),
  createAppraisal: vi.fn().mockResolvedValue(undefined),
  reviewAppraisalActivation: vi.fn().mockResolvedValue(undefined),
  resubmitAppraisalActivation: vi.fn().mockResolvedValue(undefined),
  listAppraisalItems: vi.fn().mockResolvedValue([]),
  submitAppraisalSelfReview: vi.fn().mockResolvedValue(undefined),
  reviewAppraisalItem: vi.fn().mockResolvedValue(undefined),
  acknowledgeAppraisalItem: vi.fn().mockResolvedValue(undefined),
  createAppraisalItem: vi.fn().mockResolvedValue(undefined),
  updateAppraisalItem: vi.fn().mockResolvedValue(undefined),
  deleteAppraisalItem: vi.fn().mockResolvedValue(undefined),
  listAnnouncements: vi.fn().mockResolvedValue([]),
  createAnnouncement: vi.fn().mockResolvedValue({ id: 'ann-new' }),
  deleteAnnouncement: vi.fn().mockResolvedValue(undefined),
  listAttendanceRecords: vi.fn().mockResolvedValue([]),
  upsertAttendance: vi.fn().mockResolvedValue(undefined),
  listEmployeeDirectory: vi.fn().mockResolvedValue([]),
  updateEmployee: vi.fn().mockResolvedValue(undefined),
  resolveNamesToIds: vi.fn().mockResolvedValue(new Map()),
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
  listLeaveBalances,
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
  updateEmployee,
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
    vi.mocked(hrmsServicesMock.listEmployeeDirectory).mockResolvedValueOnce([{
      id: 'emp-dir-1',
      companyId: 'c1',
      branchId: 'b1',
      managerId: 'mgr-1',
      role: 'manager' as const,
      status: 'active' as const,
      staffCode: 'EMP001',
      name: 'Maya',
      workEmail: 'maya@company.com',
      icNo: '900101-12-1234',
      contactNo: '0123456789',
      joinDate: '2026-04-01',
      departmentId: 'dept-1',
      jobTitleId: 'jt-1',
      departmentName: 'HR',
      jobTitleName: 'Manager',
    } as any]);

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

  it('surfaces an error when the workforce schema is unavailable', async () => {
    vi.mocked(hrmsServicesMock.listEmployeeDirectory).mockRejectedValueOnce(new Error('relation "employees" does not exist'));

    const result = await listEmployeeDirectory('c1');

    expect(result.error).toBe('relation "employees" does not exist');
    expect(result.data).toEqual([]);
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

  it('surfaces an error when workforce employee creation is unavailable', async () => {
    queueResolves({ data: null, error: { message: 'relation "employees" does not exist' } });

    const result = await createEmployee({
      id: 'legacy-1',
      email: 'legacy@company.com',
      name: 'Legacy Employee',
      role: 'analyst',
      companyId: 'c1',
      staffCode: 'LG001',
    }, 'actor-1');

    expect(result.error).toBe('relation "employees" does not exist');
    expect(insertCalls).toEqual([
      {
        table: 'employees',
        values: expect.objectContaining({
          id: 'legacy-1',
          primary_role: 'analyst',
        }),
      },
    ]);
  });

  it('surfaces an error when workforce employee updates are unavailable', async () => {
    vi.mocked(hrmsServicesMock.updateEmployee).mockRejectedValueOnce(new Error('relation "employees" does not exist'));

    const result = await updateEmployee('emp-1', { status: 'inactive' }, 'actor-1');

    expect(result.error).toBe('relation "employees" does not exist');
  });
});

describe('listLeaveRequests', () => {
  it('filters leave balances by workforce employee id', async () => {
    vi.mocked(hrmsServicesMock.listLeaveBalances).mockResolvedValueOnce([{
      id: 'balance-1',
      employeeId: 'employee-1',
      leaveTypeId: 'lt-1',
      year: 2026,
      entitledDays: 14,
      usedDays: 4,
      remainingDays: 10,
    } as any]);

    const result = await listLeaveBalances('employee-1', 2026);

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      employeeId: 'employee-1',
      remainingDays: 10,
    });
  });

  it('filters leave requests by workforce employee id', async () => {
    vi.mocked(hrmsServicesMock.listLeaveRequests).mockResolvedValueOnce([]);

    const result = await listLeaveRequests('c1', { employeeId: 'employee-1' });

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.listLeaveRequests).toHaveBeenCalledWith('c1', expect.objectContaining({ employeeId: 'employee-1' }));
  });

  it('hydrates employee names from workforce leave rows', async () => {
    vi.mocked(hrmsServicesMock.listLeaveRequests).mockResolvedValueOnce([{
      id: 'leave-1',
      companyId: 'c1',
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
      leaveTypeId: 'lt-1',
      startDate: '2026-04-10',
      endDate: '2026-04-12',
      days: 3,
      status: 'approved' as const,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    } as any]);

    const result = await listLeaveRequests('c1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
    });
  });

  it('surfaces workforce employee lookup errors while hydrating leave rows', async () => {
    vi.mocked(hrmsServicesMock.listLeaveRequests).mockRejectedValueOnce(new Error('relation "employees" does not exist'));

    const result = await listLeaveRequests('c1');

    expect(result.data).toEqual([]);
    expect(result.error).toBe('relation "employees" does not exist');
  });

  it('hydrates approval history when requested', async () => {
    vi.mocked(hrmsServicesMock.listLeaveRequests).mockResolvedValueOnce([{
      id: 'leave-1',
      companyId: 'c1',
      employeeId: 'emp-1',
      leaveTypeId: 'lt-1',
      startDate: '2026-04-10',
      endDate: '2026-04-12',
      days: 3,
      status: 'pending' as const,
      approvalInstanceId: 'ai-1',
      currentApprovalStepName: 'Manager Review',
      approvalHistory: [{
        id: 'decision-1',
        decision: 'approved',
        approverName: 'Nur Aina',
        stepName: 'Manager Review',
      }],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    } as any]);

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
    // Wrapper direct Supabase calls: leave_requests, profiles (reviewer role), approval_instances (null),
    // then resolveRequiredProfileId (profiles.id check → null, profiles.employee_id check → profile-1)
    queueResolves(
      { data: { employee_id: 'employee-1', company_id: 'c1' }, error: null },
      { data: { role: 'manager' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: 'profile-1' }, error: null },
    );

    const result = await reviewLeaveRequest('leave-1', 'profile-1', 'approved', 'Approved');

    expect(result.error).toBe('You cannot approve or reject your own leave request.');
  });

  it('finalises the leave request on the last approval step', async () => {
    // Wrapper direct Supabase calls: leave_requests, profiles (reviewer role), approval_instances (instance found)
    // Then delegates to pkg.reviewLeaveRequest
    queueResolves(
      { data: { employee_id: 'emp-1', company_id: 'c1' }, error: null },
      { data: { role: 'general_manager' }, error: null },
      { data: { id: 'ai-1' }, error: null },
    );
    vi.mocked(hrmsServicesMock.reviewLeaveRequest).mockResolvedValueOnce(undefined);

    const result = await reviewLeaveRequest('leave-1', 'gm-1', 'approved', 'Approved');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.reviewLeaveRequest).toHaveBeenCalledWith({
      requestId: 'leave-1',
      reviewerId: 'gm-1',
      reviewerRole: 'general_manager',
      decision: 'approved',
      note: 'Approved',
    });
  });
});

describe('listAttendanceRecords', () => {
  it('filters attendance by workforce employee id and still hydrates the employee name', async () => {
    vi.mocked(hrmsServicesMock.listAttendanceRecords).mockResolvedValueOnce([{
      id: 'att-1',
      companyId: 'c1',
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
      date: '2026-04-10',
      clockIn: '09:00:00',
      clockOut: '18:00:00',
      hoursWorked: 8,
      status: 'present' as const,
    } as any]);

    const result = await listAttendanceRecords('c1', { employeeId: 'employee-1' });

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.listAttendanceRecords).toHaveBeenCalledWith('c1', expect.objectContaining({ employeeId: 'employee-1' }));
    expect(result.data[0]).toMatchObject({
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
    });
  });
});

describe('upsertAttendance', () => {
  it('surfaces an error when attendance ownership rejects employee ids', async () => {
    vi.mocked(hrmsServicesMock.upsertAttendance).mockRejectedValueOnce(new Error('violates foreign key constraint "attendance_records_employee_id_fkey"'));

    const result = await upsertAttendance('c1', {
      employeeId: 'employee-1',
      date: '2026-04-10',
      status: 'present',
      clockIn: '09:00',
    });

    expect(result.error).toBe('violates foreign key constraint "attendance_records_employee_id_fkey"');
  });
});

describe('listPayrollRuns', () => {
  it('hydrates approval history when requested', async () => {
    vi.mocked(hrmsServicesMock.listPayrollRuns).mockResolvedValueOnce([{
      id: 'run-1',
      companyId: 'c1',
      periodYear: 2026,
      periodMonth: 4,
      status: 'draft' as const,
      approvalInstanceId: 'ai-1',
      approvalInstanceStatus: 'pending' as const,
      currentApprovalStepOrder: 1,
      currentApprovalStepName: 'Finance Review',
      currentApproverRole: 'company_admin',
      approvalHistory: [{
        id: 'decision-1',
        instanceId: 'ai-1',
        stepOrder: 1,
        approverId: 'admin-2',
        decision: 'approved' as const,
        note: 'Numbers look right',
        approverName: 'Finance Lead',
        stepName: 'Finance Review',
        decidedAt: '2026-04-02T09:00:00.000Z',
        createdAt: '2026-04-02T09:00:00.000Z',
      }],
      totalHeadcount: 10,
      totalGross: 10000,
      totalNet: 9000,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    } as any]);

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
  it('hydrates employee names from workforce payroll items', async () => {
    vi.mocked(hrmsServicesMock.listPayrollItems).mockResolvedValueOnce([{
      id: 'item-1',
      payrollRunId: 'run-1',
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
      basicSalary: 3000,
      allowances: 200,
      overtime: 150,
      grossPay: 3350,
      epfEmployee: 330,
      socsoEmployee: 25,
      incomeTax: 100,
      otherDeductions: 0,
      totalDeductions: 455,
      netPay: 2895,
      epfEmployer: 390,
      socsoEmployer: 30,
    } as any]);

    const result = await listPayrollItems('run-1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'item-1',
      employeeId: 'employee-1',
      employeeName: 'Aisyah',
    });
  });
});

describe('createPayrollRun', () => {
  it('bootstraps a payroll approval workflow when an active flow exists', async () => {
    vi.mocked(hrmsServicesMock.createPayrollRun).mockResolvedValueOnce({
      id: 'run-1',
      companyId: 'c1',
      periodYear: 2026,
      periodMonth: 4,
      status: 'draft' as const,
      totalHeadcount: 0,
      totalGross: 0,
      totalNet: 0,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    } as any);

    const result = await createPayrollRun('c1', 2026, 4, 'admin-1');

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('run-1');
    expect(hrmsServicesMock.createPayrollRun).toHaveBeenCalledWith('c1', 2026, 4, 'admin-1');
  });
});

describe('updatePayrollRunStatus', () => {
  it('blocks direct finalisation when an approval workflow exists', async () => {
    vi.mocked(hrmsServicesMock.updatePayrollRunStatus).mockRejectedValueOnce(new Error('Payroll finalisation is controlled by the approval workflow for this run.'));

    const result = await updatePayrollRunStatus('run-1', 'finalised');

    expect(result.error).toMatch(/approval workflow/i);
  });
});

describe('reviewPayrollRunFinalisation', () => {
  it('finalises the payroll run on the last approval step', async () => {
    // Wrapper fetches reviewer role from profiles before delegating to pkg
    queueResolves(
      { data: { role: 'company_admin' }, error: null },
    );
    vi.mocked(hrmsServicesMock.reviewPayrollRunFinalisation).mockResolvedValueOnce(undefined);

    const result = await reviewPayrollRunFinalisation('run-1', 'admin-2', 'approved', 'Approved');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.reviewPayrollRunFinalisation).toHaveBeenCalledWith({
      runId: 'run-1',
      reviewerId: 'admin-2',
      reviewerRole: 'company_admin',
      decision: 'approved',
      note: 'Approved',
    });
  });

  it('marks the payroll approval as rejected without finalising the run', async () => {
    queueResolves(
      { data: { role: 'company_admin' }, error: null },
    );
    vi.mocked(hrmsServicesMock.reviewPayrollRunFinalisation).mockResolvedValueOnce(undefined);

    const result = await reviewPayrollRunFinalisation('run-1', 'admin-2', 'rejected', 'Need corrections');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.reviewPayrollRunFinalisation).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'rejected' }),
    );
  });
});

describe('resubmitPayrollRunFinalisation', () => {
  it('resubmits a rejected payroll approval to the first configured step', async () => {
    vi.mocked(hrmsServicesMock.resubmitPayrollRunFinalisation).mockResolvedValueOnce(undefined);

    const result = await resubmitPayrollRunFinalisation('run-1', 'admin-1');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.resubmitPayrollRunFinalisation).toHaveBeenCalledWith('run-1', 'admin-1');
  });
});

describe('listAppraisals', () => {
  it('hydrates approval history when requested', async () => {
    vi.mocked(hrmsServicesMock.listAppraisals).mockResolvedValueOnce([{
      id: 'app-1',
      companyId: 'c1',
      title: 'Annual Review 2026',
      cycle: 'annual' as const,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      status: 'in_progress' as const,
      approvalInstanceId: 'ai-1',
      approvalInstanceStatus: 'pending' as const,
      currentApprovalStepName: 'GM Review',
      approvalHistory: [{
        id: 'decision-1',
        decision: 'approved' as const,
        approverName: 'Farah Isa',
        stepName: 'GM Review',
        instanceId: 'ai-1',
        stepOrder: 1,
        approverId: 'gm-1',
        decidedAt: '2026-04-02T09:00:00.000Z',
        createdAt: '2026-04-02T09:00:00.000Z',
      }],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    } as any]);

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
    vi.mocked(hrmsServicesMock.createAppraisal).mockResolvedValueOnce(undefined);

    const result = await createAppraisal('c1', {
      title: 'Annual Review 2026',
      cycle: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    }, 'manager-1');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.createAppraisal).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Annual Review 2026' }), 'manager-1');
  });

  it('routes direct-manager appraisal approvals from the workforce reporting line', async () => {
    vi.mocked(hrmsServicesMock.createAppraisal).mockResolvedValueOnce(undefined);

    const result = await createAppraisal('c1', {
      title: 'Quarterly Review 2026',
      cycle: 'quarterly',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    }, 'manager-1');

    expect(result.error).toBeNull();
  });

  it('requires workforce employee links for direct-manager appraisal approvals', async () => {
    vi.mocked(hrmsServicesMock.createAppraisal).mockRejectedValueOnce(
      new Error('The requester must be linked to a workforce employee for direct-manager approval routing.'),
    );

    const result = await createAppraisal('c1', {
      title: 'Quarterly Review 2026',
      cycle: 'quarterly',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    }, 'manager-1');

    expect(result.error).toBe('The requester must be linked to a workforce employee for direct-manager approval routing.');
  });

  it('seeds appraisal items immediately when no activation approval flow exists', async () => {
    vi.mocked(hrmsServicesMock.createAppraisal).mockResolvedValueOnce(undefined);

    const result = await createAppraisal('c1', {
      title: 'Probation Review 2026',
      cycle: 'probation',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    }, 'manager-1');

    expect(result.error).toBeNull();
  });

  it('surfaces reviewer profile lookup errors when seeding appraisal items', async () => {
    vi.mocked(hrmsServicesMock.createAppraisal).mockRejectedValueOnce(
      new Error('column profiles.employee_id does not exist'),
    );

    const result = await createAppraisal('c1', {
      title: 'Probation Review 2026',
      cycle: 'probation',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    }, 'manager-1');

    expect(result.error).toBe('column profiles.employee_id does not exist');
  });
});

describe('reviewAppraisalActivation', () => {
  it('opens the appraisal cycle when the last approval step is approved', async () => {
    // Wrapper fetches reviewer role from profiles before delegating
    queueResolves({ data: { role: 'general_manager' }, error: null });
    vi.mocked(hrmsServicesMock.reviewAppraisalActivation).mockResolvedValueOnce(undefined);

    const result = await reviewAppraisalActivation('app-1', 'gm-1', 'approved', 'Launch the cycle');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.reviewAppraisalActivation).toHaveBeenCalledWith({
      appraisalId: 'app-1',
      reviewerId: 'gm-1',
      reviewerRole: 'general_manager',
      decision: 'approved',
      note: 'Launch the cycle',
    });
  });

  it('marks the appraisal approval as rejected without opening the cycle', async () => {
    queueResolves({ data: { role: 'company_admin' }, error: null });
    vi.mocked(hrmsServicesMock.reviewAppraisalActivation).mockResolvedValueOnce(undefined);

    const result = await reviewAppraisalActivation('app-1', 'admin-2', 'rejected', 'Adjust the cycle scope');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.reviewAppraisalActivation).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'rejected' }),
    );
  });
});

describe('resubmitAppraisalActivation', () => {
  it('resubmits a rejected appraisal approval to the first configured step', async () => {
    vi.mocked(hrmsServicesMock.resubmitAppraisalActivation).mockResolvedValueOnce(undefined);

    const result = await resubmitAppraisalActivation('app-1', 'manager-1');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.resubmitAppraisalActivation).toHaveBeenCalledWith('app-1', 'manager-1');
  });
});

describe('listAppraisalItems', () => {
  it('backfills items for legacy open appraisal cycles that do not have seeded items yet', async () => {
    vi.mocked(hrmsServicesMock.listAppraisalItems).mockResolvedValueOnce([{
      id: 'item-1',
      appraisalId: 'app-1',
      employeeId: 'employee-1',
      reviewerId: 'manager-2',
      reviewerName: 'Nur Manager',
      status: 'pending' as const,
    } as any]);

    const result = await listAppraisalItems('app-1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'item-1',
      employeeId: 'employee-1',
      reviewerId: 'manager-2',
      status: 'pending',
    });
  });

  it('hydrates employee names from workforce appraisal items', async () => {
    vi.mocked(hrmsServicesMock.listAppraisalItems).mockResolvedValueOnce([{
      id: 'item-1',
      appraisalId: 'app-1',
      employeeId: 'employee-1',
      employeeName: 'Aisyah Rahman',
      reviewerId: 'manager-1',
      reviewerName: 'Nur Manager',
      status: 'pending' as const,
    } as any]);

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
  it('requires a linked profile for employee appraisal actions', async () => {
    vi.mocked(hrmsServicesMock.submitAppraisalSelfReview).mockRejectedValueOnce(
      new Error("No profile linked to employee 'employee-1'."),
    );

    const result = await submitAppraisalSelfReview('item-1', 'employee-1', {
      goals: 'Improve leadership',
      achievements: 'Closed major project',
      areasToImprove: 'Delegation',
      employeeComments: 'Ready for next step',
    });

    expect(result.error).toBe("No profile linked to employee 'employee-1'.");
  });

  it('rejects legacy profile-backed appraisal ownership', async () => {
    vi.mocked(hrmsServicesMock.submitAppraisalSelfReview).mockRejectedValueOnce(
      new Error('You can only submit your own appraisal self review.'),
    );

    const result = await submitAppraisalSelfReview('item-1', 'employee-1', {
      goals: 'Improve leadership',
      achievements: 'Closed major project',
      areasToImprove: 'Delegation',
      employeeComments: 'Ready for next step',
    });

    expect(result.error).toBe('You can only submit your own appraisal self review.');
  });

  it('accepts direct workforce ownership when the appraisal item owner is stored as an employee id', async () => {
    vi.mocked(hrmsServicesMock.submitAppraisalSelfReview).mockResolvedValueOnce(undefined);

    const result = await submitAppraisalSelfReview('item-1', 'employee-1', {
      goals: 'Improve leadership',
      achievements: 'Closed major project',
      areasToImprove: 'Delegation',
      employeeComments: 'Ready for next step',
    });

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.submitAppraisalSelfReview).toHaveBeenCalledWith('item-1', 'employee-1', expect.objectContaining({ goals: 'Improve leadership' }));
  });

  it('moves an assigned item to self_reviewed for the employee', async () => {
    vi.mocked(hrmsServicesMock.submitAppraisalSelfReview).mockResolvedValueOnce(undefined);

    const result = await submitAppraisalSelfReview('item-1', 'emp-1', {
      goals: 'Improve leadership',
      achievements: 'Closed major project',
      areasToImprove: 'Delegation',
      employeeComments: 'Ready for next step',
    });

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.submitAppraisalSelfReview).toHaveBeenCalledWith('item-1', 'emp-1', expect.objectContaining({ goals: 'Improve leadership' }));
  });
});

describe('reviewAppraisalItem', () => {
  it('records manager review after self review is submitted', async () => {
    vi.mocked(hrmsServicesMock.reviewAppraisalItem).mockResolvedValueOnce(undefined);

    const result = await reviewAppraisalItem('item-1', 'manager-1', {
      rating: 4,
      reviewerComments: 'Strong delivery this cycle',
    });

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.reviewAppraisalItem).toHaveBeenCalledWith('item-1', 'manager-1', expect.objectContaining({ rating: 4 }));
  });
});

describe('acknowledgeAppraisalItem', () => {
  it('acknowledges the review and completes the appraisal when all items are done', async () => {
    vi.mocked(hrmsServicesMock.acknowledgeAppraisalItem).mockResolvedValueOnce(undefined);

    const result = await acknowledgeAppraisalItem('item-1', 'employee-1', 'Acknowledged and aligned');

    expect(result.error).toBeNull();
    expect(hrmsServicesMock.acknowledgeAppraisalItem).toHaveBeenCalledWith('item-1', 'employee-1', 'Acknowledged and aligned');
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
      email: 'alice@company.com',
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
