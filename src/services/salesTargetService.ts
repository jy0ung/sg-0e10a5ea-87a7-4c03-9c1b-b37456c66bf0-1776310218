import { supabase } from '@/integrations/supabase/client';
import { SalesmanTarget, SalesmanPerformance } from '@/types';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';

function mapTarget(row: Record<string, unknown>): SalesmanTarget {
  return {
    id: row.id as string,
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
  const { data, error } = await supabase
    .from('salesman_targets')
    .upsert({
      company_id: companyId,
      salesman_name: fields.salesmanName,
      branch_code: fields.branchCode,
      period_year: fields.periodYear,
      period_month: fields.periodMonth,
      target_units: fields.targetUnits,
      target_revenue: fields.targetRevenue,
    }, { onConflict: 'company_id,salesman_name,branch_code,period_year,period_month' })
    .select()
    .single();
  if (error) { loggingService.error('upsertSalesmanTarget failed', { error }); return { data: null, error: new Error(error.message) }; }
  if (actorId) void logUserAction(actorId, 'update', 'salesman_target', String((data as Record<string, unknown>).id), { component: 'SalesTargetService' });
  return { data: mapTarget(data as Record<string, unknown>), error: null };
}

export async function deleteSalesmanTarget(companyId: string, id: string, actorId?: string): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const { error } = await supabase.from('salesman_targets').delete().eq('company_id', companyId).eq('id', id);
  if (error) return { error: new Error(error.message) };
  if (actorId) void logUserAction(actorId, 'delete', 'salesman_target', id, { component: 'SalesTargetService' });
  return { error: null };
}

/**
 * Compute actual performance across sales_orders for the given period and compare to targets.
 */
export async function computeSalesmanActuals(companyId: string, year: number, month: number): Promise<{ data: SalesmanPerformance[]; error: Error | null }> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // Statuses considered "closed/delivered" in the legacy order_status field.
  const DELIVERED_STATUSES = new Set(['delivered', 'Delivered', 'DELIVERED', 'completed', 'Completed', 'COMPLETED']);

  const [ordersResult, targetsResult] = await Promise.all([
    supabase
      .from('sales_orders')
      .select('salesman_id, salesman_name, branch_code, selling_price, order_status')
      .eq('company_id', companyId)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate),
    getSalesmanTargets(companyId, year, month),
  ]);

  if (ordersResult.error) return { data: [], error: new Error(ordersResult.error.message) };

  const orders = (ordersResult.data ?? []) as unknown as Record<string, unknown>[];

  // Group by salesman_id (UUID) when available, fall back to salesman_name string.
  // Key format: "id:<uuid>" or "name:<salesman_name>"
  const map = new Map<string, { id: string | null; name: string; branch: string; totalUnits: number; totalRevenue: number; deliveredUnits: number; prices: number[] }>();
  for (const o of orders) {
    const sid  = (o.salesman_id  as string | null) ?? null;
    const name = ((o.salesman_name as string) ?? 'unknown').trim() || 'unknown';
    const key  = sid ? `id:${sid}` : `name:${name}`;
    if (!map.has(key)) {
      map.set(key, { id: sid, name, branch: (o.branch_code as string) ?? '', totalUnits: 0, totalRevenue: 0, deliveredUnits: 0, prices: [] });
    }
    const entry = map.get(key)!;
    entry.totalUnits++;
    const price = Number(o.selling_price ?? 0);
    entry.totalRevenue += price;
    entry.prices.push(price);
    if (DELIVERED_STATUSES.has(o.order_status as string)) entry.deliveredUnits++;
  }

  const targets = targetsResult.data;
  // Target lookup: by salesmanName string (salesman_id FK on salesman_targets is a future enhancement)
  const targetMap = new Map(targets.map(t => [t.salesmanName, t]));

  const result: SalesmanPerformance[] = [];
  for (const s of map.values()) {
    const target = targetMap.get(s.name);
    const avgPrice = s.prices.length > 0 ? s.totalRevenue / s.prices.length : 0;
    result.push({
      salesmanName: s.name,
      branchCode: s.branch,
      totalDeals: s.totalUnits,
      closedDeals: s.deliveredUnits,
      totalRevenue: s.totalRevenue,
      avgDealValue: avgPrice,
      conversionRate: s.totalUnits > 0 ? (s.deliveredUnits / s.totalUnits) * 100 : 0,
      commissionEarned: 0,
      targetUnits: target?.targetUnits ?? 0,
      targetRevenue: target?.targetRevenue ?? 0,
      targetAchievement: target?.targetUnits ? (s.totalUnits / target.targetUnits) * 100 : undefined,
    });
  }
  return { data: result.sort((a, b) => b.totalDeals - a.totalDeals), error: null };
}
