import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const describeIfLive = process.env.RLS_E2E === '1' ? describe : describe.skip;
const companyId = process.env.RLS_COMPANY_A_ID ?? 'rls-a';

function clientOptions(): Parameters<typeof createClient>[2] {
  return {
    auth: { persistSession: false, storageKey: 'employee-history-delete-admin' },
    realtime: { transport: WebSocket as never },
  };
}

describeIfLive('Employee history hard-delete safety', () => {
  let admin: SupabaseClient;
  let leaveTypeId: string;
  let payrollRunId: string;
  let appraisalId: string;

  const employeeIds: string[] = [];

  async function createEmployee(label: string): Promise<string> {
    const { data, error } = await admin
      .from('employees')
      .insert({
        company_id: companyId,
        name: `History Safety ${label}`,
        primary_role: 'creator_updater',
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new Error(`Failed to create Employee fixture: ${error?.message}`);
    }

    const id = String(data.id);
    employeeIds.push(id);
    return id;
  }

  async function expectBlockedAndPreserved(
    employeeId: string,
    table: 'leave_requests' | 'leave_balances' | 'attendance_records' | 'payroll_items' | 'appraisal_items',
  ) {
    const { data, error } = await admin
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .select('id');

    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23503');

    const { count, error: countError } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId);

    expect(countError).toBeNull();
    expect(count).toBe(1);
  }

  beforeAll(async () => {
    const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!url || !serviceKey) {
      throw new Error('Live Employee history tests require Supabase URL and service-role key.');
    }

    admin = createClient(url, serviceKey, clientOptions());
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: leaveType, error: leaveTypeError } = await admin
      .from('leave_types')
      .insert({
        company_id: companyId,
        code: `HIST_${suffix}`,
        name: `History Safety ${suffix}`,
      })
      .select('id')
      .single();
    if (leaveTypeError || !leaveType?.id) {
      throw new Error(`Failed to create Leave Type fixture: ${leaveTypeError?.message}`);
    }
    leaveTypeId = String(leaveType.id);

    const { data: payrollRun, error: payrollRunError } = await admin
      .from('payroll_runs')
      .insert({
        company_id: companyId,
        period_year: 2100,
        period_month: 12,
      })
      .select('id')
      .single();
    if (payrollRunError || !payrollRun?.id) {
      throw new Error(`Failed to create Payroll Run fixture: ${payrollRunError?.message}`);
    }
    payrollRunId = String(payrollRun.id);

    const { data: appraisal, error: appraisalError } = await admin
      .from('appraisals')
      .insert({
        company_id: companyId,
        title: `History Safety ${suffix}`,
        period_start: '2099-01-01',
        period_end: '2099-12-31',
      })
      .select('id')
      .single();
    if (appraisalError || !appraisal?.id) {
      throw new Error(`Failed to create Appraisal fixture: ${appraisalError?.message}`);
    }
    appraisalId = String(appraisal.id);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;

    if (employeeIds.length > 0) {
      await admin.from('leave_requests').delete().in('employee_id', employeeIds);
      await admin.from('leave_balances').delete().in('employee_id', employeeIds);
      await admin.from('attendance_records').delete().in('employee_id', employeeIds);
      await admin.from('payroll_items').delete().in('employee_id', employeeIds);
      await admin.from('appraisal_items').delete().in('employee_id', employeeIds);
      await admin.from('employees').delete().in('id', employeeIds);
    }
    if (payrollRunId) await admin.from('payroll_runs').delete().eq('id', payrollRunId);
    if (appraisalId) await admin.from('appraisals').delete().eq('id', appraisalId);
    if (leaveTypeId) await admin.from('leave_types').delete().eq('id', leaveTypeId);
  }, 60_000);

  it('blocks Employee deletion while leave-request history exists', async () => {
    const employeeId = await createEmployee('Leave Request');
    const { error } = await admin.from('leave_requests').insert({
      company_id: companyId,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: '2099-01-05',
      end_date: '2099-01-05',
      days: 1,
      reason: 'History preservation fixture',
    });
    expect(error).toBeNull();

    await expectBlockedAndPreserved(employeeId, 'leave_requests');
  });

  it('blocks Employee deletion while leave-balance history exists', async () => {
    const employeeId = await createEmployee('Leave Balance');
    const { error } = await admin.from('leave_balances').insert({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year: 2099,
      entitled_days: 10,
      used_days: 1,
    });
    expect(error).toBeNull();

    await expectBlockedAndPreserved(employeeId, 'leave_balances');
  });

  it('blocks Employee deletion while attendance history exists', async () => {
    const employeeId = await createEmployee('Attendance');
    const { error } = await admin.from('attendance_records').insert({
      company_id: companyId,
      employee_id: employeeId,
      date: '2099-02-01',
      status: 'present',
    });
    expect(error).toBeNull();

    await expectBlockedAndPreserved(employeeId, 'attendance_records');
  });

  it('blocks Employee deletion while payroll history exists', async () => {
    const employeeId = await createEmployee('Payroll');
    const { error } = await admin.from('payroll_items').insert({
      payroll_run_id: payrollRunId,
      employee_id: employeeId,
    });
    expect(error).toBeNull();

    await expectBlockedAndPreserved(employeeId, 'payroll_items');
  });

  it('blocks Employee deletion while appraisal history exists', async () => {
    const employeeId = await createEmployee('Appraisal');
    const { error } = await admin.from('appraisal_items').insert({
      appraisal_id: appraisalId,
      employee_id: employeeId,
    });
    expect(error).toBeNull();

    await expectBlockedAndPreserved(employeeId, 'appraisal_items');
  });

  it('still permits hard deletion of a genuinely unused Employee', async () => {
    const employeeId = await createEmployee('Unused');
    const { data, error } = await admin
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .select('id');

    expect(error).toBeNull();
    expect(data).toEqual([{ id: employeeId }]);
  });
});
