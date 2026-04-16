import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Customer, DealStage, SalesOrder, Invoice, SalesmanTarget } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getCustomers } from '@/services/customerService';
import { getSalesOrders, moveSalesOrderStage, updateSalesOrder } from '@/services/salesOrderService';
import { getInvoices } from '@/services/invoiceService';
import { getSalesmanTargets } from '@/services/salesTargetService';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';

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
  const { user } = useAuth();
  const companyId = useCompanyId();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [salesmanTargets, setSalesmanTargets] = useState<SalesmanTarget[]>([]);
  const [loading, setLoading] = useState(false);

  const reloadSales = useCallback(async () => {
    setLoading(true);
    const [customersRes, ordersRes, stagesRes, invoicesRes, targetsRes] = await Promise.all([
      getCustomers(companyId),
      getSalesOrders(companyId),
      supabase.from('deal_stages').select('*').eq('company_id', companyId).order('sort_order'),
      getInvoices(companyId),
      getSalesmanTargets(companyId),
    ]);
    setCustomers(customersRes.data);
    setSalesOrders(ordersRes.data);
    if (!stagesRes.error) {
      setDealStages(
        (stagesRes.data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          companyId: r.company_id as string,
          name: r.name as string,
          sortOrder: r.sort_order as number,
          isTerminal: r.is_terminal as boolean,
          colour: r.colour as string | undefined,
        }))
      );
    }
    setInvoices(invoicesRes.data);
    setSalesmanTargets(targetsRes.data);
    setLoading(false);
  }, [companyId]);

  const moveOrderStage = useCallback(async (orderId: string, stageId: string) => {
    await moveSalesOrderStage(orderId, stageId);
    setSalesOrders(prev => prev.map(o => o.id === orderId ? { ...o, dealStageId: stageId } : o));
  }, []);

  const updateOrder = useCallback(async (id: string, fields: Partial<SalesOrder>) => {
    await updateSalesOrder(id, fields);
    setSalesOrders(prev => prev.map(o => o.id === id ? { ...o, ...fields } : o));
  }, []);

  return (
    <SalesContext.Provider value={{ customers, salesOrders, dealStages, invoices, salesmanTargets, loading, reloadSales, moveOrderStage, updateOrder }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales(): SalesContextValue {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within SalesProvider');
  return ctx;
}
