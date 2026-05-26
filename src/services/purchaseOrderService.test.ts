import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  transitionPoStatus,
} from './purchaseOrderService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── listPurchaseOrders ────────────────────────────────────────────────────────

describe('listPurchaseOrders', () => {
  function makeChain(finalResult: { data: unknown; error: unknown }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      ilike:  vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockResolvedValue(finalResult),
    };
    return chain;
  }

  it('queries purchase_orders with default filters and newest-first ordering', async () => {
    const row = {
      id: 'po-1', company_id: 'co-1', po_no: 'PO-001', supplier: 'Proton',
      order_date: '2026-05-20', expected_delivery_date: '2026-06-01',
      lifecycle_status: 'draft', total_amount: 150000, notes: null,
      created_by: 'user-1', approved_by: null, approved_at: null,
      created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
    };
    const chain = makeChain({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listPurchaseOrders('co-1');

    expect(supabase.from).toHaveBeenCalledWith('purchase_orders');
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co-1');
    expect(chain.order).toHaveBeenCalledWith('order_date', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(100);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'po-1', poNo: 'PO-001', supplier: 'Proton', lifecycleStatus: 'draft', totalAmount: 150000,
    });
  });

  it('applies status and supplier filters when provided', async () => {
    const chain = makeChain({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await listPurchaseOrders('co-1', { status: 'approved', supplier: 'Proton', limit: 25 });

    expect(chain.eq).toHaveBeenCalledWith('lifecycle_status', 'approved');
    expect(chain.ilike).toHaveBeenCalledWith('supplier', '%Proton%');
    expect(chain.limit).toHaveBeenCalledWith(25);
  });
});

// ── getPurchaseOrder ──────────────────────────────────────────────────────────

describe('getPurchaseOrder', () => {
  it('fetches header and lines, returns combined result', async () => {
    const header = {
      id: 'po-1', company_id: 'co-1', po_no: 'PO-001', supplier: 'Proton',
      order_date: '2026-05-20', expected_delivery_date: null,
      lifecycle_status: 'draft', total_amount: 50000, notes: 'first PO',
      created_by: 'user-1', approved_by: null, approved_at: null,
      created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
    };
    const lines = [
      {
        id: 'line-1', company_id: 'co-1', purchase_order_id: 'po-1', line_no: 1,
        chassis_no: 'CHASS-001', model: 'Hilux', variant: '2.4L',
        quantity: 1, unit_price: 50000, line_amount: 50000,
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
      },
    ];

    const headerChain: Record<string, ReturnType<typeof vi.fn>> = {
      select:     vi.fn().mockReturnThis(),
      eq:         vi.fn().mockReturnThis(),
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

    const result = await getPurchaseOrder('co-1', 'po-1');

    expect(supabase.from).toHaveBeenNthCalledWith(1, 'purchase_orders');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'purchase_order_lines');
    expect(result.data).toMatchObject({
      id: 'po-1', poNo: 'PO-001', totalAmount: 50000,
    });
    expect(result.data!.lines).toHaveLength(1);
    expect(result.data!.lines[0]).toMatchObject({
      lineNo: 1, model: 'Hilux', quantity: 1, lineAmount: 50000,
    });
  });

  it('returns null data when PO not found', async () => {
    const headerChain: Record<string, ReturnType<typeof vi.fn>> = {
      select:     vi.fn().mockReturnThis(),
      eq:         vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValueOnce(headerChain as never);

    const result = await getPurchaseOrder('co-1', 'nope');
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});

// ── createPurchaseOrder ───────────────────────────────────────────────────────

describe('createPurchaseOrder', () => {
  it('calls create_purchase_order with snake_case line payloads', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'new-po-id', error: null } as never);

    const result = await createPurchaseOrder('co-1', {
      poNo: 'PO-2026-001',
      supplier: 'Proton',
      orderDate: '2026-05-25',
      expectedDeliveryDate: '2026-06-15',
      notes: 'urgent',
      lines: [
        { lineNo: 1, chassisNo: 'CH-1', model: 'Hilux', variant: '2.4L', quantity: 1, unitPrice: 50000 },
        { lineNo: 2, model: 'Vios', quantity: 2, unitPrice: 25000 },
      ],
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_purchase_order', {
      p_company_id:             'co-1',
      p_po_no:                  'PO-2026-001',
      p_supplier:               'Proton',
      p_order_date:             '2026-05-25',
      p_expected_delivery_date: '2026-06-15',
      p_notes:                  'urgent',
      p_lines:                  [
        { line_no: 1, chassis_no: 'CH-1', model: 'Hilux', variant: '2.4L', quantity: 1, unit_price: 50000 },
        { line_no: 2, chassis_no: null, model: 'Vios', variant: null, quantity: 2, unit_price: 25000 },
      ],
    });
    expect(result.data).toBe('new-po-id');
    expect(result.error).toBeNull();
  });

  it('returns Error on RPC failure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null, error: { message: 'po_no is required' },
    } as never);

    const result = await createPurchaseOrder('co-1', {
      poNo: '', supplier: 'X', orderDate: '2026-05-25',
      lines: [{ lineNo: 1, model: 'Hilux', quantity: 1, unitPrice: 50000 }],
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('po_no is required');
  });
});

// ── transitionPoStatus ────────────────────────────────────────────────────────

describe('transitionPoStatus', () => {
  it('calls transition_po_status with company, id, and target', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'po-1', error: null } as never);

    const result = await transitionPoStatus('co-1', 'po-1', 'submitted');

    expect(supabase.rpc).toHaveBeenCalledWith('transition_po_status', {
      p_company_id: 'co-1', p_id: 'po-1', p_target_status: 'submitted',
    });
    expect(result.data).toBe('po-1');
  });

  it('returns Error on disallowed transition', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null, error: { message: 'Disallowed transition: closed → submitted' },
    } as never);

    const result = await transitionPoStatus('co-1', 'po-1', 'submitted');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('Disallowed transition');
  });
});
