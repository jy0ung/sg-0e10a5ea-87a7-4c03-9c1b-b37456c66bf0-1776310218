import { supabase } from '@/integrations/supabase/client';
import { Invoice, InvoicePaymentStatus } from '@/types';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';

function mapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    invoiceNo: row.invoice_no as string,
    salesOrderId: row.sales_order_id as string,
    customerId: row.customer_id as string,
    customerName: row.customer_name as string | undefined,
    issueDate: row.issue_date as string,
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
  };
}

export async function getInvoices(companyId: string): Promise<{ data: Invoice[]; error: Error | null }> {
  const timerId = performanceService.startQueryTimer('getInvoices');
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('company_id', companyId)
    .order('issue_date', { ascending: false });
  performanceService.endQueryTimer(timerId);
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
      issue_date: fields.issueDate,
      due_date: fields.dueDate,
      subtotal: fields.subtotal,
      tax_amount: fields.taxAmount,
      discount_amount: fields.discountAmount,
      total_amount: fields.totalAmount,
      paid_amount: fields.paidAmount ?? 0,
      payment_status: fields.paymentStatus,
      notes: fields.notes,
    })
    .select()
    .single();
  if (error) { loggingService.error('createInvoice failed', { error }); return { data: null, error: new Error(error.message) }; }
  return { data: mapInvoice(data as Record<string, unknown>), error: null };
}

export async function recordPayment(id: string, amountPaid: number): Promise<{ data: Invoice | null; error: Error | null }> {
  // First, get current totals
  const { data: existing, error: fetchErr } = await supabase.from('invoices').select('total_amount, paid_amount').eq('id', id).single();
  if (fetchErr || !existing) return { data: null, error: new Error(fetchErr?.message ?? 'Invoice not found') };

  const totalAmount = (existing as Record<string, unknown>).total_amount as number;
  const newPaid = ((existing as Record<string, unknown>).paid_amount as number ?? 0) + amountPaid;
  const newStatus: InvoicePaymentStatus = newPaid >= totalAmount ? 'paid' : 'partial';

  const { data, error } = await supabase
    .from('invoices')
    .update({ paid_amount: newPaid, payment_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: mapInvoice(data as Record<string, unknown>), error: null };
}

export async function updateInvoice(id: string, fields: Partial<Omit<Invoice, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>): Promise<{ data: Invoice | null; error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.dueDate !== undefined) updates.due_date = fields.dueDate;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.paymentStatus !== undefined) updates.payment_status = fields.paymentStatus;

  const { data, error } = await supabase.from('invoices').update(updates).eq('id', id).select().single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: mapInvoice(data as Record<string, unknown>), error: null };
}
