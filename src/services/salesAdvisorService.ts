import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import { createEmployee, updateEmployee } from './hrmsService';

export type SalesAdvisorStatus = 'active' | 'resigned' | 'inactive';

export interface SalesAdvisorRecord {
  id: string;
  code: string;
  name: string;
  ic: string;
  email: string;
  contact: string;
  branch: string;
  joinDate: string;
  resignDate?: string;
  status: SalesAdvisorStatus;
}

export interface CreateSalesAdvisorInput {
  companyId: string;
  code: string;
  name: string;
  email?: string | null;
  ic?: string | null;
  contact?: string | null;
  branch: string;
  joinDate?: string | null;
}

function rowToAdvisor(row: Record<string, unknown>): SalesAdvisorRecord {
  return {
    id: String(row.id ?? ''),
    code: String(row.staff_code ?? '—'),
    name: String(row.name ?? '—'),
    ic: String(row.ic_no ?? '—'),
    email: String(row.email ?? '—'),
    contact: String(row.contact_no ?? '—'),
    branch: String(row.branch_id ?? '—'),
    joinDate: row.join_date ? String(row.join_date) : '—',
    resignDate: row.resign_date ? String(row.resign_date) : undefined,
    status: (row.status as SalesAdvisorStatus) ?? 'active',
  };
}

function isMissingWorkforceSchemaError(message: string | null | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return [
    'relation "employees" does not exist',
    'relation "employee_module_assignments" does not exist',
    'column employees.primary_role does not exist',
    'could not find the table',
    'could not find a relationship',
  ].some(fragment => text.includes(fragment));
}

export async function listSalesAdvisors(
  companyId: string,
): Promise<SalesAdvisorRecord[]> {
  const { data: assignments, error: assignmentError } = await supabase
    .from('employee_module_assignments')
    .select('employee_id')
    .eq('company_id', companyId)
    .eq('module_key', 'sales')
    .eq('assignment_role', 'sales_advisor')
    .eq('active', true);

  if (assignmentError) {
    if (!isMissingWorkforceSchemaError(assignmentError.message)) {
      loggingService.error('listSalesAdvisors failed', { companyId, error: assignmentError }, 'SalesAdvisorService');
      throw new Error(assignmentError.message);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, email, name, role, company_id, branch_id, status, staff_code, ic_no, contact_no, join_date, resign_date',
      )
      .eq('company_id', companyId)
      .eq('role', 'sales')
      .order('name');
    if (error) {
      loggingService.error('listSalesAdvisors failed', { companyId, error }, 'SalesAdvisorService');
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => rowToAdvisor(row as Record<string, unknown>));
  }

  const employeeIds = (assignments ?? [])
    .map((row: Record<string, unknown>) => String(row.employee_id ?? ''))
    .filter(Boolean);

  if (!employeeIds.length) return [];

  const { data: employees, error: employeeError } = await supabase
    .from('employees')
    .select('id, branch_id, staff_code, name, work_email, ic_no, contact_no, join_date, resign_date, status')
    .eq('company_id', companyId)
    .in('id', employeeIds)
    .order('name');
  if (employeeError) {
    loggingService.error('listSalesAdvisors failed', { companyId, error: employeeError }, 'SalesAdvisorService');
    throw new Error(employeeError.message);
  }

  return (employees ?? []).map((row: Record<string, unknown>) => rowToAdvisor({
    id: row.id,
    staff_code: row.staff_code,
    name: row.name,
    ic_no: row.ic_no,
    email: row.work_email,
    contact_no: row.contact_no,
    branch_id: row.branch_id,
    join_date: row.join_date,
    resign_date: row.resign_date,
    status: row.status,
  }));
}

export async function createSalesAdvisor(
  input: CreateSalesAdvisorInput,
): Promise<{ error: Error | null }> {
  const { error } = await createEmployee({
    id: crypto.randomUUID(),
    email: input.email || `${input.code.toLowerCase()}@flc.local`,
    name: input.name,
    role: 'sales',
    companyId: input.companyId,
    branchId: input.branch,
    staffCode: input.code.toUpperCase(),
    icNo: input.ic ?? undefined,
    contactNo: input.contact ?? undefined,
    joinDate: input.joinDate ?? undefined,
  });
  if (error) {
    loggingService.error('createSalesAdvisor failed', { error }, 'SalesAdvisorService');
    return { error: new Error(error) };
  }
  return { error: null };
}

export async function updateSalesAdvisorStatus(
  id: string,
  status: SalesAdvisorStatus,
): Promise<{ error: Error | null }> {
  const { error } = await updateEmployee(id, { status });
  if (error) {
    loggingService.error('updateSalesAdvisorStatus failed', { id, error }, 'SalesAdvisorService');
    return { error: new Error(error) };
  }
  return { error: null };
}
