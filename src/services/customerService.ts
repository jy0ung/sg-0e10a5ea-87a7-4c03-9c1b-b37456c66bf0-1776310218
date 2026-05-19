import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';
import { logUserAction } from './auditService';

type CustomerEditableFields = Omit<Customer, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

function missingCompanyError(): Error {
  return new Error('Company context is required for customer mutations');
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    email: row.email as string | undefined,
    phone: row.phone as string | undefined,
    address: row.address as string | undefined,
    nric: row.ic_no as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getCustomers(companyId: string): Promise<{ data: Customer[]; error: Error | null }> {
  performanceService.startQueryTimer('getCustomers');
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('name', { ascending: true })
    .limit(100_000); // Override PostgREST default max_rows=1000
  performanceService.endQueryTimer('getCustomers', 'getCustomers');
  if (error) { loggingService.error('getCustomers failed', { error }); return { data: [], error: new Error(error.message) }; }
  return { data: (data ?? []).map(mapCustomer), error: null };
}

/** Paginated customer fetch with optional full-text search across name/phone/ic_no. */
export async function getCustomersPage(
  companyId: string,
  page: number,
  pageSize: number,
  search: string,
): Promise<{ data: Customer[]; total: number; error: Error | null }> {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  // Escape PostgREST ilike wildcards so literal % and _ are searchable.
  const term = search.trim().replace(/[%_\\]/g, '\\$&');

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  if (term) {
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,ic_no.ilike.%${term}%`);
  }

  const { data, error, count } = await query
    .order('name', { ascending: true })
    .range(from, to);

  if (error) {
    loggingService.error('getCustomersPage failed', { error });
    return { data: [], total: 0, error: new Error(error.message) };
  }
  return { data: (data ?? []).map(mapCustomer), total: count ?? 0, error: null };
}

export async function getCustomerById(companyId: string, id: string): Promise<{ data: Customer | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase.from('customers').select('*').eq('company_id', companyId).eq('id', id).single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: mapCustomer(data as Record<string, unknown>), error: null };
}

export async function createCustomer(companyId: string, fields: CustomerEditableFields, actorId?: string): Promise<{ data: Customer | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase
    .from('customers')
    .insert({ company_id: companyId, name: fields.name, email: fields.email, phone: fields.phone, address: fields.address, ic_no: fields.nric })
    .select()
    .single();
  if (error) { loggingService.error('createCustomer failed', { error }); return { data: null, error: new Error(error.message) }; }
  if (actorId) void logUserAction(actorId, 'create', 'customer', String(data.id), { component: 'CustomerService' });
  return { data: mapCustomer(data as Record<string, unknown>), error: null };
}

export async function updateCustomer(companyId: string, id: string, fields: Partial<CustomerEditableFields>, actorId?: string): Promise<{ data: Customer | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase
    .from('customers')
    .update({ name: fields.name, email: fields.email, phone: fields.phone, address: fields.address, ic_no: fields.nric, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .select()
    .single();
  if (error) { loggingService.error('updateCustomer failed', { error }); return { data: null, error: new Error(error.message) }; }
  if (actorId) void logUserAction(actorId, 'update', 'customer', id, { component: 'CustomerService' });
  return { data: mapCustomer(data as Record<string, unknown>), error: null };
}

export async function deleteCustomer(companyId: string, id: string, actorId?: string): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const { error } = await supabase
    .from('customers')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) return { error: new Error(error.message) };
  if (actorId) void logUserAction(actorId, 'delete', 'customer', id, { component: 'CustomerService' });
  return { error: null };
}
