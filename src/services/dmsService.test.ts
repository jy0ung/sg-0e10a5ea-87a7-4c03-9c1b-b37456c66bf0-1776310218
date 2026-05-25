import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  getDmsSyncRunsSummary,
  getDmsRawStagingCounts,
  listSyncRuns,
} from './dmsService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getDmsSyncRunsSummary ─────────────────────────────────────────────────────

describe('getDmsSyncRunsSummary', () => {
  it('calls get_dms_sync_runs_summary and maps per-source rows', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          source_system: 'dms',
          total_runs: 42, succeeded_runs: 40, failed_runs: 1, running_runs: 1, pending_runs: 0,
          last_run_at: '2026-05-25T10:00:00Z',
          last_run_status: 'succeeded',
          total_record_count: 12_345,
        },
        {
          source_system: 'legacy_fookloi',
          total_runs: 5, succeeded_runs: 4, failed_runs: 1, running_runs: 0, pending_runs: 0,
          last_run_at: '2026-05-24T08:30:00Z',
          last_run_status: 'failed',
          total_record_count: 500,
        },
      ],
      error: null,
    } as never);

    const result = await getDmsSyncRunsSummary('company-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_dms_sync_runs_summary', { p_company_id: 'company-1' });
    expect(result.data).toHaveLength(2);
    expect(result.data![0]).toMatchObject({
      sourceSystem: 'dms', totalRuns: 42, succeededRuns: 40, lastRunStatus: 'succeeded', totalRecordCount: 12_345,
    });
    expect(result.data![1].lastRunStatus).toBe('failed');
    expect(result.error).toBeNull();
  });

  it('returns an Error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'Unauthorized' },
    } as never);

    const result = await getDmsSyncRunsSummary('company-bad');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});

// ── getDmsRawStagingCounts ────────────────────────────────────────────────────

describe('getDmsRawStagingCounts', () => {
  it('maps per-staging-table rows including null latest_fetched_at', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        { table_name: 'dms_raw_sales_orders', total_rows: 1000, normalized_rows: 980, pending_rows: 20, latest_fetched_at: '2026-05-25T09:00:00Z' },
        { table_name: 'dms_raw_leads',        total_rows: 0,    normalized_rows: 0,   pending_rows: 0,  latest_fetched_at: null },
      ],
      error: null,
    } as never);

    const result = await getDmsRawStagingCounts('company-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_dms_raw_staging_counts', { p_company_id: 'company-1' });
    expect(result.data).toHaveLength(2);
    expect(result.data![0]).toMatchObject({
      tableName: 'dms_raw_sales_orders', totalRows: 1000, normalizedRows: 980, pendingRows: 20,
    });
    expect(result.data![1].latestFetchedAt).toBeNull();
  });
});

// ── listSyncRuns ──────────────────────────────────────────────────────────────

describe('listSyncRuns', () => {
  function makeChain(finalResult: { data: unknown; error: unknown }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockResolvedValue(finalResult),
    };
    return chain;
  }

  it('queries sync_runs filtered by company and ordered newest-first', async () => {
    const row = {
      id: 'run-1', company_id: 'co-1', source_system: 'dms', sync_type: 'sales_orders.full',
      source_endpoint: '/api/2b/dms.retail/...', request_filters: { branch: 'KCH' },
      status: 'succeeded', record_count: 500,
      started_at:  '2026-05-25T08:00:00Z',
      finished_at: '2026-05-25T08:01:30Z',
      error_code: null, error_message: null,
      created_at: '2026-05-25T08:00:00Z',
      updated_at: '2026-05-25T08:01:30Z',
    };
    const chain = makeChain({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { data, error } = await listSyncRuns('co-1');

    expect(supabase.from).toHaveBeenCalledWith('sync_runs');
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co-1');
    expect(chain.order).toHaveBeenCalledWith('started_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: 'run-1', sourceSystem: 'dms', syncType: 'sales_orders.full', status: 'succeeded', recordCount: 500,
    });
  });

  it('applies source_system and status filters when provided', async () => {
    const chain = makeChain({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await listSyncRuns('co-1', { sourceSystem: 'dms', status: 'failed', limit: 10 });

    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co-1');
    expect(chain.eq).toHaveBeenCalledWith('source_system', 'dms');
    expect(chain.eq).toHaveBeenCalledWith('status', 'failed');
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('returns empty array and Error on query failure', async () => {
    const chain = makeChain({ data: null, error: { message: 'RLS denied' } });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const { data, error } = await listSyncRuns('co-bad');

    expect(data).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });
});
