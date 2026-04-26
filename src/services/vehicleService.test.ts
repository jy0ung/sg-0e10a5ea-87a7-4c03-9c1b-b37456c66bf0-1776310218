import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVehicleById, updateVehicleWithAudit, searchVehicles, invalidateVehicleCaches } from './vehicleService';
import { supabase } from '@/integrations/supabase/client';
import * as auditService from './auditService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis()
    }))
  }
}));

vi.mock('./auditService', () => ({
  logUserAction: vi.fn(),
  logVehicleEdit: vi.fn()
}));

describe('vehicleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateVehicleCaches();
  });

  describe('getVehicleById', () => {
    it('returns vehicle data on success', async () => {
      const mockVehicle = { id: 'v1', chassis_no: 'CH123' };
      const singleMock = vi.fn().mockResolvedValue({ data: mockVehicle, error: null });
      
      vi.mocked(supabase.from).mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: singleMock
      }) as any);

      const result = await getVehicleById('company-1', 'v1');
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockVehicle);
    });

    it('returns error on failure', async () => {
      const mockError = new Error('Not found');
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: mockError });
      
      vi.mocked(supabase.from).mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: singleMock
      }) as any);

      const result = await getVehicleById('company-1', 'v1');
      expect(result.error).toEqual(mockError);
      expect(result.data).toBeNull();
    });
  });

  describe('updateVehicleWithAudit', () => {
    it('updates vehicle and logs audit if changes exist', async () => {
      const mockCurrentVehicle = { id: 'v1', status: 'Pending', remark: 'Old' };
      const mockUpdatedVehicle = { id: 'v1', status: 'Delivered', remark: 'New' };
      
      // Setup mock to return different things for select vs update
      let callCount = 0;
      const singleMock = vi.fn().mockImplementation(() => {
        if (callCount === 0) {
          callCount++;
          return Promise.resolve({ data: mockCurrentVehicle, error: null }); // for fetch current
        }
        return Promise.resolve({ data: mockUpdatedVehicle, error: null }); // for update
      });
      
      vi.mocked(supabase.from).mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: singleMock,
        update: vi.fn().mockReturnThis()
      }) as any);

      const result = await updateVehicleWithAudit('company-1', 'v1', { status: 'Delivered', remark: 'New' }, 'user1');
      
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockUpdatedVehicle);
      expect(auditService.logVehicleEdit).toHaveBeenCalledWith('user1', 'v1', {
        status: { before: 'Pending', after: 'Delivered' },
        remark: { before: 'Old', after: 'New' }
      });
    });
  });

  describe('searchVehicles', () => {
    it('passes server-side filter and pagination parameters to the search RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [{ rows: [{ id: 'v1', chassis_no: 'CH001', branch_code: 'KK', model: 'X50', is_d2d: false }], total_count: 1 }],
        error: null,
      } as any);

      const result = await searchVehicles({
        branch: 'KK',
        model: 'X50',
        payment: 'Cash',
        stage: 'complete',
        search: 'CH001',
        limit: 25,
        offset: 50,
        sortColumn: 'chassis_no',
        sortDirection: 'asc',
      });

      expect(result.error).toBeNull();
      expect(result.data.totalCount).toBe(1);
      expect(result.data.rows[0]).toMatchObject({ id: 'v1', chassis_no: 'CH001', branch_code: 'KK' });
      expect(supabase.rpc).toHaveBeenCalledWith('search_vehicles', {
        p_branch: 'KK',
        p_model: 'X50',
        p_payment: 'Cash',
        p_stage: 'complete',
        p_search: 'CH001',
        p_has_delivery_date: null,
        p_limit: 25,
        p_offset: 50,
        p_sort_column: 'chassis_no',
        p_sort_direction: 'asc',
      });
    });
  });
});
