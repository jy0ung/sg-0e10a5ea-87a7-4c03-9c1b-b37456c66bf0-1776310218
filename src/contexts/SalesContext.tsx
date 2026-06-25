/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Customer, DealStage, SalesOrder, Invoice, SalesmanTarget } from '@/types';
import { getCustomers } from '@/services/customerService';
import { getSalesOrders, transitionOrderStage, updateSalesOrder } from '@/services/salesOrderService';
import { getInvoices } from '@/services/invoiceService';
import { getSalesmanTargets } from '@/services/salesTargetService';
import { getDealStages } from '@/services/dealStageService';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { resolveBranchCode } from '@/services/branchService';
import { STALE } from '@/lib/queryClient';

/** Stable query key factory — import in tests to reuse. */
export const salesQueryKey = (companyId: string, branchId?: string | null) =>
  ['sales', companyId, branchId ?? 'all'] as const;

// Individual query keys for per-entity caching
export const customersKey = (companyId: string) => ['sales-customers', companyId] as const;
export const ordersKey = (companyId: string, branchCode?: string | null) => ['sales-orders', companyId, branchCode ?? 'all'] as const;
export const stagesKey = (companyId: string) => ['sales-stages', companyId] as const;
export const invoicesKey = (companyId: string) => ['sales-invoices', companyId] as const;
export const targetsKey = (companyId: string) => ['sales-targets', companyId] as const;

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

  const branchId = user?.access_scope === 'branch' ? (user.branch_id ?? null) : null;

  // Resolve branch code lazily
  const { data: branchCode } = useQuery({
    queryKey: ['branch-code', branchId],
    queryFn: () => resolveBranchCode(branchId!),
    enabled: !!branchId,
    staleTime: STALE.reference,
  });

  // Independent queries — each loads only when needed
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: customersKey(companyId),
    queryFn: async () => (await getCustomers(companyId)).data,
    enabled: !!companyId,
    staleTime: STALE.reference,
  });

  const { data: salesOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ordersKey(companyId, branchCode),
    queryFn: async () => (await getSalesOrders(companyId, branchCode)).data,
    enabled: !!companyId,
    staleTime: STALE.transactional,
  });

  const { data: dealStages = [], isLoading: stagesLoading } = useQuery({
    queryKey: stagesKey(companyId),
    queryFn: async () => (await getDealStages(companyId)).data,
    enabled: !!companyId,
    staleTime: STALE.reference,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: invoicesKey(companyId),
    queryFn: async () => (await getInvoices(companyId)).data,
    enabled: !!companyId,
    staleTime: STALE.transactional,
  });

  const { data: salesmanTargets = [], isLoading: targetsLoading } = useQuery({
    queryKey: targetsKey(companyId),
    queryFn: async () => (await getSalesmanTargets(companyId)).data,
    enabled: !!companyId,
    staleTime: STALE.reference,
  });

  const loading = customersLoading || ordersLoading || stagesLoading || invoicesLoading || targetsLoading;

  /** Invalidates all sales caches and awaits refetch. */
  const reloadSales = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: customersKey(companyId) }),
      queryClient.invalidateQueries({ queryKey: ordersKey(companyId, branchCode) }),
      queryClient.invalidateQueries({ queryKey: stagesKey(companyId) }),
      queryClient.invalidateQueries({ queryKey: invoicesKey(companyId) }),
      queryClient.invalidateQueries({ queryKey: targetsKey(companyId) }),
    ]);
  }, [queryClient, companyId, branchCode]);

  /** Optimistically update deal-stage in cache then persist via audited RPC. */
  const moveOrderStage = useCallback(async (orderId: string, stageId: string) => {
    await transitionOrderStage(companyId, orderId, stageId, user?.id);
    queryClient.setQueryData<SalesOrder[]>(ordersKey(companyId, branchCode), prev =>
      prev ? prev.map(o => o.id === orderId ? { ...o, dealStageId: stageId } : o) : prev
    );
  }, [queryClient, companyId, branchCode, user?.id]);

  /** Optimistically update order fields in cache then persist to DB. */
  const updateOrder = useCallback(async (id: string, fields: Partial<SalesOrder>) => {
    await updateSalesOrder(companyId, id, fields, user?.id);
    queryClient.setQueryData<SalesOrder[]>(ordersKey(companyId, branchCode), prev =>
      prev ? prev.map(o => o.id === id ? { ...o, ...fields } : o) : prev
    );
  }, [queryClient, companyId, branchCode, user?.id]);

  const contextValue = useMemo(
    () => ({
      customers,
      salesOrders,
      dealStages,
      invoices,
      salesmanTargets,
      loading,
      reloadSales,
      moveOrderStage,
      updateOrder,
    }),
    [customers, salesOrders, dealStages, invoices, salesmanTargets, loading, reloadSales, moveOrderStage, updateOrder],
  );

  return (
    <SalesContext.Provider value={contextValue}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales(): SalesContextValue {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within SalesProvider');
  return ctx;
}
