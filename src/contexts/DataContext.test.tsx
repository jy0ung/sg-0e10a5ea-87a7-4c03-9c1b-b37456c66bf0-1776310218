/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProvider, useData } from './DataContext';
import { supabase } from '@/integrations/supabase/client';

const createDefaultBuilder = () => {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn(() => Promise.resolve({ data: [], error: null }));
  builder.insert = vi.fn().mockResolvedValue({ error: null });
  builder.update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  builder.upsert = vi.fn().mockResolvedValue({ error: null });
  builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
  return builder;
};

vi.mock('@/integrations/supabase/client', () => {
  const channelStub = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      from: vi.fn(() => createDefaultBuilder()),
      channel: vi.fn(() => channelStub),
      removeChannel: vi.fn(),
    }
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { company_id: 'c1' } })
}));

vi.mock('@/hooks/useCompanyId', () => ({
  useCompanyId: () => 'c1'
}));

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><DataProvider>{children}</DataProvider></QueryClientProvider>
  );
};

describe('DataContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default chainable mock after clearAllMocks
    vi.mocked(supabase.from).mockImplementation(() => createDefaultBuilder());
  });

  describe('DataProvider', () => {
    it('provides data context', () => {
      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      expect(result.current).toBeDefined();
      expect(result.current.vehicles).toEqual([]);
      expect(result.current.loading).toBe(true);
    });

    it('loads data on mount', async () => {
      const mockVehicles = [
        { id: 'v1', chassis_no: 'CH001', branch_code: 'BR1', model: 'Model1', 
          payment_method: 'Cash', salesman_name: 'Sales1', customer_name: 'Cust1',
          bg_to_delivery: 10, bg_to_disb: 15, created_at: new Date().toISOString() }
      ];
      const mockBatches = [
        { id: 'b1', file_name: 'test.xlsx', uploaded_by: 'user1', 
          uploaded_at: new Date().toISOString(), status: 'completed' as const,
          total_rows: 10, valid_rows: 8, error_rows: 2, duplicate_rows: 0 }
      ];

      const tableData: Record<string, unknown[]> = {
        vehicles: mockVehicles,
        import_batches: mockBatches,
        quality_issues: [],
        sla_policies: [],
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const result = { data: tableData[table] ?? [], error: null };
        const builder: any = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => builder);
        builder.range = vi.fn(() => Promise.resolve(result));
        builder.then = (resolve: any) => Promise.resolve(result).then(resolve);
        return builder;
      });

      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.vehicles).toHaveLength(1);
      expect(result.current.importBatches).toHaveLength(1);
    });
  });

  describe('useData', () => {
    it('throws error when used outside provider', () => {
      expect(() => {
        renderHook(() => useData());
      }).toThrow('useData must be used within DataProvider');
    });

    it('provides all data context methods', () => {
      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      expect(result.current.setVehicles).toBeInstanceOf(Function);
      expect(result.current.addImportBatch).toBeInstanceOf(Function);
      expect(result.current.updateImportBatch).toBeInstanceOf(Function);
      expect(result.current.addQualityIssues).toBeInstanceOf(Function);
      expect(result.current.updateSla).toBeInstanceOf(Function);
      expect(result.current.refreshKpis).toBeInstanceOf(Function);
      expect(result.current.reloadFromDb).toBeInstanceOf(Function);
    });
  });

  describe('CRUD operations', () => {
    it('setVehicles upserts vehicles to database', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation(() => {
        const builder: any = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
        builder.upsert = upsertMock;
        builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
        return builder;
      });

      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await act(async () => {
        await result.current.setVehicles([{
          chassis_no: 'CH001', branch_code: 'BR1', model: 'Model1',
          payment_method: 'Cash', salesman_name: 'Sales1', customer_name: 'Cust1',
          is_d2d: false,
        } as any]);
      });

      expect(upsertMock).toHaveBeenCalled();
    });

    it('addImportBatch inserts batch to database', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      
      vi.mocked(supabase.from).mockImplementation(() => {
        const builder: any = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
        builder.insert = insertMock;
        builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
        return builder;
      });

      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });

      // Wait for mount-time reloadFromDb to finish
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      
      const batch = {
        id: 'b1',
        fileName: 'test.xlsx',
        uploadedBy: 'user1',
        uploadedAt: new Date().toISOString(),
        status: 'pending' as const,
        totalRows: 10,
        validRows: 8,
        errorRows: 2,
        duplicateRows: 0
      };

      await act(async () => {
        await result.current.addImportBatch(batch);
      });

      expect(insertMock).toHaveBeenCalled();
      expect(result.current.importBatches).toHaveLength(1);
    });

    it('updateImportBatch updates batch in database', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      
      vi.mocked(supabase.from).mockImplementation(() => {
        const builder: any = createDefaultBuilder();
        builder.update = updateMock;
        return builder;
      });

      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await result.current.updateImportBatch('b1', { status: 'completed' });

      expect(updateMock).toHaveBeenCalled();
    });

    it('addQualityIssues inserts issues to database', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      
      vi.mocked(supabase.from).mockImplementation(() => {
        const builder: any = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
        builder.insert = insertMock;
        builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
        return builder;
      });

      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });

      // Wait for mount-time reloadFromDb to finish
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      
      const issues = [
        { id: 'iss1', chassisNo: 'CH001', field: 'bg_date', issueType: 'missing' as const,
          message: 'Missing BG date', severity: 'error' as const, importBatchId: 'b1' }
      ];

      await act(async () => {
        await result.current.addQualityIssues(issues);
      });

      expect(insertMock).toHaveBeenCalled();
      expect(result.current.qualityIssues).toHaveLength(1);
    });

    it('updateSla updates SLA in database and refreshes KPIs', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      
      vi.mocked(supabase.from).mockImplementation(() => {
        const builder: any = createDefaultBuilder();
        builder.update = updateMock;
        return builder;
      });

      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await result.current.updateSla('sla1', 30);

      expect(updateMock).toHaveBeenCalled();
    });

    it('refreshKpis recalculates KPI summaries', async () => {
      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      const lastRefreshBefore = result.current.lastRefresh;

      // Wait a tick so the timestamp differs
      await new Promise(resolve => setTimeout(resolve, 5));

      result.current.refreshKpis();

      await waitFor(() => {
        expect(result.current.lastRefresh).not.toBe(lastRefreshBefore);
      });
    });

    it('reloadFromDb fetches fresh data from database', async () => {
      const orderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));

      vi.mocked(supabase.from).mockImplementation(() => {
        const builder: any = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.order = orderMock;
        builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
        return builder;
      });

      const wrapper = makeWrapper();
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await result.current.reloadFromDb();

      expect(orderMock).toHaveBeenCalled();
      expect(result.current.lastRefresh).toBeDefined();
    });
  });
});