import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { DataProvider, useData } from './DataContext';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }))
  }
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { company_id: 'c1' } })
}));

describe('DataContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DataProvider', () => {
    it('provides data context', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
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

      const selectMock = vi.fn().mockReturnThis();
      const orderMock = vi.fn().mockReturnThis();
      orderMock.mockResolvedValueOnce({ data: mockVehicles, error: null });
      orderMock.mockResolvedValueOnce({ data: mockBatches, error: null });
      orderMock.mockResolvedValueOnce({ data: [], error: null });
      orderMock.mockResolvedValueOnce({ data: [], error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
        order: orderMock
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
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
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
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
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const selectMock = vi.fn().mockReturnThis();
      const upsertMock = vi.fn().mockReturnThis();
      const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
        upsert: upsertMock.mockResolvedValue({ error: null }),
        order: orderMock
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await result.current.setVehicles([]);

      expect(upsertMock).toHaveBeenCalled();
    });

    it('addImportBatch inserts batch to database', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      
      vi.mocked(supabase.from).mockReturnValue({
        insert: insertMock
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
      const { result } = renderHook(() => useData(), { wrapper });
      
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

      await result.current.addImportBatch(batch);

      expect(insertMock).toHaveBeenCalled();
      expect(result.current.importBatches).toHaveLength(1);
    });

    it('updateImportBatch updates batch in database', async () => {
      const updateMock = vi.fn().mockResolvedValue({ error: null });
      const eqMock = vi.fn().mockReturnThis();
      
      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock.mockReturnValue({
          eq: eqMock
        })
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await result.current.updateImportBatch('b1', { status: 'completed' });

      expect(updateMock).toHaveBeenCalled();
    });

    it('addQualityIssues inserts issues to database', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      
      vi.mocked(supabase.from).mockReturnValue({
        insert: insertMock
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      const issues = [
        { id: 'iss1', chassisNo: 'CH001', field: 'bg_date', issueType: 'missing' as const,
          message: 'Missing BG date', severity: 'error' as const, importBatchId: 'b1' }
      ];

      await result.current.addQualityIssues(issues);

      expect(insertMock).toHaveBeenCalled();
      expect(result.current.qualityIssues).toHaveLength(1);
    });

    it('updateSla updates SLA in database and refreshes KPIs', async () => {
      const updateMock = vi.fn().mockResolvedValue({ error: null });
      const eqMock = vi.fn().mockReturnThis();
      
      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock.mockReturnValue({
          eq: eqMock
        })
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await result.current.updateSla('sla1', 30);

      expect(updateMock).toHaveBeenCalled();
    });

    it('refreshKpis recalculates KPI summaries', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      const lastRefreshBefore = result.current.lastRefresh;
      
      result.current.refreshKpis();

      expect(result.current.lastRefresh).not.toBe(lastRefreshBefore);
    });

    it('reloadFromDb fetches fresh data from database', async () => {
      const selectMock = vi.fn().mockReturnThis();
      const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: selectMock,
        order: orderMock
      } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataProvider>{children}</DataProvider>
      );
      
      const { result } = renderHook(() => useData(), { wrapper });
      
      await result.current.reloadFromDb();

      expect(orderMock).toHaveBeenCalled();
      expect(result.current.lastRefresh).toBeDefined();
    });
  });
});