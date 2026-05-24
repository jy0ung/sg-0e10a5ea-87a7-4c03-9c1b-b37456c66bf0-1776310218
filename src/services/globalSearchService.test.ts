import { describe, expect, it, vi } from 'vitest';
import { globalSearch } from './globalSearchService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/integrations/supabase/client';

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe('globalSearch', () => {
  it('returns empty without calling the RPC for queries shorter than 2 chars', async () => {
    rpcMock.mockReset();
    expect(await globalSearch('')).toEqual([]);
    expect(await globalSearch(' ')).toEqual([]);
    expect(await globalSearch('a')).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps RPC rows to GlobalSearchHit shape, preserving order', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          entity_type: 'vehicle',
          entity_id: 'v-1',
          label: 'CHASSIS-001',
          description: 'X70 - HQ - John',
          href: '/auto-aging/vehicles?search=CHASSIS-001',
          rank_score: 90,
        },
        {
          entity_type: 'customer',
          entity_id: 'c-1',
          label: 'John Doe',
          description: '012-3456 - john@example',
          href: '/sales/customers?search=John+Doe',
          rank_score: 50,
        },
      ],
      error: null,
    });

    const hits = await globalSearch('CHA', 6);
    expect(rpcMock).toHaveBeenCalledWith('global_search', { p_query: 'CHA', p_limit: 6 });
    expect(hits).toEqual([
      {
        entityType: 'vehicle',
        entityId: 'v-1',
        label: 'CHASSIS-001',
        description: 'X70 - HQ - John',
        href: '/auto-aging/vehicles?search=CHASSIS-001',
        rankScore: 90,
      },
      {
        entityType: 'customer',
        entityId: 'c-1',
        label: 'John Doe',
        description: '012-3456 - john@example',
        href: '/sales/customers?search=John+Doe',
        rankScore: 50,
      },
    ]);
  });

  it('returns empty on RPC error rather than throwing — Cmd+K must stay snappy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    const hits = await globalSearch('chassis', 6);
    expect(hits).toEqual([]);
  });

  it('handles a null data row set as empty', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const hits = await globalSearch('chassis', 6);
    expect(hits).toEqual([]);
  });

  it('trims whitespace before evaluating the min-length guard', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await globalSearch('  ab  ', 4);
    expect(rpcMock).toHaveBeenCalledWith('global_search', { p_query: 'ab', p_limit: 4 });
  });
});
