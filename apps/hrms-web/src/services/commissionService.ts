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
      employeeId: r.employee_id ?? undefined,
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
      employee_id: rule.employeeId ?? null,
      salesman_name: null,
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
      employeeId: data.employee_id ?? undefined,
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
  companyId: string,
  id: string,
  updates: Partial<Omit<CommissionRule, 'id' | 'companyId'>>,
): Promise<{ error: Error | null }> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.employeeId !== undefined) {
    dbUpdates.employee_id = updates.employeeId ?? null;
    dbUpdates.salesman_name = null;
  }
  if (updates.branchCode !== undefined) dbUpdates.branch_code = updates.branchCode ?? null;
  if (updates.ruleName !== undefined) dbUpdates.rule_name = updates.ruleName;
  if (updates.thresholdDays !== undefined) dbUpdates.threshold_days = updates.thresholdDays ?? null;
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;

  const { error } = await supabase.from('commission_rules').update(dbUpdates as never).eq('company_id', companyId).eq('id', id);
  if (error) {
    loggingService.error('Failed to update commission rule', { error }, 'CommissionService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function deleteCommissionRule(companyId: string, id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('commission_rules').delete().eq('id', id).eq('company_id', companyId);
  if (error) {
    loggingService.error('Failed to delete commission rule', { error }, 'CommissionService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

// ─── Commission Records ───────────────────────────────────────────────────────

export async function getCommissionRecords(
  companyId: string,
  filters?: { employeeId?: string; period?: string; status?: CommissionRecord['status'] }
): Promise<{ data: CommissionRecord[]; error: Error | null }> {
  const qid = `commission-records-${Date.now()}`;
  performanceService.startQueryTimer(qid);

  let query = supabase
    .from('commission_records')
    .select('*, commission_rules(rule_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);
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
      employeeId: r.employee_id ?? undefined,
      calculationKey: r.calculation_key ?? undefined,
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
  companyId: string,
  id: string,
  status: CommissionRecord['status'],
): Promise<{ error: Error | null }> {
  if (status !== 'approved' && status !== 'paid') {
    return { error: new Error('Only approval and payment transitions are available') };
  }
  const { error } = await supabase.rpc('advance_commission_record', {
    p_company_id: companyId,
    p_record_id: id,
    p_expected_status: status === 'approved' ? 'pending' : 'approved',
    p_next_status: status,
  });

  if (error) {
    loggingService.error('Failed to update commission record status', { error }, 'CommissionService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function calculateCommissions(
  companyId: string,
  period: string,
): Promise<{ created: number; error: Error | null }> {
  const { data, error } = await supabase.rpc('calculate_commissions', {
    p_company_id: companyId,
    p_period: period,
  });
  if (error) {
    loggingService.error('Failed to calculate commissions', { error }, 'CommissionService');
    return { created: 0, error: new Error(error.message) };
  }
  return { created: Number(data ?? 0), error: null };
}
