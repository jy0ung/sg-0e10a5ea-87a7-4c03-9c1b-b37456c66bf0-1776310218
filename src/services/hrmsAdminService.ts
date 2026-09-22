import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import {
  listDepartments as listCanonicalDepartments,
  createDepartment as createCanonicalDepartment,
  updateDepartment as updateCanonicalDepartment,
  deleteDepartment as deleteCanonicalDepartment,
  listJobTitles as listCanonicalJobTitles,
  createJobTitle as createCanonicalJobTitle,
  updateJobTitle as updateCanonicalJobTitle,
  deleteJobTitle as deleteCanonicalJobTitle,
  listAllLeaveTypes as listCanonicalLeaveTypes,
  createLeaveType as createCanonicalLeaveType,
  updateLeaveType as updateCanonicalLeaveType,
  deleteLeaveType as deleteCanonicalLeaveType,
} from '@flc/hrms-services';
import type {
  Department, CreateDepartmentInput, UpdateDepartmentInput,
  JobTitle, CreateJobTitleInput, UpdateJobTitleInput,
  LeaveType, CreateLeaveTypeInput, UpdateLeaveTypeInput,
  PublicHoliday, CreateHolidayInput, UpdateHolidayInput,
} from '@/types';

// ═══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listDepartments(
  companyId: string,
): Promise<{ data: Department[]; error: string | null }> {
  try {
    const data = await listCanonicalDepartments(companyId);
    return { data: data as Department[], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createDepartment(
  companyId: string,
  actorId: string,
  input: CreateDepartmentInput,
): Promise<{ data: Department | null; error: string | null }> {
  try {
    const data = await createCanonicalDepartment(companyId, input);
    void logUserAction(actorId, 'create', 'department', String(data.id), { name: input.name });
    return { data: data as Department, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateDepartment(
  companyId: string,
  id: string,
  actorId: string,
  input: UpdateDepartmentInput,
): Promise<{ error: string | null }> {
  try {
    await updateCanonicalDepartment(companyId, id, input);
    void logUserAction(actorId, 'update', 'department', id, { name: input.name });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteDepartment(
  companyId: string,
  id: string,
  actorId: string,
): Promise<{ error: string | null }> {
  try {
    await deleteCanonicalDepartment(companyId, id);
    void logUserAction(actorId, 'delete', 'department', id, {});
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB TITLES
// ═══════════════════════════════════════════════════════════════════════════════

export async function listJobTitles(companyId: string): Promise<{ data: JobTitle[]; error: string | null }> {
  try {
    const data = await listCanonicalJobTitles(companyId);
    return { data: data as JobTitle[], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createJobTitle(
  companyId: string,
  actorId: string,
  input: CreateJobTitleInput,
): Promise<{ data: JobTitle | null; error: string | null }> {
  try {
    const data = await createCanonicalJobTitle(companyId, input);
    void logUserAction(actorId, 'create', 'job_title', String(data.id), { name: input.name });
    return { data: data as JobTitle, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateJobTitle(
  companyId: string,
  id: string,
  actorId: string,
  input: UpdateJobTitleInput,
): Promise<{ error: string | null }> {
  try {
    await updateCanonicalJobTitle(companyId, id, input);
    void logUserAction(actorId, 'update', 'job_title', id, { name: input.name });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteJobTitle(
  companyId: string,
  id: string,
  actorId: string,
): Promise<{ error: string | null }> {
  try {
    await deleteCanonicalJobTitle(companyId, id);
    void logUserAction(actorId, 'delete', 'job_title', id, {});
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE TYPES (admin CRUD — listLeaveTypes is in hrmsService.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/** List ALL leave types (including inactive) for admin use. */
export async function listAllLeaveTypes(
  companyId: string,
): Promise<{ data: LeaveType[]; error: string | null }> {
  try {
    const data = await listCanonicalLeaveTypes(companyId);
    return { data: data as LeaveType[], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createLeaveType(
  companyId: string,
  actorId: string,
  input: CreateLeaveTypeInput,
): Promise<{ data: LeaveType | null; error: string | null }> {
  try {
    const data = await createCanonicalLeaveType(companyId, input);
    void logUserAction(actorId, 'create', 'leave_type', String(data.id), {
      name: input.name,
      code: input.code,
    });
    return { data: data as LeaveType, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateLeaveType(
  companyId: string,
  id: string,
  actorId: string,
  input: UpdateLeaveTypeInput,
): Promise<{ error: string | null }> {
  try {
    await updateCanonicalLeaveType(companyId, id, input);
    void logUserAction(actorId, 'update', 'leave_type', id, { name: input.name });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Soft-deactivates referenced Leave Types; hard-deletes unreferenced ones. */
export async function deleteLeaveType(
  companyId: string,
  id: string,
  actorId: string,
): Promise<{ error: string | null }> {
  try {
    const result = await deleteCanonicalLeaveType(companyId, id);
    if (result === 'deactivated') {
      void logUserAction(actorId, 'update', 'leave_type', id, { action: 'deactivated' });
    } else {
      void logUserAction(actorId, 'delete', 'leave_type', id, {});
    }
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC / COMPANY HOLIDAYS
// ═══════════════════════════════════════════════════════════════════════════════

function rowToHoliday(r: Record<string, unknown>): PublicHoliday {
  return {
    id:          String(r.id ?? ''),
    companyId:   String(r.company_id ?? ''),
    name:        String(r.name ?? ''),
    date:        String(r.date ?? ''),
    holidayType: (r.holiday_type as PublicHoliday['holidayType']) ?? 'public',
    isRecurring: Boolean(r.is_recurring),
    createdAt:   String(r.created_at ?? ''),
    updatedAt:   String(r.updated_at ?? ''),
  };
}

export async function listHolidays(companyId: string): Promise<{ data: PublicHoliday[]; error: string | null }> {
  const { data, error } = await supabase
    .from('public_holidays')
    .select('*')
    .eq('company_id', companyId)
    .order('date');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(r => rowToHoliday(r as Record<string, unknown>)), error: null };
}

export async function createHoliday(
  companyId: string,
  actorId: string,
  input: CreateHolidayInput,
): Promise<{ data: PublicHoliday | null; error: string | null }> {
  const { data, error } = await supabase
    .from('public_holidays')
    .insert({
      company_id:   companyId,
      name:         input.name,
      date:         input.date,
      holiday_type: input.holidayType,
      is_recurring: input.isRecurring,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  void logUserAction(actorId, 'create', 'holiday', String(data.id), { name: input.name, date: input.date });
  return { data: rowToHoliday(data as Record<string, unknown>), error: null };
}

export async function updateHoliday(
  companyId: string,
  id: string,
  actorId: string,
  input: UpdateHolidayInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('public_holidays')
    .update({
      name:         input.name,
      date:         input.date,
      holiday_type: input.holidayType,
      is_recurring: input.isRecurring,
      updated_at:   new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (!error) void logUserAction(actorId, 'update', 'holiday', id, { name: input.name });
  return { error: error?.message ?? null };
}

export async function deleteHoliday(companyId: string, id: string, actorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('public_holidays').delete().eq('company_id', companyId).eq('id', id);
  if (!error) void logUserAction(actorId, 'delete', 'holiday', id, {});
  return { error: error?.message ?? null };
}
