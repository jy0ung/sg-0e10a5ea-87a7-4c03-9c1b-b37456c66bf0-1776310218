/**
 * Mobile HRMS service layer.
 * Thin wrappers around Supabase queries — no React hooks, no audit logging dependency.
 * All queries align with the real database schema in @flc/supabase.
 */
import { supabase }                                    from '@flc/supabase';
import type { LeaveRequest, AttendanceRecord, LeaveType } from '@flc/types';
import type { CreateLeaveRequestFormData }              from '@flc/hrms-schemas';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute number of calendar days between two ISO date strings (inclusive). */
function calcDays(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function updateContactNo(profileId: string, contactNo: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ contact_no: contactNo })
    .eq('id', profileId);
  if (error) throw new Error(error.message);
}

// ─── Leave Types ──────────────────────────────────────────────────────────────

export async function getLeaveTypes(companyId: string): Promise<LeaveType[]> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('id, name, code, company_id, days_per_year, is_paid, active, created_at, updated_at')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id:          r.id,
    companyId:   r.company_id,
    name:        r.name,
    code:        r.code,
    daysPerYear: r.days_per_year,
    isPaid:      r.is_paid,
    active:      r.active,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  }));
}

// ─── Leave Requests ──────────────────────────────────────────────────────────

export async function getMyLeaveRequests(
  employeeId: string,
  companyId: string,
): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*, profiles(name), leave_types(name)')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:            String(r.id),
    companyId:     String(r.company_id),
    employeeId:    String(r.employee_id),
    employeeName:  (r.profiles as Record<string, unknown> | null)?.name
                     ? String((r.profiles as Record<string, unknown>).name) : undefined,
    leaveTypeId:   String(r.leave_type_id),
    leaveTypeName: (r.leave_types as Record<string, unknown> | null)?.name
                     ? String((r.leave_types as Record<string, unknown>).name) : undefined,
    startDate:     String(r.start_date),
    endDate:       String(r.end_date),
    days:          Number(r.days),
    reason:        r.reason ? String(r.reason) : undefined,
    status:        r.status as LeaveRequest['status'],
    reviewedBy:    r.reviewed_by ? String(r.reviewed_by) : undefined,
    reviewedAt:    r.reviewed_at ? String(r.reviewed_at) : undefined,
    reviewerNote:  r.reviewer_note ? String(r.reviewer_note) : undefined,
    createdAt:     String(r.created_at),
    updatedAt:     String(r.updated_at),
  }));
}

export async function createLeaveRequest(
  employeeId: string,
  companyId: string,
  payload: CreateLeaveRequestFormData,
): Promise<void> {
  const { error } = await supabase.from('leave_requests').insert({
    company_id:    companyId,
    employee_id:   employeeId,
    leave_type_id: payload.leaveTypeId,
    start_date:    payload.startDate,
    end_date:      payload.endDate,
    days:          calcDays(payload.startDate, payload.endDate),
    reason:        payload.reason ?? null,
    status:        'pending',
  });
  if (error) throw new Error(error.message);
}

export async function cancelLeaveRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getMyAttendance(
  employeeId: string,
  companyId: string,
  dateRange: { from: string; to: string },
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .gte('date', dateRange.from)
    .lte('date', dateRange.to)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id:          r.id,
    companyId:   r.company_id,
    employeeId:  r.employee_id,
    date:        r.date,
    clockIn:     r.clock_in  ?? undefined,
    clockOut:    r.clock_out ?? undefined,
    hoursWorked: r.hours_worked ?? undefined,
    status:      r.status as AttendanceRecord['status'],
    notes:       r.notes ?? undefined,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  }));
}

export async function clockIn(
  employeeId: string,
  companyId: string,
  date: string,
): Promise<void> {
  const { error } = await supabase.from('attendance_records').upsert({
    company_id:  companyId,
    employee_id: employeeId,
    date,
    clock_in:    new Date().toISOString(),
    status:      'present',
  }, { onConflict: 'employee_id,date' });
  if (error) throw new Error(error.message);
}

export async function clockOut(
  employeeId: string,
  companyId: string,
  date: string,
): Promise<void> {
  const checkOut = new Date().toISOString();
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('clock_in')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('date', date)
    .maybeSingle();
  const hoursWorked = existing?.clock_in
    ? Math.round(
        (new Date(checkOut).getTime() - new Date(existing.clock_in).getTime()) / 3_600_000 * 100
      ) / 100
    : undefined;
  const { error } = await supabase.from('attendance_records').upsert({
    company_id:   companyId,
    employee_id:  employeeId,
    date,
    clock_out:    checkOut,
    hours_worked: hoursWorked ?? null,
    status:       'present',
  }, { onConflict: 'employee_id,date' });
  if (error) throw new Error(error.message);
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export interface PayslipSummary {
  id:          string;
  periodYear:  number;
  periodMonth: number;
  grossPay:    number;
  netPay:      number;
  status:      string;
}

export async function getMyPayslips(
  employeeId: string,
  companyId: string,
): Promise<PayslipSummary[]> {
  const { data, error } = await supabase
    .from('payroll_items')
    .select('id, gross_pay, net_pay, payroll_runs!inner(period_year, period_month, status, company_id)')
    .eq('employee_id', employeeId)
    .eq('payroll_runs.company_id', companyId)
    .order('payroll_runs(period_year)', { ascending: false })
    .order('payroll_runs(period_month)', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => {
    const run = r.payroll_runs as Record<string, unknown>;
    return {
      id:          String(r.id),
      periodYear:  Number(run?.period_year),
      periodMonth: Number(run?.period_month),
      grossPay:    Number(r.gross_pay),
      netPay:      Number(r.net_pay),
      status:      String(run?.status ?? 'draft'),
    };
  });
}
