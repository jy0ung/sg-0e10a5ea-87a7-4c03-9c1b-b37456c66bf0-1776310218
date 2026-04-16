import { supabase } from '@/integrations/supabase/client';
import type { CommissionRule, CommissionRecord } from '@/types';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';

// ─── Commission Rules ─────────────────────────────────────────────────────────

export async function getCommissionRules(companyId: string): Promise<{ data: CommissionRule[]; error: Error | null }> {
  const qid = `commission-rules-${Date.now()}`;
  performanceService.startQueryTimer(qid);

  const { data, error } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  performanceService.endQueryTimer(qid, 'get_commission_rules');

  if (error) {
    loggingService.error('Failed to get commission rules', { error }, 'CommissionService');
    return { data: [], error: new Error(error.message) };
  }

  return {
    data: (data || []).map(r => ({
      id: r.id,
      salesmanName: r.salesman_name ?? undefined,
      branchCode: r.branch_code ?? undefined,
      ruleName: r.rule_name,
      thresholdDays: r.threshold_days ?? undefined,
      amount: Number(r.amount),
      companyId: r.company_id,
    })),
    error: null,
  };
}

export async function createCommissionRule(
  rule: Omit<CommissionRule, 'id'>,
): Promise<{ data: CommissionRule | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('commission_rules')
    .insert({
      salesman_name: rule.salesmanName ?? null,
      branch_code: rule.branchCode ?? null,
      rule_name: rule.ruleName,
      threshold_days: rule.thresholdDays ?? null,
      amount: rule.amount,
      company_id: rule.companyId,
    })
    .select()
    .single();

  if (error) {
    loggingService.error('Failed to create commission rule', { error }, 'CommissionService');
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: {
      id: data.id,
      salesmanName: data.salesman_name ?? undefined,
      branchCode: data.branch_code ?? undefined,
      ruleName: data.rule_name,
      thresholdDays: data.threshold_days ?? undefined,
      amount: Number(data.amount),
      companyId: data.company_id,
    },
    error: null,
  };
}

export async function updateCommissionRule(
  id: string,
  updates: Partial<Omit<CommissionRule, 'id' | 'companyId'>>,
): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.salesmanName !== undefined) dbUpdates.salesman_name = updates.salesmanName ?? null;
  if (updates.branchCode !== undefined) dbUpdates.branch_code = updates.branchCode ?? null;
  if (updates.ruleName !== undefined) dbUpdates.rule_name = updates.ruleName;
  if (updates.thresholdDays !== undefined) dbUpdates.threshold_days = updates.thresholdDays ?? null;
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;

  const { error } = await supabase.from('commission_rules').update(dbUpdates).eq('id', id);
  if (error) {
    loggingService.error('Failed to update commission rule', { error }, 'CommissionService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function deleteCommissionRule(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('commission_rules').delete().eq('id', id);
  if (error) {
    loggingService.error('Failed to delete commission rule', { error }, 'CommissionService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

// ─── Commission Records ───────────────────────────────────────────────────────

export async function getCommissionRecords(
  companyId: string,
  filters?: { salesmanName?: string; period?: string; status?: CommissionRecord['status'] }
): Promise<{ data: CommissionRecord[]; error: Error | null }> {
  const qid = `commission-records-${Date.now()}`;
  performanceService.startQueryTimer(qid);

  let query = supabase
    .from('commission_records')
    .select('*, commission_rules(rule_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (filters?.salesmanName) query = query.eq('salesman_name', filters.salesmanName);
  if (filters?.period) query = query.eq('period', filters.period);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  performanceService.endQueryTimer(qid, 'get_commission_records');

  if (error) {
    loggingService.error('Failed to get commission records', { error }, 'CommissionService');
    return { data: [], error: new Error(error.message) };
  }

  return {
    data: (data || []).map(r => ({
      id: r.id,
      vehicleId: r.vehicle_id ?? undefined,
      chassisNo: r.chassis_no,
      salesmanName: r.salesman_name,
      ruleId: r.rule_id ?? undefined,
      ruleName: (r.commission_rules as { rule_name: string } | null)?.rule_name ?? undefined,
      status: r.status as CommissionRecord['status'],
      amount: Number(r.amount),
      period: r.period,
      companyId: r.company_id,
      createdAt: r.created_at,
    })),
    error: null,
  };
}

export async function updateCommissionRecordStatus(
  id: string,
  status: CommissionRecord['status'],
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('commission_records')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    loggingService.error('Failed to update commission record status', { error }, 'CommissionService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/**
 * Compute and persist commission records for a given period.
 * For each vehicle closed (has delivery_date) in the period, checks applicable rules.
 * Simple rule: if bg_to_delivery ≤ rule.threshold_days → award rule.amount.
 */
export async function computeAndSaveCommissions(
  companyId: string,
  period: string,       // 'YYYY-MM'
  vehicles: Array<{ id: string; chassis_no: string; salesman_name: string; branch_code: string; bg_to_delivery?: number | null; delivery_date?: string }>,
  rules: CommissionRule[],
): Promise<{ created: number; error: Error | null }> {
  const [year, month] = period.split('-').map(Number);
  const periodVehicles = vehicles.filter(v => {
    if (!v.delivery_date) return false;
    const d = new Date(v.delivery_date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  const records: Array<Record<string, unknown>> = [];

  for (const vehicle of periodVehicles) {
    for (const rule of rules) {
      // Match rule to vehicle (salesman + branch filters)
      if (rule.salesmanName && rule.salesmanName !== vehicle.salesman_name) continue;
      if (rule.branchCode && rule.branchCode !== vehicle.branch_code) continue;

      // Threshold check: if rule has threshold_days, vehicle must be within it
      if (rule.thresholdDays !== undefined && rule.thresholdDays !== null) {
        if (vehicle.bg_to_delivery == null || vehicle.bg_to_delivery > rule.thresholdDays) continue;
      }

      records.push({
        vehicle_id: vehicle.id,
        chassis_no: vehicle.chassis_no,
        salesman_name: vehicle.salesman_name,
        rule_id: rule.id,
        status: 'pending',
        amount: rule.amount,
        period,
        company_id: companyId,
      });
    }
  }

  if (records.length === 0) return { created: 0, error: null };

  const { error } = await supabase
    .from('commission_records')
    .upsert(records as Parameters<typeof supabase.from>[0] extends string ? never : never, {
      onConflict: 'vehicle_id,rule_id',
      ignoreDuplicates: true,
    });

  // upsert type workaround: insert without conflict handling
  const { error: insertError } = await supabase
    .from('commission_records')
    .insert(records as Parameters<typeof supabase.from>[0] extends string ? never : never);

  if (insertError && !insertError.message.includes('duplicate')) {
    loggingService.error('Failed to save commission records', { error: insertError }, 'CommissionService');
    return { created: 0, error: new Error(insertError.message) };
  }

  return { created: records.length, error: null };
}
