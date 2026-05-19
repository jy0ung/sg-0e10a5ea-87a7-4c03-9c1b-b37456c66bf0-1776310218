import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  SupplierPaymentEvent,
  SupplierPaymentEventType,
  ApAgingSummary,
  ApAgingBucket,
  PurchaseInvoiceLifecycleStatus,
} from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapEvent(row: Record<string, unknown>): SupplierPaymentEvent {
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    purchaseInvoiceId: String(row.purchase_invoice_id ?? ''),
    eventType: (row.event_type as SupplierPaymentEventType) ?? 'payment',
    amount: Number(row.amount ?? 0),
    paymentDate: String(row.payment_date ?? ''),
    paymentMethod: row.payment_method ? String(row.payment_method) : undefined,
    referenceNo: row.reference_no ? String(row.reference_no) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    reversalOfEventId: row.reversal_of_event_id ? String(row.reversal_of_event_id) : undefined,
    isReversed: Boolean(row.is_reversed ?? false),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapAgingRow(row: Record<string, unknown>): ApAgingSummary {
  return {
    bucket: (row.bucket as ApAgingBucket) ?? 'no_due_date',
    invoiceCount: Number(row.invoice_count ?? 0),
    totalOutstanding: Number(row.total_outstanding ?? 0),
    overdueAmount: Number(row.overdue_amount ?? 0),
  };
}

// ── Payment events ────────────────────────────────────────────────────────────

export interface RecordSupplierPaymentOptions {
  paymentMethod?: string;
  referenceNo?: string;
  notes?: string;
}

/**
 * Record an immutable supplier payment event against a purchase invoice.
 * Server enforces lifecycle_status = 'approved' | 'scheduled' before inserting.
 * Returns the new event UUID.
 */
export async function recordSupplierPaymentEvent(
  purchaseInvoiceId: string,
  amount: number,
  paymentDate: string,
  opts: RecordSupplierPaymentOptions = {},
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('record_supplier_payment_event', {
    p_purchase_invoice_id: purchaseInvoiceId,
    p_amount: amount,
    p_payment_date: paymentDate,
    p_payment_method: opts.paymentMethod ?? null as unknown as string | undefined,
    p_reference_no: opts.referenceNo ?? null as unknown as string | undefined,
    p_notes: opts.notes ?? null as unknown as string | undefined,
  });
  if (error) {
    loggingService.error('recordSupplierPaymentEvent failed', { purchaseInvoiceId, error }, 'apService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}

/**
 * Reverse a previously recorded supplier payment event.
 * Server validates: only payment events, no double-reversal, same-company.
 * Returns the new reversal event UUID.
 */
export async function reverseSupplierPaymentEvent(
  eventId: string,
  reason?: string,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('reverse_supplier_payment_event', {
    p_event_id: eventId,
    p_reason: reason ?? null as unknown as string | undefined,
  });
  if (error) {
    loggingService.error('reverseSupplierPaymentEvent failed', { eventId, error }, 'apService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}

/** Fetch the full payment event ledger for one purchase invoice. */
export async function getSupplierPaymentEvents(
  purchaseInvoiceId: string,
): Promise<{ data: SupplierPaymentEvent[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_supplier_payment_events', {
    p_purchase_invoice_id: purchaseInvoiceId,
  });
  if (error) {
    loggingService.error('getSupplierPaymentEvents failed', { purchaseInvoiceId, error }, 'apService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: ((data as unknown[]) ?? []).map(r => mapEvent(r as Record<string, unknown>)),
    error: null,
  };
}

// ── AP Aging ─────────────────────────────────────────────────────────────────

/** Server-side AP aging summary grouped into standard buckets. */
export async function getApAgingSummary(
  companyId: string,
): Promise<{ data: ApAgingSummary[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_ap_aging_summary', {
    p_company_id: companyId,
  });
  if (error) {
    loggingService.error('getApAgingSummary failed', { companyId, error }, 'apService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: ((data as unknown[]) ?? []).map(r => mapAgingRow(r as Record<string, unknown>)),
    error: null,
  };
}

// ── Lifecycle transitions ─────────────────────────────────────────────────────

/**
 * Move a purchase invoice through the validated lifecycle state machine.
 * Allowed transitions: received→verified, verified→approved, approved→scheduled,
 * scheduled→paid, approved→paid, any→cancelled (except paid/cancelled).
 */
export async function transitionPiLifecycle(
  id: string,
  targetStatus: PurchaseInvoiceLifecycleStatus,
  actorId?: string,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('transition_pi_lifecycle', {
    p_id: id,
    p_target_status: targetStatus,
    p_actor_id: actorId ?? null as unknown as string | undefined,
  });
  if (error) {
    loggingService.error('transitionPiLifecycle failed', { id, targetStatus, error }, 'apService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}
