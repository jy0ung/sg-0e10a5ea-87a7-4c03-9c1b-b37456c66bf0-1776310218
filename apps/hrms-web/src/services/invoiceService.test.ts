import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  recordPaymentEvent,
  reversePaymentEvent,
  getPaymentEvents,
  getArAgingSummary,
} from './invoiceService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

vi.mock('./performanceService', () => ({
  performanceService: {
    startQueryTimer: vi.fn(),
    endQueryTimer: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── recordPaymentEvent ────────────────────────────────────────────────────────

describe('recordPaymentEvent', () => {
  it('calls record_payment_event RPC with required params', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'event-uuid', error: null } as never);

    const result = await recordPaymentEvent('inv-1', 500, '2026-05-01');

    expect(supabase.rpc).toHaveBeenCalledWith('record_payment_event', {
      p_invoice_id: 'inv-1',
      p_amount: 500,
      p_payment_date: '2026-05-01',
      p_payment_method: null,
      p_receipt_reference: null,
      p_official_receipt_id: null,
      p_notes: null,
    });
    expect(result.data).toBe('event-uuid');
    expect(result.error).toBeNull();
  });

  it('passes optional fields through to the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'event-uuid', error: null } as never);

    await recordPaymentEvent('inv-2', 250, '2026-05-02', {
      paymentMethod: 'Cash',
      receiptReference: 'OR-001',
      notes: 'May payment',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('record_payment_event', expect.objectContaining({
      p_payment_method: 'Cash',
      p_receipt_reference: 'OR-001',
      p_notes: 'May payment',
    }));
  });

  it('returns error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Invoice not found' } } as never);

    const result = await recordPaymentEvent('inv-bad', 100, '2026-05-01');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Invoice not found');
  });
});

// ── reversePaymentEvent ───────────────────────────────────────────────────────

describe('reversePaymentEvent', () => {
  it('calls reverse_payment_event RPC with event id and reason', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'reversal-uuid', error: null } as never);

    const result = await reversePaymentEvent('event-1', 'Customer overpaid');

    expect(supabase.rpc).toHaveBeenCalledWith('reverse_payment_event', {
      p_event_id: 'event-1',
      p_reason: 'Customer overpaid',
    });
    expect(result.data).toBe('reversal-uuid');
    expect(result.error).toBeNull();
  });

  it('sends null reason when omitted', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'reversal-uuid', error: null } as never);

    await reversePaymentEvent('event-1');

    expect(supabase.rpc).toHaveBeenCalledWith('reverse_payment_event', {
      p_event_id: 'event-1',
      p_reason: null,
    });
  });

  it('returns error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Already reversed' } } as never);

    const result = await reversePaymentEvent('event-2');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Already reversed');
  });
});

// ── getPaymentEvents ──────────────────────────────────────────────────────────

describe('getPaymentEvents', () => {
  it('maps RPC rows to PaymentEvent objects', async () => {
    const rawRows = [
      {
        id: 'ev-1',
        event_type: 'payment',
        amount: 500,
        payment_date: '2026-05-01',
        payment_method: 'Cash',
        receipt_reference: 'OR-001',
        notes: null,
        reversal_of_event_id: null,
        is_reversed: false,
        created_by: 'user-1',
        created_at: '2026-05-01T10:00:00Z',
      },
    ];
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: rawRows, error: null } as never);

    const result = await getPaymentEvents('inv-1');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'ev-1',
      invoiceId: 'inv-1',
      eventType: 'payment',
      amount: 500,
      paymentDate: '2026-05-01',
      paymentMethod: 'Cash',
      receiptReference: 'OR-001',
      isReversed: false,
    });
  });

  it('returns empty array on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Access denied' } } as never);

    const result = await getPaymentEvents('inv-x');

    expect(result.data).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

// ── getArAgingSummary ─────────────────────────────────────────────────────────

describe('getArAgingSummary', () => {
  it('calls get_ar_aging_summary with company id', async () => {
    const rawRows = [
      { bucket: 'current', invoice_count: 3, total_outstanding: 15000, overdue_amount: 0 },
      { bucket: '1_30_days', invoice_count: 1, total_outstanding: 5000, overdue_amount: 5000 },
      { bucket: 'over_90_days', invoice_count: 2, total_outstanding: 22000, overdue_amount: 22000 },
    ];
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: rawRows, error: null } as never);

    const result = await getArAgingSummary('company-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_ar_aging_summary', { p_company_id: 'company-1' });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toMatchObject({ bucket: 'current', invoiceCount: 3, totalOutstanding: 15000, overdueAmount: 0 });
    expect(result.data[2]).toMatchObject({ bucket: 'over_90_days', invoiceCount: 2, overdueAmount: 22000 });
  });

  it('returns empty array on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Company not found' } } as never);

    const result = await getArAgingSummary('bad-company');

    expect(result.data).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Company not found');
  });
});
