import React, { createContext, useContext, useCallback, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Customer, DealStage, SalesOrder, Invoice, SalesmanTarget } from '@/types';
import { getCustomers } from '@/services/customerService';
import { getSalesOrders, moveSalesOrderStage, updateSalesOrder } from '@/services/salesOrderService';
import { getInvoices } from '@/services/invoiceService';
import { getSalesmanTargets } from '@/services/salesTargetService';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { resolveBranchCode } from '@/services/branchService';

/** Stable query key factory — import in tests to reuse. */
export const salesQueryKey = (companyId: string, branchId?: string | null) =>
  ['sales', companyId, branchId ?? 'all'] as const;

interface SalesData {
  customers: Customer[];
  salesOrders: SalesOrder[];
  dealStages: DealStage[];
  invoices: Invoice[];
  salesmanTargets: SalesmanTarget[];
}

async function fetchSalesData(companyId: string, branchCode?: string | null): Promise<SalesData> {
  const [customersRes, ordersRes, stagesRes, invoicesRes, targetsRes] = await Promise.all([
    getCustomers(companyId),
    getSalesOrders(companyId, branchCode),
    supabase.from('deal_stages').select('*').eq('company_id', companyId).order('stage_order'),
    getInvoices(companyId),
    getSalesmanTargets(companyId),
  ]);

  const dealStages = (stagesRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    companyId: r.company_id as string,
    name: r.name as string,
    stageOrder: r.stage_order as number,
    color: r.color as string,
  }));

  return {
    customers: customersRes.data,
    salesOrders: ordersRes.data,
    dealStages,
    invoices: invoicesRes.data,
    salesmanTargets: targetsRes.data,
  };
}

interface SalesContextValue {
  customers: Customer[];
  salesOrders: SalesOrder[];
  dealStages: DealStage[];
  invoices: Invoice[];
  salesmanTargets: SalesmanTarget[];
  loading: boolean;
  reloadSales: () => Promise<void>;
  moveOrderStage: (orderId: string, stageId: string) => Promise<void>;
  updateOrder: (id: string, fields: Partial<SalesOrder>) => Promise<void>;
}

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesProvider({ children }: { children: ReactNode }) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Branch-scoped users only see their branch's sales orders.
  const branchId = user?.access_scope === 'branch' ? (user.branch_id ?? null) : null;

  const { data, isLoading } = useQuery({
    queryKey: salesQueryKey(companyId, branchId),
    queryFn: async () => {
      let branchCode: string | null = null;
      if (branchId) {
        branchCode = await resolveBranchCode(branchId);
      }
      return fetchSalesData(companyId, branchCode);
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  /** Invalidates the cache and awaits the next successful fetch. */
  const reloadSales = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: salesQueryKey(companyId, branchId) });
  }, [queryClient, companyId, branchId]);

  // Realtime: invalidate the sales cache whenever a sales_order row changes.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`realtime:sales_orders:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_orders', filter: `company_id=eq.${companyId}` },
        () => { queryClient.invalidateQueries({ queryKey: salesQueryKey(companyId, branchId) }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, branchId, queryClient]);

  /** Optimistically update deal-stage in cache then persist to DB. */
  const moveOrderStage = useCallback(async (orderId: string, stageId: string) => {
    await moveSalesOrderStage(orderId, stageId);
    queryClient.setQueryData<SalesData>(salesQueryKey(companyId, branchId), prev =>
      prev ? { ...prev, salesOrders: prev.salesOrders.map(o => o.id === orderId ? { ...o, dealStageId: stageId } : o) } : prev
    );
  }, [queryClient, companyId, branchId]);

  /** Optimistically update order fields in cache then persist to DB. */
  const updateOrder = useCallback(async (id: string, fields: Partial<SalesOrder>) => {
    await updateSalesOrder(id, fields);
    queryClient.setQueryData<SalesData>(salesQueryKey(companyId, branchId), prev =>
      prev ? { ...prev, salesOrders: prev.salesOrders.map(o => o.id === id ? { ...o, ...fields } : o) } : prev
    );
  }, [queryClient, companyId, branchId]);

  return (
    <SalesContext.Provider value={{
      customers: data?.customers ?? [],
      salesOrders: data?.salesOrders ?? [],
      dealStages: data?.dealStages ?? [],
      invoices: data?.invoices ?? [],
      salesmanTargets: data?.salesmanTargets ?? [],
      loading: isLoading,
      reloadSales,
      moveOrderStage,
      updateOrder,
    }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales(): SalesContextValue {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within SalesProvider');
  return ctx;
}
