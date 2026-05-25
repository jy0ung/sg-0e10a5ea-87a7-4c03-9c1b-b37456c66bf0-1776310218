import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  decideReconciliationMatch,
  getReconciliationMatchDetail,
  getReconciliationQueue,
  getReconciliationStatusCounts,
} from './reconciliationService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getReconciliationQueue ────────────────────────────────────────────────────

describe('getReconciliationQueue', () => {
  it('calls get_reconciliation_queue and maps match rows', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          id: 'match-1', object_type: 'sales_order', source_system: 'dms',
          source_table: 'dms_raw_sales_orders', source_record_id: 'raw-1',
          canonical_table: 'sales_orders', canonical_record_id: 'canon-1',
          match_status: 'candidate', confidence_score: 0.85, match_rule: 'dms_so_no_match',
          source_priority: 10, review_owner: null, reviewed_at: null,
          created_at: '2026-05-25T08:00:00Z', updated_at: '2026-05-25T08:00:00Z',
        },
      ],
      error: null,
    } as never);

    const result = await getReconciliationQueue('co-1', { objectType: 'sales_order' });

    expect(supabase.rpc).toHaveBeenCalledWith('get_reconciliation_queue', {
      p_company_id: 'co-1', p_object_type: 'sales_order', p_match_status: null, p_limit: 100,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'match-1', objectType: 'sales_order', sourceSystem: 'dms',
      matchStatus: 'candidate', confidenceScore: 0.85, matchRule: 'dms_so_no_match',
    });
  });

  it('passes status filter through and applies default limit', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    await getReconciliationQueue('co-1', { matchStatus: 'conflict' });

    expect(supabase.rpc).toHaveBeenCalledWith('get_reconciliation_queue', {
      p_company_id: 'co-1', p_object_type: null, p_match_status: 'conflict', p_limit: 100,
    });
  });

  it('returns empty array on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null, error: { message: 'Unauthorized' },
    } as never);

    const result = await getReconciliationQueue('co-bad');

    expect(result.data).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

// ── getReconciliationStatusCounts ─────────────────────────────────────────────

describe('getReconciliationStatusCounts', () => {
  it('maps per-status totals', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        { match_status: 'candidate', total: 12 },
        { match_status: 'conflict',  total: 3 },
        { match_status: 'accepted',  total: 540 },
      ],
      error: null,
    } as never);

    const result = await getReconciliationStatusCounts('co-1');

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toMatchObject({ matchStatus: 'candidate', total: 12 });
  });
});

// ── getReconciliationMatchDetail ──────────────────────────────────────────────

describe('getReconciliationMatchDetail', () => {
  it('maps detail row including source and canonical payloads', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{
        id: 'match-1', object_type: 'sales_order', source_system: 'dms',
        source_table: 'dms_raw_sales_orders', source_record_id: 'raw-1',
        canonical_table: 'sales_orders', canonical_record_id: 'canon-1',
        match_status: 'candidate', confidence_score: 0.85, match_rule: 'dms_so_no_match',
        match_basis: { dms_so_no: '12345' }, conflict_payload: {},
        source_priority: 10, review_owner: null, reviewed_at: null, review_notes: null,
        source_payload:    { dms_so_no: '12345', customer: 'ACME' },
        canonical_payload: { vso_no: '12345', customer_name: 'ACME Sdn Bhd' },
        created_at: '2026-05-25T08:00:00Z', updated_at: '2026-05-25T08:00:00Z',
      }],
      error: null,
    } as never);

    const result = await getReconciliationMatchDetail('co-1', 'match-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_reconciliation_match_detail', {
      p_company_id: 'co-1', p_match_id: 'match-1',
    });
    expect(result.data).toMatchObject({
      id: 'match-1', matchStatus: 'candidate',
      sourcePayload: { dms_so_no: '12345', customer: 'ACME' },
      canonicalPayload: { vso_no: '12345', customer_name: 'ACME Sdn Bhd' },
    });
  });

  it('returns null data when match is not found', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    const result = await getReconciliationMatchDetail('co-1', 'nope');

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});

// ── decideReconciliationMatch ─────────────────────────────────────────────────

describe('decideReconciliationMatch', () => {
  it('calls decide_reconciliation_match with decision and optional notes', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'match-1', error: null } as never);

    const result = await decideReconciliationMatch('co-1', 'match-1', 'accepted', 'Looks right');

    expect(supabase.rpc).toHaveBeenCalledWith('decide_reconciliation_match', {
      p_company_id: 'co-1', p_match_id: 'match-1', p_decision: 'accepted', p_notes: 'Looks right',
    });
    expect(result.data).toBe('match-1');
  });

  it('omits notes when not provided', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'match-2', error: null } as never);

    await decideReconciliationMatch('co-1', 'match-2', 'rejected');

    expect(supabase.rpc).toHaveBeenCalledWith('decide_reconciliation_match', {
      p_company_id: 'co-1', p_match_id: 'match-2', p_decision: 'rejected', p_notes: null,
    });
  });

  it('returns Error when terminal state', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'Match abc is in terminal state accepted and cannot be re-decided' },
    } as never);

    const result = await decideReconciliationMatch('co-1', 'abc', 'rejected');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('terminal state');
  });
});
