import { supabase } from '@/integrations/supabase/client';
import { SalesmanTarget, SalesmanPerformance } from '@/types';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';

function mapTarget(row: Record<string, unknown>): SalesmanTarget {
  return {
    id: row.id as string,
    employeeId: (row.employee_id as string | null) ?? null,
    companyId: row.company_id as string,
    salesmanName: row.salesman_name as string,
    branchCode: row.branch_code as string,
    periodYear: row.period_year as number,
    periodMonth: row.period_month as number,
    targetUnits: row.target_units as number,
    targetRevenue: row.target_revenue as number,
  };
}

export async function getSalesmanTargets(companyId: string, year?: number, month?: number): Promise<{ data: SalesmanTarget[]; error: Error | null }> {
  performanceService.startQueryTimer('getSalesmanTargets');
  let query = supabase.from('salesman_targets').select('*').eq('company_id', companyId);
  if (year !== undefined) query = query.eq('period_year', year);
  if (month !== undefined) query = query.eq('period_month', month);
  const { data, error } = await query.order('period_year', { ascending: false }).order('period_month', { ascending: false });
  performanceService.endQueryTimer('getSalesmanTargets', 'getSalesmanTargets');
  if (error) { loggingService.error('getSalesmanTargets failed', { error }); return { data: [], error: new Error(error.message) }; }
  return { data: (data ?? []).map(r => mapTarget(r as Record<string, unknown>)), error: null };
}

function missingCompanyError(): Error {
  return new Error('Company context is required for salesman target mutations');
}

export async function upsertSalesmanTarget(companyId: string, fields: Omit<SalesmanTarget, 'id' | 'companyId'>, actorId?: string): Promise<{ data: SalesmanTarget | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  if (!fields.employeeId) return { data: null, error: new Error('Select an Employee for this target') };
  if (!Number.isInteger(fields.targetUnits) || fields.targetUnits < 0 || !Number.isFinite(fields.targetRevenue) || fields.targetRevenue < 0) {
    return { data: null, error: new Error('Targets must be nonnegative numbers; units must be whole') };
  }
  const { data, error } = await supabase
    .from('salesman_targets')
    .upsert({
      employee_id: fields.employeeId,
      company_id: companyId,
      salesman_name: fields.salesmanName,
      branch_code: fields.branchCode,
      period_year: fields.periodYear,
      period_month: fields.periodMonth,
      target_units: fields.targetUnits,
      target_revenue: fields.targetRevenue,
    }, { onConflict: 'company_id,employee_id,branch_code,period_year,period_month' })
    .select()
    .single();
  if (error) { loggingService.error('upsertSalesmanTarget failed', { error }); return { data: null, error: new Error(error.message) }; }
  if (actorId) void logUserAction(actorId, 'update', 'salesman_target', String((data as Record<string, unknown>).id), { component: 'SalesTargetService' });
  return { data: mapTarget(data as Record<string, unknown>), error: null };
}

export async function deleteSalesmanTarget(companyId: string, id: string, actorId?: string): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const { data, error } = await supabase.from('salesman_targets').delete().eq('company_id', companyId).eq('id', id).select('id').maybeSingle();
  if (error) return { error: new Error(error.message) };
  if (!data) return { error: new Error('Target was not found or you do not have permission to remove it') };
  if (actorId) void logUserAction(actorId, 'delete', 'salesman_target', id, { component: 'SalesTargetService' });
  return { error: null };
}

/** Booking-month order metrics, resolved to Employees by stable source relationships. */
export async function computeSalesmanActuals(companyId: string, year: number, month: number): Promise<{ data: SalesmanPerformance[]; error: Error | null }> {
  if (!companyId) return { data: [], error: missingCompanyError() };
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return { data: [], error: new Error('A valid year and month are required') };
  }
  const { data, error } = await supabase.rpc('salesman_actuals', {
    p_company_id: companyId, p_year: year, p_month: month,
  });
  if (error) return { data: [], error: new Error(error.message) };
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { data: rows.map(row => {
    const totalDeals = Number(row.total_deals);
    const closedDeals = Number(row.closed_deals);
    const totalRevenue = Number(row.total_revenue);
    const employeeId = (row.employee_id as string | null) ?? null;
    const targetUnits = row.target_units == null ? undefined : Number(row.target_units);
    return {
      identityKey: String(row.identity_key), employeeId,
      identityStatus: employeeId ? 'employee' as const : 'unresolved' as const,
      salesmanName: String(row.salesman_name), branchCode: String(row.branch_code ?? ''),
      totalDeals, closedDeals, totalRevenue,
      avgDealValue: totalDeals ? totalRevenue / totalDeals : 0,
      conversionRate: totalDeals ? closedDeals / totalDeals * 100 : 0,
      commissionEarned: 0,
      targetUnits, targetRevenue: row.target_revenue == null ? undefined : Number(row.target_revenue),
      targetAchievement: employeeId && targetUnits ? totalDeals / targetUnits * 100 : undefined,
    };
  }), error: null };
}
