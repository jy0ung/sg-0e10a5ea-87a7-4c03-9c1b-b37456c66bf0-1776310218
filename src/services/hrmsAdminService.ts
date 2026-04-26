import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import type {
  Department, CreateDepartmentInput, UpdateDepartmentInput,
  JobTitle, CreateJobTitleInput, UpdateJobTitleInput,
  LeaveType, CreateLeaveTypeInput, UpdateLeaveTypeInput,
  PublicHoliday, CreateHolidayInput, UpdateHolidayInput,
} from '@/types';

type StoredHeadEmployeeIdentity = {
  name?: string;
};

async function resolveStoredHeadEmployeeIdentities(
  storedHeadEmployeeIds: string[],
): Promise<{ data: Map<string, StoredHeadEmployeeIdentity>; error: string | null }> {
  const uniqueIds = [...new Set(storedHeadEmployeeIds.filter(Boolean))];
  const identities = new Map<string, StoredHeadEmployeeIdentity>();

  if (!uniqueIds.length) return { data: identities, error: null };

  const { data: employeeRows, error: employeeError } = await supabase
    .from('employees')
    .select('id, name')
    .in('id', uniqueIds);
  if (employeeError) return { data: identities, error: employeeError.message };

  for (const row of employeeRows ?? []) {
    identities.set(String(row.id), {
      name: row.name ? String(row.name) : undefined,
    });
  }

  return { data: identities, error: null };
}

function rowToDepartment(
  r: Record<string, unknown>,
  identityMap?: Map<string, StoredHeadEmployeeIdentity>,
): Department {
  const storedHeadEmployeeId = r.head_employee_id ? String(r.head_employee_id) : undefined;
  const headEmployeeIdentity = storedHeadEmployeeId ? identityMap?.get(storedHeadEmployeeId) : undefined;

  return {
    id:               String(r.id ?? ''),
    companyId:        String(r.company_id ?? ''),
    name:             String(r.name ?? ''),
    description:      r.description ? String(r.description) : undefined,
    headEmployeeId:   storedHeadEmployeeId,
    headEmployeeName: headEmployeeIdentity?.name,
    costCentre:       r.cost_centre ? String(r.cost_centre) : undefined,
    isActive:         Boolean(r.is_active),
    createdAt:        String(r.created_at ?? ''),
    updatedAt:        String(r.updated_at ?? ''),
  };
}

async function mapDepartments(
  rows: Record<string, unknown>[],
): Promise<{ data: Department[]; error: string | null }> {
  const identityMap = await resolveStoredHeadEmployeeIdentities(
    rows.map(row => String(row.head_employee_id ?? '')),
  );
  if (identityMap.error) return { data: [], error: identityMap.error };

  return {
    data: rows.map(row => rowToDepartment(row, identityMap.data)),
    error: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listDepartments(companyId: string): Promise<{ data: Department[]; error: string | null }> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (error) return { data: [], error: error.message };

  return mapDepartments((data ?? []) as Record<string, unknown>[]);
}

export async function createDepartment(
  companyId: string,
  actorId: string,
  input: CreateDepartmentInput,
): Promise<{ data: Department | null; error: string | null }> {
  const insertDepartment = async (storedHeadEmployeeId?: string | null) => {
    const { data, error } = await supabase
      .from('departments')
      .insert({
        company_id:       companyId,
        name:             input.name,
        description:      input.description ?? null,
        head_employee_id: storedHeadEmployeeId ?? null,
        cost_centre:      input.costCentre ?? null,
        is_active:        input.isActive,
      })
      .select('*')
      .single();

    return {
      data: data as Record<string, unknown> | null,
      error: error?.message ?? null,
    };
  };

  const createdDepartment = await insertDepartment(input.headEmployeeId ?? null);
  if (createdDepartment.error || !createdDepartment.data) {
    return { data: null, error: createdDepartment.error ?? 'Failed to create department.' };
  }

  const mappedDepartment = await mapDepartments([createdDepartment.data]);
  if (mappedDepartment.error) return { data: null, error: mappedDepartment.error };

  void logUserAction(actorId, 'create', 'department', String(createdDepartment.data.id), { name: input.name });
  return { data: mappedDepartment.data[0] ?? null, error: null };
}

export async function updateDepartment(
  companyId: string,
  id: string,
  actorId: string,
  input: UpdateDepartmentInput,
): Promise<{ error: string | null }> {
  const updatedAt = new Date().toISOString();
  const updateDepartmentRow = async (storedHeadEmployeeId?: string | null) => {
    const { error } = await supabase
      .from('departments')
      .update({
        name:             input.name,
        description:      input.description ?? null,
        head_employee_id: storedHeadEmployeeId ?? null,
        cost_centre:      input.costCentre ?? null,
        is_active:        input.isActive,
        updated_at:       updatedAt,
      })
      .eq('company_id', companyId)
      .eq('id', id);
    return { error: error?.message ?? null };
  };

  const updateResult = await updateDepartmentRow(input.headEmployeeId ?? null);
  const { error } = updateResult;
  if (!error) void logUserAction(actorId, 'update', 'department', id, { name: input.name });
  return { error };
}

export async function deleteDepartment(companyId: string, id: string, actorId: string): Promise<{ error: string | null }> {
  // Check if any employees are assigned to this department
  const { count, error: employeeCountError } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('department_id', id);

  if (employeeCountError) return { error: employeeCountError.message };
  const assignedCount = count ?? 0;

  if (assignedCount > 0) {
    return { error: `Cannot delete: ${assignedCount} employee(s) are assigned to this department. Reassign them first.` };
  }
  const { error } = await supabase.from('departments').delete().eq('company_id', companyId).eq('id', id);
  if (!error) void logUserAction(actorId, 'delete', 'department', id, {});
  return { error: error?.message ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB TITLES
// ═══════════════════════════════════════════════════════════════════════════════

function rowToJobTitle(r: Record<string, unknown>): JobTitle {
  return {
    id:             String(r.id ?? ''),
    companyId:      String(r.company_id ?? ''),
    name:           String(r.name ?? ''),
    departmentId:   r.department_id ? String(r.department_id) : undefined,
    departmentName: r.department ? String((r.department as Record<string, unknown>)?.name ?? '') : undefined,
    level:          r.level ? (r.level as JobTitle['level']) : undefined,
    description:    r.description ? String(r.description) : undefined,
    isActive:       Boolean(r.is_active),
    createdAt:      String(r.created_at ?? ''),
    updatedAt:      String(r.updated_at ?? ''),
  };
}

export async function listJobTitles(companyId: string): Promise<{ data: JobTitle[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_titles')
    .select('*, department:departments(name)')
    .eq('company_id', companyId)
    .order('name');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(r => rowToJobTitle(r as Record<string, unknown>)), error: null };
}

export async function createJobTitle(
  companyId: string,
  actorId: string,
  input: CreateJobTitleInput,
): Promise<{ data: JobTitle | null; error: string | null }> {
  const { data, error } = await supabase
    .from('job_titles')
    .insert({
      company_id:    companyId,
      name:          input.name,
      department_id: input.departmentId ?? null,
      level:         input.level || null,
      description:   input.description ?? null,
      is_active:     input.isActive,
    })
    .select('*, department:departments(name)')
    .single();
  if (error) return { data: null, error: error.message };
  void logUserAction(actorId, 'create', 'job_title', String(data.id), { name: input.name });
  return { data: rowToJobTitle(data as Record<string, unknown>), error: null };
}

export async function updateJobTitle(
  companyId: string,
  id: string,
  actorId: string,
  input: UpdateJobTitleInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('job_titles')
    .update({
      name:          input.name,
      department_id: input.departmentId ?? null,
      level:         input.level || null,
      description:   input.description ?? null,
      is_active:     input.isActive,
      updated_at:    new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (!error) void logUserAction(actorId, 'update', 'job_title', id, { name: input.name });
  return { error: error?.message ?? null };
}

export async function deleteJobTitle(companyId: string, id: string, actorId: string): Promise<{ error: string | null }> {
  // Check if any employees have this job title
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('job_title_id', id);
  if ((count ?? 0) > 0) {
    return { error: `Cannot delete: ${count} employee(s) have this job title. Reassign them first.` };
  }
  const { error } = await supabase.from('job_titles').delete().eq('company_id', companyId).eq('id', id);
  if (!error) void logUserAction(actorId, 'delete', 'job_title', id, {});
  return { error: error?.message ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE TYPES (admin CRUD — listLeaveTypes is in hrmsService.ts)
// ═══════════════════════════════════════════════════════════════════════════════

function rowToLeaveType(r: Record<string, unknown>): LeaveType {
  return {
    id:          String(r.id ?? ''),
    companyId:   String(r.company_id ?? ''),
    name:        String(r.name ?? ''),
    code:        String(r.code ?? ''),
    daysPerYear: Number(r.days_per_year),
    isPaid:      Boolean(r.is_paid),
    active:      Boolean(r.active),
    createdAt:   String(r.created_at ?? ''),
    updatedAt:   String(r.updated_at ?? ''),
  };
}

/** List ALL leave types (including inactive) for admin use. */
export async function listAllLeaveTypes(companyId: string): Promise<{ data: LeaveType[]; error: string | null }> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(r => rowToLeaveType(r as Record<string, unknown>)), error: null };
}

export async function createLeaveType(
  companyId: string,
  actorId: string,
  input: CreateLeaveTypeInput,
): Promise<{ data: LeaveType | null; error: string | null }> {
  const { data, error } = await supabase
    .from('leave_types')
    .insert({
      company_id:    companyId,
      name:          input.name,
      code:          input.code.toUpperCase(),
      days_per_year: input.daysPerYear,
      is_paid:       input.isPaid,
      active:        input.active,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  void logUserAction(actorId, 'create', 'leave_type', String(data.id), { name: input.name, code: input.code });
  return { data: rowToLeaveType(data as Record<string, unknown>), error: null };
}

export async function updateLeaveType(
  companyId: string,
  id: string,
  actorId: string,
  input: UpdateLeaveTypeInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('leave_types')
    .update({
      name:          input.name,
      code:          input.code.toUpperCase(),
      days_per_year: input.daysPerYear,
      is_paid:       input.isPaid,
      active:        input.active,
      updated_at:    new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (!error) void logUserAction(actorId, 'update', 'leave_type', id, { name: input.name });
  return { error: error?.message ?? null };
}

/** Soft delete: deactivates the leave type. Hard delete only if no balances reference it. */
export async function deleteLeaveType(companyId: string, id: string, actorId: string): Promise<{ error: string | null }> {
  const { count } = await supabase
    .from('leave_balances')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('leave_type_id', id);
  if ((count ?? 0) > 0) {
    // Soft delete: just deactivate
    const { error } = await supabase
      .from('leave_types')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id);
    if (!error) void logUserAction(actorId, 'update', 'leave_type', id, { action: 'deactivated' });
    return { error: error ? `Could not deactivate: ${error.message}` : null };
  }
  const { error } = await supabase.from('leave_types').delete().eq('company_id', companyId).eq('id', id);
  if (!error) void logUserAction(actorId, 'delete', 'leave_type', id, {});
  return { error: error?.message ?? null };
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
