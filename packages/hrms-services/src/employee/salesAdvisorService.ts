import { supabase } from '../shared/supabaseClient';

export type SalesAdvisorStatus = 'active' | 'resigned' | 'inactive';

export interface SalesAdvisorRecord {
  id: string;
  code: string;
  name: string;
  ic: string;
  email: string;
  contact: string;
  branchId: string;
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
  branchId: string;
  joinDate?: string | null;
}

function normalizeStatus(raw: unknown): SalesAdvisorStatus {
  const status = String(raw ?? '').toLowerCase();
  if (status === 'resigned') return 'resigned';
  if (status === 'inactive') return 'inactive';
  return 'active';
}

export async function listSalesAdvisors(companyId: string): Promise<SalesAdvisorRecord[]> {
  const { data: assignments, error: assignmentError } = await supabase
    .from('employee_module_assignments')
    .select('employee_id')
    .eq('company_id', companyId)
    .eq('module_key', 'sales')
    .eq('assignment_role', 'sales_advisor')
    .eq('active', true);

  if (assignmentError) throw new Error(assignmentError.message);

  const employeeIds = (assignments ?? [])
    .map(row => String(row.employee_id ?? ''))
    .filter(Boolean);

  if (employeeIds.length === 0) return [];

  const { data: employees, error: employeeError } = await supabase
    .from('employees')
    .select('id, branch_id, staff_code, name, work_email, ic_no, contact_no, join_date, resign_date, status')
    .eq('company_id', companyId)
    .in('id', employeeIds)
    .order('name');

  if (employeeError) throw new Error(employeeError.message);

  return (employees ?? []).map(row => ({
    id: String(row.id),
    code: String(row.staff_code ?? '—'),
    name: String(row.name ?? '—'),
    ic: String(row.ic_no ?? '—'),
    email: String(row.work_email ?? '—'),
    contact: String(row.contact_no ?? '—'),
    branchId: String(row.branch_id ?? ''),
    joinDate: row.join_date ? String(row.join_date) : '—',
    resignDate: row.resign_date ? String(row.resign_date) : undefined,
    status: normalizeStatus(row.status),
  }));
}

export async function createSalesAdvisor(input: CreateSalesAdvisorInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_sales_advisor_employee', {
    p_company_id: input.companyId,
    p_branch_id: input.branchId,
    p_staff_code: input.code,
    p_name: input.name,
    p_work_email: input.email ?? null,
    p_ic_no: input.ic ?? null,
    p_contact_no: input.contact ?? null,
    p_join_date: input.joinDate ?? null,
  });

  if (error) throw new Error(error.message);
  return String(data);
}

export async function updateSalesAdvisorStatus(
  companyId: string,
  employeeId: string,
  status: SalesAdvisorStatus,
): Promise<void> {
  const { error } = await supabase
    .from('employees')
    .update({ status })
    .eq('id', employeeId)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);
}
