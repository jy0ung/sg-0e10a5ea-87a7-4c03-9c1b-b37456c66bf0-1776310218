import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import { logUserAction } from './auditService';

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

function normalizeStatus(raw: unknown): SalesAdvisorStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'resigned') return 'resigned';
  if (s === 'inactive') return 'inactive';
  return 'active';
}

function rowToAdvisor(row: Record<string, unknown>): SalesAdvisorRecord {
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? '—'),
    name: String(row.name ?? '—'),
    ic: String(row.ic_no ?? '—'),
    email: String(row.email ?? '—'),
    contact: String(row.contact_no ?? '—'),
    branch: String(row.branch_code ?? '—'),
    joinDate: row.join_date ? String(row.join_date) : '—',
    resignDate: row.resign_date ? String(row.resign_date) : undefined,
    status: normalizeStatus(row.status),
  };
}

export async function listSalesAdvisors(
  companyId: string,
): Promise<SalesAdvisorRecord[]> {
  const { data, error } = await supabase
    .from('sales_advisors')
    .select('id, code, name, ic_no, email, contact_no, branch_code, join_date, resign_date, status')
    .eq('company_id', companyId)
    .order('name');

  if (error) {
    loggingService.error('listSalesAdvisors failed', { companyId, error }, 'SalesAdvisorService');
    throw new Error(error.message);
  }

  return (data ?? []).map(row => rowToAdvisor(row as Record<string, unknown>));
}

export async function createSalesAdvisor(
  input: CreateSalesAdvisorInput,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('sales_advisors')
    .insert({
      company_id: input.companyId,
      code: input.code.toUpperCase(),
      name: input.name,
      email: input.email ?? null,
      ic_no: input.ic ?? null,
      contact_no: input.contact ?? null,
      branch_code: input.branch,
      join_date: input.joinDate ?? null,
      status: 'active',
    });
  if (error) {
    loggingService.error('createSalesAdvisor failed', { error }, 'SalesAdvisorService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function updateSalesAdvisorStatus(
  companyId: string,
  id: string,
  status: SalesAdvisorStatus,
  actorId?: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('sales_advisors')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) {
    loggingService.error('updateSalesAdvisorStatus failed', { id, error }, 'SalesAdvisorService');
    return { error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'update', 'sales_advisor', id, { status });
  return { error: null };
}
