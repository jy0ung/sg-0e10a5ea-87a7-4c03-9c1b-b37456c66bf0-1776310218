import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  getThreeWayMatchQueue,
  getThreeWayMatchStatus,
  getThreeWayMatchStatusCounts,
} from './threeWayMatchService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getThreeWayMatchStatusCounts', () => {
  it('maps per-status totals', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        { match_status: 'amount_variance', total: 3 },
        { match_status: 'pending_receipt', total: 8 },
        { match_status: 'matched',         total: 240 },
      ],
      error: null,
    } as never);

    const result = await getThreeWayMatchStatusCounts('co-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_three_way_match_status_counts', { p_company_id: 'co-1' });
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toMatchObject({ matchStatus: 'amount_variance', total: 3 });
  });
});

describe('getThreeWayMatchQueue', () => {
  it('calls RPC with default params and maps rows including null po linkage', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          purchase_invoice_id: 'pi-1', invoice_no: 'PI-100', supplier: 'Proton',
          chassis_no: 'CHASS-001', pi_amount: 99500, invoice_date: '2026-05-22',
          po_no: 'PO-001', po_line_no: 1, ordered_quantity: 1, expected_amount: 100000,
          received_quantity: 1, amount_variance: 500, match_status: 'amount_variance',
        },
        {
          purchase_invoice_id: 'pi-2', invoice_no: 'PI-101', supplier: 'Toyota',
          chassis_no: null, pi_amount: 50000, invoice_date: null,
          po_no: null, po_line_no: null, ordered_quantity: null, expected_amount: null,
          received_quantity: 0, amount_variance: null, match_status: 'unmatched',
        },
      ],
      error: null,
    } as never);

    const result = await getThreeWayMatchQueue('co-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_three_way_match_queue', {
      p_company_id: 'co-1', p_match_status: null, p_limit: 200,
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      purchaseInvoiceId: 'pi-1', matchStatus: 'amount_variance', amountVariance: 500, expectedAmount: 100000,
    });
    expect(result.data[1]).toMatchObject({
      matchStatus: 'unmatched', poNo: null, expectedAmount: null,
    });
  });

  it('passes status filter through', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    await getThreeWayMatchQueue('co-1', { matchStatus: 'amount_variance', limit: 50 });

    expect(supabase.rpc).toHaveBeenCalledWith('get_three_way_match_queue', {
      p_company_id: 'co-1', p_match_status: 'amount_variance', p_limit: 50,
    });
  });

  it('returns Error on RPC failure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null, error: { message: 'Unauthorized' },
    } as never);

    const result = await getThreeWayMatchQueue('co-bad');

    expect(result.data).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('getThreeWayMatchStatus', () => {
  it('returns single match row when PI exists', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{
        purchase_invoice_id: 'pi-1', invoice_no: 'PI-100', supplier: 'Proton',
        chassis_no: 'CH-1', pi_amount: 100000, invoice_date: null,
        po_no: 'PO-001', po_line_no: 1, ordered_quantity: 1, expected_amount: 100000,
        received_quantity: 1, amount_variance: 0, match_status: 'matched',
      }],
      error: null,
    } as never);

    const result = await getThreeWayMatchStatus('co-1', 'pi-1');

    expect(result.data!.matchStatus).toBe('matched');
    expect(result.data!.amountVariance).toBe(0);
  });

  it('returns null when PI not found', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    const result = await getThreeWayMatchStatus('co-1', 'pi-nope');

    expect(result.data).toBeNull();
  });
});
