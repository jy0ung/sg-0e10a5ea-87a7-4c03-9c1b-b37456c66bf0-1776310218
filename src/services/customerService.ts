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
    nric: row.nric as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getCustomers(companyId: string): Promise<{ data: Customer[]; error: Error | null }> {
  const timerId = performanceService.startQueryTimer('getCustomers');
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('name');
  performanceService.endQueryTimer(timerId);
  if (error) { loggingService.error('getCustomers failed', { error }); return { data: [], error: new Error(error.message) }; }
  return { data: (data ?? []).map(mapCustomer), error: null };
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
    .insert({ company_id: companyId, name: fields.name, email: fields.email, phone: fields.phone, address: fields.address, nric: fields.nric })
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
    .update({ name: fields.name, email: fields.email, phone: fields.phone, address: fields.address, nric: fields.nric, updated_at: new Date().toISOString() })
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
