import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Customer, DealStage, SalesOrder, Invoice, SalesmanTarget } from '@/types';
import { getCustomers } from '@/services/customerService';
import { getSalesOrders, moveSalesOrderStage, updateSalesOrder } from '@/services/salesOrderService';
import { getInvoices } from '@/services/invoiceService';
import { getSalesmanTargets } from '@/services/salesTargetService';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';

/** Stable query key factory — import in tests to reuse. */
export const salesQueryKey = (companyId: string) => ['sales', companyId] as const;

interface SalesData {
  customers: Customer[];
  salesOrders: SalesOrder[];
  dealStages: DealStage[];
  invoices: Invoice[];
  salesmanTargets: SalesmanTarget[];
}

async function fetchSalesData(companyId: string): Promise<SalesData> {
  const [customersRes, ordersRes, stagesRes, invoicesRes, targetsRes] = await Promise.all([
    getCustomers(companyId),
    getSalesOrders(companyId),
    supabase.from('deal_stages').select('*').eq('company_id', companyId).order('sort_order'),
    getInvoices(companyId),
    getSalesmanTargets(companyId),
  ]);

  const dealStages = (stagesRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    companyId: r.company_id as string,
    name: r.name as string,
    sortOrder: r.sort_order as number,
    isTerminal: r.is_terminal as boolean,
    colour: r.colour as string | undefined,
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
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: salesQueryKey(companyId),
    queryFn: () => fetchSalesData(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  /** Invalidates the cache and awaits the next successful fetch. */
  const reloadSales = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: salesQueryKey(companyId) });
  }, [queryClient, companyId]);

  /** Optimistically update deal-stage in cache then persist to DB. */
  const moveOrderStage = useCallback(async (orderId: string, stageId: string) => {
    await moveSalesOrderStage(orderId, stageId);
    queryClient.setQueryData<SalesData>(salesQueryKey(companyId), prev =>
      prev ? { ...prev, salesOrders: prev.salesOrders.map(o => o.id === orderId ? { ...o, dealStageId: stageId } : o) } : prev
    );
  }, [queryClient, companyId]);

  /** Optimistically update order fields in cache then persist to DB. */
  const updateOrder = useCallback(async (id: string, fields: Partial<SalesOrder>) => {
    await updateSalesOrder(id, fields);
    queryClient.setQueryData<SalesData>(salesQueryKey(companyId), prev =>
      prev ? { ...prev, salesOrders: prev.salesOrders.map(o => o.id === id ? { ...o, ...fields } : o) } : prev
    );
  }, [queryClient, companyId]);

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
