import type { AttendanceRecord, UpsertAttendanceInput } from '@flc/types';
import { supabase } from '../shared/supabaseClient';
import { resolveStoredEmployeeIdentities } from '../shared/identity';

/**
 * Lists attendance records for a company, with optional filtering.
 * Throws on database error.
 */
export async function listAttendanceRecords(
  companyId: string,
  opts?: { employeeId?: string; dateFrom?: string; dateTo?: string },
): Promise<AttendanceRecord[]> {
  let q = supabase
    .from('attendance_records')
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.dateFrom)   q = q.gte('date', opts.dateFrom);
  if (opts?.dateTo)     q = q.lte('date', opts.dateTo);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const identityMap = await resolveStoredEmployeeIdentities(
    (data ?? []).map(row => String(row.employee_id ?? '')),
  );

  return (data ?? []).map(r => ({
    id:           String(r.id),
    companyId:    String(r.company_id),
    employeeId:   String(r.employee_id ?? ''),
    employeeName: identityMap.get(String(r.employee_id ?? ''))?.name,
    date:         String(r.date),
    clockIn:      r.clock_in ? String(r.clock_in) : undefined,
    clockOut:     r.clock_out ? String(r.clock_out) : undefined,
    hoursWorked:  r.hours_worked != null ? Number(r.hours_worked) : undefined,
    status:       r.status as AttendanceRecord['status'],
    notes:        r.notes ? String(r.notes) : undefined,
    createdAt:    String(r.created_at),
    updatedAt:    String(r.updated_at),
  }));
}

/**
 * Upserts an attendance record for a given employee and date.
 * Throws on database error.
 */
export async function upsertAttendance(
  companyId: string,
  input: UpsertAttendanceInput,
): Promise<void> {
  const { error } = await supabase.from('attendance_records').upsert({
    company_id:   companyId,
    employee_id:  input.employeeId,
    date:         input.date,
    clock_in:     input.clockIn ?? null,
    clock_out:    input.clockOut ?? null,
    hours_worked: input.hoursWorked ?? null,
    status:       input.status,
    notes:        input.notes ?? null,
  }, { onConflict: 'employee_id,date' });
  if (error) throw new Error(error.message);
}

/**
 * Returns a date-filtered attendance view for an individual employee.
 * Throws on database error.
 */
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

/** Records a clock-in for today. Throws on database error. */
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

/** Records a clock-out for today and computes hours worked. Throws on database error. */
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
    .eq('date', date)
    .eq('employee_id', employeeId)
    .maybeSingle();
  const hoursWorked = existing?.clock_in
    ? Math.round(
        (new Date(checkOut).getTime() - new Date(existing.clock_in).getTime()) / 3_600_000 * 100,
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
