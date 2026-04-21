import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

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

export async function listSalesAdvisors(
  companyId: string,
): Promise<SalesAdvisorRecord[]> {
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

export async function createSalesAdvisor(
  input: CreateSalesAdvisorInput,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('profiles').insert({
    id: crypto.randomUUID(),
    email: input.email || `${input.code.toLowerCase()}@flc.local`,
    name: input.name,
    role: 'sales',
    company_id: input.companyId,
    branch_id: input.branch,
    access_scope: 'self',
    status: 'active',
    staff_code: input.code.toUpperCase(),
    ic_no: input.ic ?? null,
    contact_no: input.contact ?? null,
    join_date: input.joinDate ?? null,
  });
  if (error) {
    loggingService.error('createSalesAdvisor failed', { error }, 'SalesAdvisorService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function updateSalesAdvisorStatus(
  id: string,
  status: SalesAdvisorStatus,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) {
    loggingService.error('updateSalesAdvisorStatus failed', { id, error }, 'SalesAdvisorService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}
