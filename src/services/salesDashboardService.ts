/**
 * salesDashboardService — server-side sales KPI summary for dashboard widgets.
 */

import { supabase } from '@/integrations/supabase/client';
import { missingCompanyError } from './salesOrderCrudService';

export interface SalesDashboardSummary {
  mtd: {
    orderCount: number;
    totalValue: number;
  };
  vehiclesLinked: number;
  branchBreakdown: { branchCode: string; orderCount: number }[];
  monthlyTrend: { monthKey: string; orderCount: number }[];
  outstandingAr: number;
}

export async function getSalesDashboardSummary(
  companyId: string,
  branchCode?: string | null,
): Promise<{ data: SalesDashboardSummary | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase.rpc('get_sales_dashboard_summary', {
    p_company_id: companyId,
    p_branch_code: (branchCode ?? null) as unknown as string | undefined,
  });
  if (error) return { data: null, error: new Error(error.message) };
  const raw = data as Record<string, unknown>;
  const mtd = raw.mtd as Record<string, unknown>;
  return {
    data: {
      mtd: {
        orderCount: Number(mtd.order_count),
        totalValue: Number(mtd.total_value),
      },
      vehiclesLinked: Number(raw.vehicles_linked),
      branchBreakdown: ((raw.branch_breakdown as Record<string, unknown>[]) ?? []).map(b => ({
        branchCode: b.branch_code as string,
        orderCount: Number(b.order_count),
      })),
      monthlyTrend: ((raw.monthly_trend as Record<string, unknown>[]) ?? []).map(t => ({
        monthKey: t.month_key as string,
        orderCount: Number(t.order_count),
      })),
      outstandingAr: Number(raw.outstanding_ar),
    },
    error: null,
  };
}
