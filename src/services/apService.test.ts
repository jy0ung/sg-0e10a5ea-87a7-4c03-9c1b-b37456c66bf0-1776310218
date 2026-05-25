import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  recordSupplierPaymentEvent,
  reverseSupplierPaymentEvent,
  getSupplierPaymentEvents,
  getApAgingSummary,
  getApAgingByBranch,
  transitionPiLifecycle,
} from './apService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── recordSupplierPaymentEvent ────────────────────────────────────────────────

describe('recordSupplierPaymentEvent', () => {
  it('calls record_supplier_payment_event RPC with required params', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'event-uuid-1', error: null } as never);

    const result = await recordSupplierPaymentEvent('pi-1', 60_000, '2026-06-01');

    expect(supabase.rpc).toHaveBeenCalledWith('record_supplier_payment_event', {
      p_purchase_invoice_id: 'pi-1',
      p_amount: 60_000,
      p_payment_date: '2026-06-01',
      p_payment_method: null,
      p_reference_no: null,
      p_notes: null,
    });
    expect(result.data).toBe('event-uuid-1');
    expect(result.error).toBeNull();
  });

  it('passes optional fields through to the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'event-uuid-2', error: null } as never);

    await recordSupplierPaymentEvent('pi-2', 40_000, '2026-06-02', {
      paymentMethod: 'Cheque',
      referenceNo: 'CHQ-0001',
      notes: 'Part payment',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('record_supplier_payment_event', expect.objectContaining({
      p_payment_method: 'Cheque',
      p_reference_no: 'CHQ-0001',
      p_notes: 'Part payment',
    }));
  });

  it('returns error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Invoice not approved' } } as never);

    const result = await recordSupplierPaymentEvent('pi-bad', 1000, '2026-06-01');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Invoice not approved');
  });
});

// ── reverseSupplierPaymentEvent ────────────────────────────────────────────────

describe('reverseSupplierPaymentEvent', () => {
  it('calls reverse_supplier_payment_event RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'reversal-uuid', error: null } as never);

    const result = await reverseSupplierPaymentEvent('event-1', 'Data entry error');

    expect(supabase.rpc).toHaveBeenCalledWith('reverse_supplier_payment_event', {
      p_event_id: 'event-1',
      p_reason: 'Data entry error',
    });
    expect(result.data).toBe('reversal-uuid');
    expect(result.error).toBeNull();
  });

  it('passes null reason when omitted', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'reversal-uuid-2', error: null } as never);

    await reverseSupplierPaymentEvent('event-2');

    expect(supabase.rpc).toHaveBeenCalledWith('reverse_supplier_payment_event', {
      p_event_id: 'event-2',
      p_reason: null,
    });
  });
});

// ── getSupplierPaymentEvents ───────────────────────────────────────────────────

describe('getSupplierPaymentEvents', () => {
  it('maps snake_case DB row to camelCase SupplierPaymentEvent', async () => {
    const row = {
      id: 'evt-1',
      company_id: 'co-1',
      purchase_invoice_id: 'pi-1',
      event_type: 'payment',
      amount: 60_000,
      payment_date: '2026-06-01',
      payment_method: 'Bank Transfer',
      reference_no: 'REF-001',
      notes: null,
      reversal_of_event_id: null,
      is_reversed: false,
      created_by: 'user-1',
      created_at: '2026-06-01T00:00:00Z',
    };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [row], error: null } as never);

    const { data, error } = await getSupplierPaymentEvents('pi-1');

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: 'evt-1',
      companyId: 'co-1',
      purchaseInvoiceId: 'pi-1',
      eventType: 'payment',
      amount: 60_000,
      paymentDate: '2026-06-01',
      paymentMethod: 'Bank Transfer',
      referenceNo: 'REF-001',
      isReversed: false,
      createdBy: 'user-1',
    });
  });

  it('returns empty array on error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'RPC error' } } as never);

    const { data, error } = await getSupplierPaymentEvents('pi-missing');

    expect(data).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });
});

// ── getApAgingSummary ──────────────────────────────────────────────────────────

describe('getApAgingSummary', () => {
  it('maps aging bucket rows from snake_case to camelCase', async () => {
    const rows = [
      { bucket: 'current',    invoice_count: 2, total_outstanding: 80_000, overdue_amount: 0 },
      { bucket: '31_60_days', invoice_count: 1, total_outstanding: 50_000, overdue_amount: 50_000 },
    ];
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: rows, error: null } as never);

    const { data, error } = await getApAgingSummary('co-1');

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      bucket: 'current',
      invoiceCount: 2,
      totalOutstanding: 80_000,
      overdueAmount: 0,
    });
    expect(data[1]).toMatchObject({
      bucket: '31_60_days',
      invoiceCount: 1,
      totalOutstanding: 50_000,
      overdueAmount: 50_000,
    });
  });

  it('returns empty array on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'DB error' } } as never);

    const { data, error } = await getApAgingSummary('co-bad');

    expect(data).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });
});

// ── getApAgingByBranch ─────────────────────────────────────────────────────────

describe('getApAgingByBranch', () => {
  it('calls get_ap_aging_by_branch and maps rows including branch_code', async () => {
    const rows = [
      { branch_code: 'KCH', bucket: 'current',    invoice_count: 4, total_outstanding: 120_000, overdue_amount: 0 },
      { branch_code: 'BTU', bucket: '61_90_days', invoice_count: 2, total_outstanding: 30_000,  overdue_amount: 30_000 },
    ];
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: rows, error: null } as never);

    const { data, error } = await getApAgingByBranch('co-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_ap_aging_by_branch', { p_company_id: 'co-1' });
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      branchCode: 'KCH', bucket: 'current', invoiceCount: 4, totalOutstanding: 120_000, overdueAmount: 0,
    });
    expect(data[1]).toMatchObject({
      branchCode: 'BTU', bucket: '61_90_days', overdueAmount: 30_000,
    });
  });

  it('coerces missing branch_code to "unassigned"', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{ branch_code: null, bucket: 'current', invoice_count: 1, total_outstanding: 100, overdue_amount: 0 }],
      error: null,
    } as never);

    const { data } = await getApAgingByBranch('co-1');

    expect(data[0].branchCode).toBe('unassigned');
  });

  it('returns empty array on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Unauthorized' } } as never);

    const { data, error } = await getApAgingByBranch('co-bad');

    expect(data).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });
});

// ── transitionPiLifecycle ──────────────────────────────────────────────────────

describe('transitionPiLifecycle', () => {
  it('calls transition_pi_lifecycle RPC with correct params', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'pi-1', error: null } as never);

    const result = await transitionPiLifecycle('pi-1', 'verified', 'user-1');

    expect(supabase.rpc).toHaveBeenCalledWith('transition_pi_lifecycle', {
      p_id: 'pi-1',
      p_target_status: 'verified',
      p_actor_id: 'user-1',
    });
    expect(result.error).toBeNull();
  });

  it('passes null actor_id when omitted', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'pi-1', error: null } as never);

    await transitionPiLifecycle('pi-1', 'approved');

    expect(supabase.rpc).toHaveBeenCalledWith('transition_pi_lifecycle', expect.objectContaining({
      p_actor_id: null,
    }));
  });

  it('returns error on invalid transition', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'invalid transition' } } as never);

    const result = await transitionPiLifecycle('pi-1', 'paid');

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('invalid transition');
  });
});
