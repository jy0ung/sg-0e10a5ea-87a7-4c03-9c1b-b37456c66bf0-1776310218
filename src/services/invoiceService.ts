import { supabase } from '@/integrations/supabase/client';
import { Invoice, InvoicePaymentStatus, InvoiceReconciliationStatus, InvoiceSourceType, InvoiceType, PaymentEvent, PaymentEventType, ArAgingSummary, ArAgingBucket } from '@/types';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';

function mapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    invoiceNo: row.invoice_no as string,
    salesOrderId: row.sales_order_id as string,
    customerId: row.customer_id as string | undefined,
    customerName: row.customer_name as string | undefined,
    issueDate: (row.invoice_date ?? row.issue_date) as string,
    dueDate: row.due_date as string | undefined,
    subtotal: row.subtotal as number,
    taxAmount: row.tax_amount as number | undefined,
    discountAmount: row.discount_amount as number | undefined,
    totalAmount: row.total_amount as number,
    paidAmount: row.paid_amount as number | undefined,
    paymentStatus: row.payment_status as InvoicePaymentStatus,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    invoiceType: (row.invoice_type as InvoiceType) ?? 'customer_sales',
    reconciliationStatus: row.reconciliation_status as InvoiceReconciliationStatus | undefined,
    sourceType: row.source_type as InvoiceSourceType | undefined,
    dmsCollectionRef: row.dms_collection_ref as string | undefined,
  };
}

export async function getInvoices(companyId: string): Promise<{ data: Invoice[]; error: Error | null }> {
  performanceService.startQueryTimer('getInvoices');
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('company_id', companyId)
    .order('invoice_date', { ascending: false });
  performanceService.endQueryTimer('getInvoices', 'getInvoices');
  if (error) { loggingService.error('getInvoices failed', { error }); return { data: [], error: new Error(error.message) }; }
  return { data: (data ?? []).map(r => mapInvoice(r as Record<string, unknown>)), error: null };
}

export async function createInvoice(companyId: string, fields: Omit<Invoice, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>): Promise<{ data: Invoice | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      company_id: companyId,
      invoice_no: fields.invoiceNo,
      sales_order_id: fields.salesOrderId,
      customer_id: fields.customerId,
      customer_name: fields.customerName,
      invoice_date: fields.issueDate,
      due_date: fields.dueDate,
      amount: fields.subtotal,
      tax_amount: fields.taxAmount,
      total_amount: fields.totalAmount,
      paid_amount: fields.paidAmount ?? 0,
      payment_status: fields.paymentStatus,
      notes: fields.notes,
      invoice_type: fields.invoiceType ?? 'customer_sales',
    })
    .select()
    .single();
  if (error) { loggingService.error('createInvoice failed', { error }); return { data: null, error: new Error(error.message) }; }
  return { data: mapInvoice(data as Record<string, unknown>), error: null };
}

/**
 * @deprecated Use recordPaymentEvent() instead. Retained for backward compatibility.
 * Delegates to the event-sourced RPC so paid_amount is computed from the ledger.
 */
export async function recordPayment(companyId: string, id: string, amountPaid: number): Promise<{ data: Invoice | null; error: Error | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const { error: rpcErr } = await recordPaymentEvent(id, amountPaid, today);
  if (rpcErr) return { data: null, error: rpcErr };
  // Re-fetch so caller gets the refreshed invoice
  const { data, error } = await supabase.from('invoices').select('*').eq('company_id', companyId).eq('id', id).single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: mapInvoice(data as Record<string, unknown>), error: null };
}

export async function updateInvoice(companyId: string, id: string, fields: Partial<Omit<Invoice, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>): Promise<{ data: Invoice | null; error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.dueDate !== undefined) updates.due_date = fields.dueDate;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.paymentStatus !== undefined) updates.payment_status = fields.paymentStatus;

  const { data, error } = await supabase.from('invoices').update(updates as never).eq('company_id', companyId).eq('id', id).select().single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: mapInvoice(data as Record<string, unknown>), error: null };
}

// ── Stage 4: AR event-sourced functions ───────────────────────────────────────

export async function recordPaymentEvent(
  invoiceId: string,
  amount: number,
  paymentDate: string,
  opts?: {
    paymentMethod?: string;
    receiptReference?: string;
    officialReceiptId?: string;
    notes?: string;
  }
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('record_payment_event', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_payment_date: paymentDate,
    p_payment_method: opts?.paymentMethod ?? null,
    p_receipt_reference: opts?.receiptReference ?? null,
    p_official_receipt_id: opts?.officialReceiptId ?? null,
    p_notes: opts?.notes ?? null,
  });
  if (error) { loggingService.error('recordPaymentEvent failed', { error }); return { data: null, error: new Error(error.message) }; }
  return { data: data as string, error: null };
}

export async function reversePaymentEvent(
  eventId: string,
  reason?: string
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('reverse_payment_event', {
    p_event_id: eventId,
    p_reason: reason ?? null,
  });
  if (error) { loggingService.error('reversePaymentEvent failed', { error }); return { data: null, error: new Error(error.message) }; }
  return { data: data as string, error: null };
}

export async function getPaymentEvents(
  invoiceId: string
): Promise<{ data: PaymentEvent[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_payment_events', { p_invoice_id: invoiceId });
  if (error) return { data: [], error: new Error(error.message) };
  return {
    data: (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      companyId: '',
      invoiceId,
      eventType: r.event_type as PaymentEventType,
      amount: r.amount as number,
      paymentDate: r.payment_date as string,
      paymentMethod: r.payment_method as string | undefined,
      receiptReference: r.receipt_reference as string | undefined,
      notes: r.notes as string | undefined,
      reversalOfEventId: r.reversal_of_event_id as string | undefined,
      isReversed: r.is_reversed as boolean | undefined,
      createdBy: r.created_by as string | undefined,
      createdAt: r.created_at as string,
    })),
    error: null,
  };
}

export async function getArAgingSummary(
  companyId: string
): Promise<{ data: ArAgingSummary[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_ar_aging_summary', { p_company_id: companyId });
  if (error) return { data: [], error: new Error(error.message) };
  return {
    data: (data ?? []).map((r: Record<string, unknown>) => ({
      bucket: r.bucket as ArAgingBucket,
      invoiceCount: r.invoice_count as number,
      totalOutstanding: r.total_outstanding as number,
      overdueAmount: r.overdue_amount as number,
    })),
    error: null,
  };
}



