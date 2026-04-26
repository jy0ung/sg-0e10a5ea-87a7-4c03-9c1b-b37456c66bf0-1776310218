import { supabase } from '@/integrations/supabase/client';
import type { BranchMapping, PaymentMethodMapping } from '@/types';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';

function missingCompanyError(): Error {
  return new Error('Company context is required for mapping mutations');
}

// ─── Branch Mappings ──────────────────────────────────────────────────────────

export async function getBranchMappings(companyId: string): Promise<{ data: BranchMapping[]; error: Error | null }> {
  const qid = `branch-mappings-get-${Date.now()}`;
  performanceService.startQueryTimer(qid);

  const { data, error } = await supabase
    .from('branch_mappings')
    .select('*')
    .eq('company_id', companyId)
    .order('raw_value');

  performanceService.endQueryTimer(qid, 'get_branch_mappings');

  if (error) {
    loggingService.error('Failed to get branch mappings', { error }, 'MappingService');
    return { data: [], error: new Error(error.message) };
  }

  return {
    data: (data || []).map(r => ({
      id: r.id,
      rawValue: r.raw_value,
      canonicalCode: r.canonical_code,
      notes: r.notes ?? undefined,
      companyId: r.company_id,
    })),
    error: null,
  };
}

export async function createBranchMapping(
  mapping: Omit<BranchMapping, 'id'>,
): Promise<{ data: BranchMapping | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('branch_mappings')
    .insert({
      raw_value: mapping.rawValue,
      canonical_code: mapping.canonicalCode,
      notes: mapping.notes ?? null,
      company_id: mapping.companyId,
    })
    .select()
    .single();

  if (error) {
    loggingService.error('Failed to create branch mapping', { error }, 'MappingService');
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: { id: data.id, rawValue: data.raw_value, canonicalCode: data.canonical_code, notes: data.notes ?? undefined, companyId: data.company_id },
    error: null,
  };
}

export async function updateBranchMapping(
  companyId: string,
  id: string,
  updates: Partial<Pick<BranchMapping, 'rawValue' | 'canonicalCode' | 'notes'>>,
  actorId?: string,
): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const dbUpdates: Record<string, unknown> = {};
  if (updates.rawValue !== undefined) dbUpdates.raw_value = updates.rawValue;
  if (updates.canonicalCode !== undefined) dbUpdates.canonical_code = updates.canonicalCode;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  dbUpdates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('branch_mappings').update(dbUpdates).eq('company_id', companyId).eq('id', id);
  if (error) {
    loggingService.error('Failed to update branch mapping', { error }, 'MappingService');
    return { error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'update', 'branch_mapping', id, { component: 'MappingService' });
  return { error: null };
}

export async function deleteBranchMapping(companyId: string, id: string, actorId?: string): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const { error } = await supabase.from('branch_mappings').delete().eq('company_id', companyId).eq('id', id);
  if (error) {
    loggingService.error('Failed to delete branch mapping', { error }, 'MappingService');
    return { error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'delete', 'branch_mapping', id, { component: 'MappingService' });
  return { error: null };
}

// ─── Payment Method Mappings ──────────────────────────────────────────────────

export async function getPaymentMethodMappings(companyId: string): Promise<{ data: PaymentMethodMapping[]; error: Error | null }> {
  const qid = `payment-mappings-get-${Date.now()}`;
  performanceService.startQueryTimer(qid);

  const { data, error } = await supabase
    .from('payment_method_mappings')
    .select('*')
    .eq('company_id', companyId)
    .order('raw_value');

  performanceService.endQueryTimer(qid, 'get_payment_mappings');

  if (error) {
    loggingService.error('Failed to get payment method mappings', { error }, 'MappingService');
    return { data: [], error: new Error(error.message) };
  }

  return {
    data: (data || []).map(r => ({
      id: r.id,
      rawValue: r.raw_value,
      canonicalValue: r.canonical_value,
      notes: r.notes ?? undefined,
      companyId: r.company_id,
    })),
    error: null,
  };
}

export async function createPaymentMethodMapping(
  mapping: Omit<PaymentMethodMapping, 'id'>,
): Promise<{ data: PaymentMethodMapping | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('payment_method_mappings')
    .insert({
      raw_value: mapping.rawValue,
      canonical_value: mapping.canonicalValue,
      notes: mapping.notes ?? null,
      company_id: mapping.companyId,
    })
    .select()
    .single();

  if (error) {
    loggingService.error('Failed to create payment method mapping', { error }, 'MappingService');
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: { id: data.id, rawValue: data.raw_value, canonicalValue: data.canonical_value, notes: data.notes ?? undefined, companyId: data.company_id },
    error: null,
  };
}

export async function updatePaymentMethodMapping(
  companyId: string,
  id: string,
  updates: Partial<Pick<PaymentMethodMapping, 'rawValue' | 'canonicalValue' | 'notes'>>,
  actorId?: string,
): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const dbUpdates: Record<string, unknown> = {};
  if (updates.rawValue !== undefined) dbUpdates.raw_value = updates.rawValue;
  if (updates.canonicalValue !== undefined) dbUpdates.canonical_value = updates.canonicalValue;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  dbUpdates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('payment_method_mappings').update(dbUpdates).eq('company_id', companyId).eq('id', id);
  if (error) {
    loggingService.error('Failed to update payment method mapping', { error }, 'MappingService');
    return { error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'update', 'payment_method_mapping', id, { component: 'MappingService' });
  return { error: null };
}

export async function deletePaymentMethodMapping(companyId: string, id: string, actorId?: string): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const { error } = await supabase.from('payment_method_mappings').delete().eq('company_id', companyId).eq('id', id);
  if (error) {
    loggingService.error('Failed to delete payment method mapping', { error }, 'MappingService');
    return { error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'delete', 'payment_method_mapping', id, { component: 'MappingService' });
  return { error: null };
}

// ─── Lookup helpers used by import-parser ────────────────────────────────────

/** Returns a Map<UPPER(rawValue), canonicalCode> for branch mappings */
export async function loadBranchMappingLookup(companyId: string): Promise<Map<string, string>> {
  const { data } = await getBranchMappings(companyId);
  return new Map(
    data
      .filter(m => m.rawValue.trim() !== '' && m.canonicalCode.trim() !== '')
      .map(m => [m.rawValue.trim().toUpperCase(), m.canonicalCode.trim()])
  );
}

/** Returns a Map<UPPER(rawValue), canonicalValue> for payment method mappings */
export async function loadPaymentMappingLookup(companyId: string): Promise<Map<string, string>> {
  const { data } = await getPaymentMethodMappings(companyId);
  return new Map(data.map(m => [m.rawValue.toUpperCase(), m.canonicalValue]));
}
