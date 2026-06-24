import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

export type CommunicationType = 'call' | 'email' | 'visit' | 'message' | 'meeting' | 'note';

export interface CustomerCommunication {
  id: string;
  customerId: string;
  type: CommunicationType;
  subject: string | null;
  body: string | null;
  contactPerson: string | null;
  communicationDate: string;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateCommunicationInput {
  customerId: string;
  type: CommunicationType;
  subject?: string;
  body?: string;
  contactPerson?: string;
  communicationDate?: string;
}

function mapRow(row: Record<string, unknown>): CustomerCommunication {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    type: row.type as CommunicationType,
    subject: row.subject ? String(row.subject) : null,
    body: row.body ? String(row.body) : null,
    contactPerson: row.contact_person ? String(row.contact_person) : null,
    communicationDate: String(row.communication_date),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

export async function listCommunications(
  companyId: string,
  customerId: string,
): Promise<{ data: CustomerCommunication[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('customer_communications')
    .select('*')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .order('communication_date', { ascending: false })
    .limit(100);

  if (error) {
    loggingService.error('listCommunications failed', { companyId, customerId, error }, 'CustomerCommService');
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data ?? []).map(mapRow), error: null };
}

export async function createCommunication(
  companyId: string,
  userId: string,
  input: CreateCommunicationInput,
): Promise<{ data: CustomerCommunication | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('customer_communications')
    .insert({
      company_id: companyId,
      customer_id: input.customerId,
      type: input.type,
      subject: input.subject || null,
      body: input.body || null,
      contact_person: input.contactPerson || null,
      communication_date: input.communicationDate || new Date().toISOString(),
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) {
    loggingService.error('createCommunication failed', { companyId, input, error }, 'CustomerCommService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: mapRow(data as Record<string, unknown>), error: null };
}

export async function deleteCommunication(
  companyId: string,
  id: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('customer_communications')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) {
    loggingService.error('deleteCommunication failed', { companyId, id, error }, 'CustomerCommService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}
