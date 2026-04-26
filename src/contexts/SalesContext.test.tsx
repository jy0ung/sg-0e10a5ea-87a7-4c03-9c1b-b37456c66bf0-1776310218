/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesProvider, useSales } from './SalesContext';

// Stub data
const mockCustomers = [{ id: 'c1', name: 'Cust1', company_id: 'comp1' }];
const mockSalesOrders = [
  { id: 'so1', customer_id: 'c1', deal_stage_id: 'ds1', status: 'enquiry', company_id: 'comp1' },
];
const mockDealStages = [
  { id: 'ds1', name: 'Enquiry', stage_order: 1, color: '#3B82F6', company_id: 'comp1' },
  { id: 'ds2', name: 'Quoted', stage_order: 2, color: '#10B981', company_id: 'comp1' },
];
const mockInvoices = [{ id: 'inv1', amount: 100, company_id: 'comp1' }];
const mockTargets = [{ id: 't1', salesman_name: 'John', target: 10, company_id: 'comp1' }];

vi.mock('@/services/customerService', () => ({
  getCustomers: vi.fn(() => Promise.resolve({ data: mockCustomers })),
}));
vi.mock('@/services/salesOrderService', () => ({
  getSalesOrders: vi.fn(() => Promise.resolve({ data: mockSalesOrders })),
  moveSalesOrderStage: vi.fn(() => Promise.resolve()),
  updateSalesOrder: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/services/invoiceService', () => ({
  getInvoices: vi.fn(() => Promise.resolve({ data: mockInvoices })),
}));
vi.mock('@/services/salesTargetService', () => ({
  getSalesmanTargets: vi.fn(() => Promise.resolve({ data: mockTargets })),
}));
vi.mock('@/services/branchService', () => ({
  resolveBranchCode: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/integrations/supabase/client', () => {
  const channelStub = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  return {
    supabase: {
      from: vi.fn(() => {
        const builder: any = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => builder);
        builder.then = (resolve: any) =>
          Promise.resolve({ data: mockDealStages, error: null }).then(resolve);
        return builder;
      }),
      channel: vi.fn(() => channelStub),
      removeChannel: vi.fn(),
    },
  };
});
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user1', company_id: 'comp1' } }),
}));
vi.mock('@/hooks/useCompanyId', () => ({
  useCompanyId: () => 'comp1',
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(SalesProvider, null, children)
    );
}

describe('SalesContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useSales', () => {
    it('throws when used outside SalesProvider', () => {
      expect(() => renderHook(() => useSales())).toThrow(
        'useSales must be used within SalesProvider'
      );
    });

    it('provides initial loading state', () => {
      const { result } = renderHook(() => useSales(), { wrapper: createWrapper() });
      expect(result.current.loading).toBe(true);
      expect(result.current.salesOrders).toEqual([]);
    });
  });

  describe('data fetching', () => {
    it('loads all sales data from services', async () => {
      const { result } = renderHook(() => useSales(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.customers).toHaveLength(1);
      expect(result.current.salesOrders).toHaveLength(1);
      expect(result.current.dealStages).toHaveLength(2);
      expect(result.current.invoices).toHaveLength(1);
      expect(result.current.salesmanTargets).toHaveLength(1);
    });

    it('maps deal stage fields correctly', async () => {
      const { result } = renderHook(() => useSales(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const stage = result.current.dealStages[0];
      expect(stage.id).toBe('ds1');
      expect(stage.name).toBe('Enquiry');
      expect(stage.stageOrder).toBe(1);
      expect(stage.color).toBe('#3B82F6');
      expect(stage.companyId).toBe('comp1');
    });
  });

  describe('mutations', () => {
    it('moveOrderStage updates cache optimistically', async () => {
      const { moveSalesOrderStage } = await import('@/services/salesOrderService');
      const { result } = renderHook(() => useSales(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.moveOrderStage('so1', 'ds2');
      });

      expect(moveSalesOrderStage).toHaveBeenCalledWith('comp1', 'so1', 'ds2', 'user1');

      await waitFor(() => {
        const order = result.current.salesOrders.find(o => o.id === 'so1');
        expect(order?.dealStageId).toBe('ds2');
      });
    });

    it('provides reloadSales function', async () => {
      const { result } = renderHook(() => useSales(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.reloadSales).toBeInstanceOf(Function);
    });
  });
});
