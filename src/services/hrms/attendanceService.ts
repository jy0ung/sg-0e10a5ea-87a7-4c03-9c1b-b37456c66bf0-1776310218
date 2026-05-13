import * as pkg from '@flc/hrms-services';
import { AttendanceRecord, UpsertAttendanceInput } from '@/types';

export async function listAttendanceRecords(
  companyId: string,
  opts?: { employeeId?: string; dateFrom?: string; dateTo?: string },
): Promise<{ data: AttendanceRecord[]; error: string | null }> {
  try {
    const data = await pkg.listAttendanceRecords(companyId, opts);
    return { data: data as AttendanceRecord[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function upsertAttendance(
  companyId: string,
  input: UpsertAttendanceInput,
): Promise<{ error: string | null }> {
  try {
    await pkg.upsertAttendance(companyId, input);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
