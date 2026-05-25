import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getImportReviewRows, reviewRow } from './importReviewService';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

describe('importReviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getImportReviewRows', () => {
    it('returns review rows filtered by batch and company', async () => {
      const mockRowData = [
        {
          id: 'review-1',
          import_batch_id: 'batch-1',
          company_id: 'company-1',
          row_number: 1,
          chassis_no: 'ABC123456789',
          branch_code: 'KCH',
          raw_payload: { field: 'value' },
          validation_errors: [
            { field: 'model', message: 'Missing model', code: 'REQUIRED_FIELD_MISSING', severity: 'error' },
          ],
          review_reason: 'incomplete',
          review_status: 'pending',
          assigned_to: null,
          resolved_vehicle_id: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
        {
          id: 'review-2',
          import_batch_id: 'batch-1',
          company_id: 'company-1',
          row_number: 2,
          chassis_no: 'XYZ123456789',
          branch_code: null,
          raw_payload: {},
          validation_errors: [],
          review_reason: 'blocking',
          review_status: 'pending',
          assigned_to: null,
          resolved_vehicle_id: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ];

      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRowData, error: null }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select });

      const result = await getImportReviewRows('batch-1', 'company-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('import_review_rows');
      expect(select).toHaveBeenCalledWith('*');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'review-1',
        importBatchId: 'batch-1',
        companyId: 'company-1',
        rowNumber: 1,
        chassisNo: 'ABC123456789',
      });
    });

    it('returns empty array on query error', async () => {
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Database error'),
            }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select });

      const result = await getImportReviewRows('batch-1', 'company-1');

      expect(result).toEqual([]);
    });

    it('maps validation errors from raw payload', async () => {
      const mockRowData = [
        {
          id: 'review-1',
          import_batch_id: 'batch-1',
          company_id: 'company-1',
          row_number: 1,
          chassis_no: null,
          raw_payload: {},
          validation_errors: [
            { field: 'chassis_no', message: 'Chassis missing', code: 'REQUIRED_FIELD_MISSING', severity: 'error', rowNumber: 1 },
            { field: 'model', message: 'Invalid model', code: 'INVALID_VALUE', severity: 'warning' },
          ],
          review_reason: 'incomplete',
          review_status: 'pending',
          assigned_to: null,
          resolved_vehicle_id: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ];

      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRowData, error: null }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select });

      const result = await getImportReviewRows('batch-1', 'company-1');

      expect(result[0].validationErrors).toHaveLength(2);
      expect(result[0].validationErrors[0]).toMatchObject({
        field: 'chassis_no',
        message: 'Chassis missing',
        code: 'REQUIRED_FIELD_MISSING',
        severity: 'error',
      });
    });

    it('orders results by row number ascending', async () => {
      const mockRowData = [];
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRowData, error: null }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select });

      await getImportReviewRows('batch-1', 'company-1');

      const eqChain = select().eq().eq();
      expect(eqChain.order).toHaveBeenCalledWith('row_number', { ascending: true });
    });

    it('filters by company_id and import_batch_id', async () => {
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ select });

      await getImportReviewRows('batch-123', 'company-456');

      const eqChain = select();
      expect(eqChain.eq).toHaveBeenCalledWith('company_id', 'company-456');
      expect(eqChain.eq().eq).toHaveBeenCalledWith('import_batch_id', 'batch-123');
    });
  });

  describe('reviewRow', () => {
    it('updates status to resolved and sets resolved_at timestamp', async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockReturnValue({ update });

      const result = await reviewRow('review-1', 'resolved', { reviewedBy: 'user-123' });

      expect(result.error).toBeNull();
      const updateCall = update.mock.calls[0][0];
      expect(updateCall).toMatchObject({
        review_status: 'resolved',
        assigned_to: 'user-123',
      });
      expect(updateCall).toHaveProperty('resolved_at');
      expect(updateCall.resolved_at).toBeTruthy();
    });

    it('updates status to discarded and sets resolved_at timestamp', async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockReturnValue({ update });

      const result = await reviewRow('review-1', 'discarded');

      expect(result.error).toBeNull();
      const updateCall = update.mock.calls[0][0];
      expect(updateCall).toMatchObject({
        review_status: 'discarded',
      });
      expect(updateCall).toHaveProperty('resolved_at');
    });

    it('sets assigned_to only when reviewedBy is provided', async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockReturnValue({ update });

      await reviewRow('review-1', 'resolved');

      const updateCall = update.mock.calls[0][0];
      expect(updateCall).not.toHaveProperty('assigned_to');
    });

    it('does not set resolved_at for in_review status', async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockReturnValue({ update });

      await reviewRow('review-1', 'in_review');

      const updateCall = update.mock.calls[0][0];
      expect(updateCall).not.toHaveProperty('resolved_at');
      expect(updateCall).toHaveProperty('review_status', 'in_review');
    });

    it('filters by id when updating', async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockReturnValue({ update });

      await reviewRow('review-456', 'resolved');

      const eqCall = update().eq.mock.calls[0];
      expect(eqCall).toEqual(['id', 'review-456']);
    });

    it('returns error message on database error', async () => {
      const updateError = new Error('RLS policy violation');
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      });

      mockSupabase.from.mockReturnValue({ update });

      const result = await reviewRow('review-1', 'resolved');

      expect(result.error).toBe('RLS policy violation');
    });

    it('updates updated_at timestamp on every review', async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockReturnValue({ update });

      const before = new Date();
      await reviewRow('review-1', 'pending');
      const after = new Date();

      const updateCall = update.mock.calls[0][0];
      expect(updateCall).toHaveProperty('updated_at');
      const updatedAt = new Date(updateCall.updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
