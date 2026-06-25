import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchHealthMetrics } from './systemHealthService';

const queries: string[] = [];

function makeBuilder(table: string) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: table === 'sync_runs' ? { started_at: '2026-06-25T00:00:00Z', status: 'success' } : null, error: null })),
  };
  Object.defineProperty(builder, 'then', {
    value: (resolve: any) => Promise.resolve({ count: 1, data: null, error: null }).then(resolve),
  });
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      queries.push(table);
      return makeBuilder(table);
    }),
  },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('fetchHealthMetrics', () => {
  beforeEach(() => {
    queries.length = 0;
    vi.clearAllMocks();
  });

  it('loads DMS sync status from sync_runs, not legacy dms_sync_runs', async () => {
    const result = await fetchHealthMetrics('c1');

    expect(queries).toContain('sync_runs');
    expect(queries).not.toContain('dms_sync_runs');
    expect(result.lastDmsSync).toBe('2026-06-25T00:00:00Z');
    expect(result.lastDmsStatus).toBe('success');
  });
});
