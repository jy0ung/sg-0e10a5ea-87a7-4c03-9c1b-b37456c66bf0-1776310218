import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logVehicleEdit, getAuditLog } from './auditService';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn()
    }))
  }
}));

describe('auditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logVehicleEdit', () => {
    it('inserts audit log correctly', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      
      vi.mocked(supabase.from).mockImplementation(() => ({
        insert: insertMock
      }) as any);

      const changes = {
        status: { before: 'Pending', after: 'Delivered' }
      };

      const result = await logVehicleEdit('user1', 'v1', changes);
      
      expect(result.error).toBeNull();
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user1',
        action: 'update',
        entity_type: 'vehicle',
        entity_id: 'v1',
        changes: changes,
        table_name: 'vehicles'
      }));
    });
  });

  describe('getAuditLog', () => {
    it('fetches audit logs for a vehicle', async () => {
      const mockLogs = [
        { id: 'log1', action: 'update', profiles: { full_name: 'Test User' } }
      ];
      
      const limitMock = vi.fn().mockResolvedValue({ data: mockLogs, error: null });
      
      vi.mocked(supabase.from).mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: limitMock
      }) as any);

      const result = await getAuditLog('v1');
      
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockLogs);
    });
  });
});