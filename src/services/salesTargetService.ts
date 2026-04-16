import { supabase } from '@/integrations/supabase/client';
import { SalesmanTarget, SalesmanPerformance } from '@/types';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';

function mapTarget(row: Record<string, unknown>): SalesmanTarget {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    salesmanId: row.salesman_id as string,
    salesmanName: row.salesman_name as string,
    branchCode: row.branch_code as string,
    year: row.year as number,
    month: row.month as number,
    targetUnits: row.target_units as number,
    targetRevenue: row.target_revenue as number | undefined,
    createdAt: row.created_at as string,
  };
}

export async function getSalesmanTargets(companyId: string, year?: number, month?: number): Promise<{ data: SalesmanTarget[]; error: Error | null }> {
  const timerId = performanceService.startQueryTimer('getSalesmanTargets');
  let query = supabase.from('salesman_targets').select('*').eq('company_id', companyId);
  if (year !== undefined) query = query.eq('year', year);
  if (month !== undefined) query = query.eq('month', month);
  const { data, error } = await query.order('year', { ascending: false }).order('month', { ascending: false });
  performanceService.endQueryTimer(timerId);
  if (error) { loggingService.error('getSalesmanTargets failed', { error }); return { data: [], error: new Error(error.message) }; }
  return { data: (data ?? []).map(r => mapTarget(r as Record<string, unknown>)), error: null };
}

export async function upsertSalesmanTarget(companyId: string, fields: Omit<SalesmanTarget, 'id' | 'companyId' | 'createdAt'>): Promise<{ data: SalesmanTarget | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('salesman_targets')
    .upsert({
      company_id: companyId,
      salesman_id: fields.salesmanId,
      salesman_name: fields.salesmanName,
      branch_code: fields.branchCode,
      year: fields.year,
      month: fields.month,
      target_units: fields.targetUnits,
      target_revenue: fields.targetRevenue,
    }, { onConflict: 'company_id,salesman_id,year,month' })
    .select()
    .single();
  if (error) { loggingService.error('upsertSalesmanTarget failed', { error }); return { data: null, error: new Error(error.message) }; }
  return { data: mapTarget(data as Record<string, unknown>), error: null };
}

export async function deleteSalesmanTarget(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('salesman_targets').delete().eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Compute actual performance across sales_orders for the given period and compare to targets.
 */
export async function computeSalesmanActuals(companyId: string, year: number, month: number): Promise<{ data: SalesmanPerformance[]; error: Error | null }> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const [ordersResult, targetsResult] = await Promise.all([
    supabase.from('sales_orders').select('salesman_id, salesman_name, branch_code, total_price, status, delivery_date').eq('company_id', companyId).gte('booking_date', startDate).lte('booking_date', endDate),
    getSalesmanTargets(companyId, year, month),
  ]);

  if (ordersResult.error) return { data: [], error: new Error(ordersResult.error.message) };

  const orders = (ordersResult.data ?? []) as Record<string, unknown>[];

  // Group by salesman_id
  const map = new Map<string, { id: string; name: string; branch: string; totalUnits: number; totalRevenue: number; deliveredUnits: number; prices: number[] }>();
  for (const o of orders) {
    const sid = (o.salesman_id ?? 'unknown') as string;
    if (!map.has(sid)) {
      map.set(sid, { id: sid, name: o.salesman_name as string ?? sid, branch: o.branch_code as string ?? '', totalUnits: 0, totalRevenue: 0, deliveredUnits: 0, prices: [] });
    }
    const entry = map.get(sid)!;
    entry.totalUnits++;
    const price = o.total_price as number ?? 0;
    entry.totalRevenue += price;
    entry.prices.push(price);
    if (o.status === 'delivered') entry.deliveredUnits++;
  }

  const targets = targetsResult.data;
  const targetMap = new Map(targets.map(t => [t.salesmanId, t]));

  const result: SalesmanPerformance[] = [];
  for (const [salesmanId, s] of map.entries()) {
    const target = targetMap.get(salesmanId);
    const avgPrice = s.prices.length > 0 ? s.totalRevenue / s.prices.length : 0;
    result.push({
      salesmanId,
      salesmanName: s.name,
      branchCode: s.branch,
      totalOrders: s.totalUnits,
      confirmedOrders: s.totalUnits,
      deliveredOrders: s.deliveredUnits,
      totalRevenue: s.totalRevenue,
      avgDealSize: avgPrice,
      targetUnits: target?.targetUnits ?? 0,
      targetRevenue: target?.targetRevenue ?? 0,
      achievementPct: target?.targetUnits ? (s.totalUnits / target.targetUnits) * 100 : undefined,
    });
  }
  return { data: result.sort((a, b) => b.totalOrders - a.totalOrders), error: null };
}
