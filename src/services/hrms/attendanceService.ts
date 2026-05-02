import { supabase } from '@/integrations/supabase/client';
import { AttendanceRecord, UpsertAttendanceInput } from '@/types';
import { resolveStoredEmployeeIdentities } from './shared';

export async function listAttendanceRecords(
  companyId: string,
  opts?: { employeeId?: string; dateFrom?: string; dateTo?: string },
): Promise<{ data: AttendanceRecord[]; error: string | null }> {
  let q = supabase
    .from('attendance_records')
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.dateFrom)   q = q.gte('date', opts.dateFrom);
  if (opts?.dateTo)     q = q.lte('date', opts.dateTo);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const identityMap = await resolveStoredEmployeeIdentities((data ?? []).map(row => String(row.employee_id ?? '')));
  if (identityMap.error) return { data: [], error: identityMap.error };

  const mapped: AttendanceRecord[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:           String(r.id),
    companyId:    String(r.company_id),
    employeeId:   String(r.employee_id ?? ''),
    employeeName: identityMap.data.get(String(r.employee_id ?? ''))?.name,
    date:         String(r.date),
    clockIn:      r.clock_in ? String(r.clock_in) : undefined,
    clockOut:     r.clock_out ? String(r.clock_out) : undefined,
    hoursWorked:  r.hours_worked != null ? Number(r.hours_worked) : undefined,
    status:       r.status as AttendanceRecord['status'],
    notes:        r.notes ? String(r.notes) : undefined,
    createdAt:    String(r.created_at),
    updatedAt:    String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function upsertAttendance(
  companyId: string,
  input: UpsertAttendanceInput,
): Promise<{ error: string | null }> {
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

  return { error: error?.message ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════

