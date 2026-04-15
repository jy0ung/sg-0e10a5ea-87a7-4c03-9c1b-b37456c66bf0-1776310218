import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVehicleById, updateVehicleWithAudit, deleteVehicleWithAudit } from './vehicleService';
import { supabase } from '@/integrations/supabase/client';
import * as auditService from './auditService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
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
  logVehicleEdit: vi.fn()
}));

describe('vehicleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      const result = await getVehicleById('v1');
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

      const result = await getVehicleById('v1');
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

      const result = await updateVehicleWithAudit('v1', { status: 'Delivered', remark: 'New' }, 'user1');
      
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockUpdatedVehicle);
      expect(auditService.logVehicleEdit).toHaveBeenCalledWith('user1', 'v1', {
        status: { before: 'Pending', after: 'Delivered' },
        remark: { before: 'Old', after: 'New' }
      });
    });
  });
});