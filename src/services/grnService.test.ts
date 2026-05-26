import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  createGrn,
  getGoodsReceiptNote,
  getPoLineReceipts,
  listGoodsReceiptNotes,
} from './grnService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listGoodsReceiptNotes', () => {
  function makeChain(result: { data: unknown; error: unknown }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockResolvedValue(result),
    };
    return chain;
  }

  it('queries goods_receipt_notes with company filter and newest-first order', async () => {
    const row = {
      id: 'grn-1', company_id: 'co-1', grn_no: 'GRN-001',
      purchase_order_id: 'po-1', received_date: '2026-05-24',
      supplier_dn_no: 'DN-9', notes: null, received_by: 'user-1',
      created_at: '2026-05-24T08:00:00Z', updated_at: '2026-05-24T08:00:00Z',
    };
    const chain = makeChain({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listGoodsReceiptNotes('co-1');

    expect(supabase.from).toHaveBeenCalledWith('goods_receipt_notes');
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co-1');
    expect(chain.order).toHaveBeenCalledWith('received_date', { ascending: false });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'grn-1', grnNo: 'GRN-001', supplierDnNo: 'DN-9' });
  });

  it('applies purchase_order_id filter when provided', async () => {
    const chain = makeChain({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await listGoodsReceiptNotes('co-1', { purchaseOrderId: 'po-1' });

    expect(chain.eq).toHaveBeenCalledWith('purchase_order_id', 'po-1');
  });
});

describe('getGoodsReceiptNote', () => {
  it('fetches header + lines and returns combined result', async () => {
    const header = {
      id: 'grn-1', company_id: 'co-1', grn_no: 'GRN-001',
      purchase_order_id: 'po-1', received_date: '2026-05-24',
      supplier_dn_no: null, notes: null, received_by: 'user-1',
      created_at: '2026-05-24T08:00:00Z', updated_at: '2026-05-24T08:00:00Z',
    };
    const lines = [{
      id: 'gl-1', company_id: 'co-1', goods_receipt_note_id: 'grn-1',
      purchase_order_line_id: 'pol-1', received_quantity: 2, line_notes: null,
      created_at: '2026-05-24T08:00:00Z',
    }];

    const headerChain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: header, error: null }),
    };
    const linesChain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: lines, error: null }),
    };
    vi.mocked(supabase.from)
      .mockReturnValueOnce(headerChain as never)
      .mockReturnValueOnce(linesChain as never);

    const result = await getGoodsReceiptNote('co-1', 'grn-1');

    expect(result.data!.lines).toHaveLength(1);
    expect(result.data!.lines[0].receivedQuantity).toBe(2);
  });

  it('returns null when GRN not found', async () => {
    const headerChain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValueOnce(headerChain as never);

    const result = await getGoodsReceiptNote('co-1', 'nope');
    expect(result.data).toBeNull();
  });
});

describe('getPoLineReceipts', () => {
  it('maps per-po_line receipt summaries', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        { purchase_order_line_id: 'pol-1', line_no: 1, chassis_no: 'CH-1',
          model: 'Hilux', variant: '2.4L', ordered_quantity: 2, received_quantity: 1, remaining_quantity: 1 },
        { purchase_order_line_id: 'pol-2', line_no: 2, chassis_no: null,
          model: 'Vios', variant: null, ordered_quantity: 1, received_quantity: 1, remaining_quantity: 0 },
      ],
      error: null,
    } as never);

    const result = await getPoLineReceipts('co-1', 'po-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_po_line_receipts', {
      p_company_id: 'co-1', p_po_id: 'po-1',
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ lineNo: 1, orderedQuantity: 2, receivedQuantity: 1, remainingQuantity: 1 });
    expect(result.data[1].remainingQuantity).toBe(0);
  });
});

describe('createGrn', () => {
  it('calls create_grn with snake_case line payloads', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'new-grn-id', error: null } as never);

    const result = await createGrn('co-1', {
      grnNo: 'GRN-001',
      purchaseOrderId: 'po-1',
      receivedDate: '2026-05-24',
      supplierDnNo: 'DN-9',
      notes: 'partial',
      lines: [
        { purchaseOrderLineId: 'pol-1', receivedQuantity: 1, lineNotes: 'good' },
        { purchaseOrderLineId: 'pol-2', receivedQuantity: 2 },
      ],
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_grn', {
      p_company_id:     'co-1',
      p_grn_no:         'GRN-001',
      p_po_id:          'po-1',
      p_received_date:  '2026-05-24',
      p_supplier_dn_no: 'DN-9',
      p_notes:          'partial',
      p_lines:          [
        { purchase_order_line_id: 'pol-1', received_quantity: 1, line_notes: 'good' },
        { purchase_order_line_id: 'pol-2', received_quantity: 2, line_notes: null },
      ],
    });
    expect(result.data).toBe('new-grn-id');
  });

  it('returns Error on over-receive rejection', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'Receiving 5 for po_line abc would exceed ordered qty (2 already received of 3 ordered)' },
    } as never);

    const result = await createGrn('co-1', {
      grnNo: 'GRN-OVER', purchaseOrderId: 'po-1', receivedDate: '2026-05-24',
      lines: [{ purchaseOrderLineId: 'pol-1', receivedQuantity: 5 }],
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('exceed ordered qty');
  });

  it('returns Error when PO is not in receivable state', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'PO abc is in status draft and cannot receive goods' },
    } as never);

    const result = await createGrn('co-1', {
      grnNo: 'GRN-X', purchaseOrderId: 'po-1', receivedDate: '2026-05-24',
      lines: [{ purchaseOrderLineId: 'pol-1', receivedQuantity: 1 }],
    });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('cannot receive goods');
  });
});
