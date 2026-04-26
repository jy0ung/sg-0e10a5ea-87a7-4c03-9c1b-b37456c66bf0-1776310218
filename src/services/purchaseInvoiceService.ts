import { supabase } from "@/integrations/supabase/client";
import { logUserAction } from './auditService';
import { loggingService } from "./loggingService";
import { insertVehicle } from "./vehicleService";

export type PurchaseInvoiceStatus = 'pending' | 'received' | 'cancelled';

export interface PurchaseInvoiceRecord {
  id: string;
  invoiceNo: string;
  supplier: string;
  chassisNo: string;
  model: string;
  invoiceDate: string;
  amount: number;
  status: PurchaseInvoiceStatus;
  receivedDate?: string;
  remark?: string;
}

function rowToInvoice(row: Record<string, unknown>): PurchaseInvoiceRecord {
  return {
    id: String(row.id ?? ''),
    invoiceNo: String(row.invoice_no ?? ''),
    supplier: String(row.supplier ?? ''),
    chassisNo: String(row.chassis_no ?? ''),
    model: String(row.model ?? ''),
    invoiceDate: String(row.invoice_date ?? ''),
    amount: Number(row.amount ?? 0),
    status: (row.status as PurchaseInvoiceStatus) ?? 'pending',
    receivedDate: row.received_date ? String(row.received_date) : undefined,
    remark: row.remark ? String(row.remark) : undefined,
  };
}

export async function listPurchaseInvoices(
  companyId: string,
): Promise<PurchaseInvoiceRecord[]> {
  const { data, error } = await supabase
    .from('purchase_invoices')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) {
    loggingService.error('listPurchaseInvoices failed', { companyId, error }, 'PurchaseInvoiceService');
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => rowToInvoice(row as Record<string, unknown>));
}

export interface CreatePurchaseInvoiceInput {
  companyId: string;
  actorId?: string;
  invoiceNo: string;
  supplier: string;
  chassisNo: string;
  model: string;
  invoiceDate: string;
  amount: number;
  remark?: string | null;
}

export async function createPurchaseInvoice(
  input: CreatePurchaseInvoiceInput,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('purchase_invoices').insert({
    company_id: input.companyId,
    invoice_no: input.invoiceNo,
    supplier: input.supplier,
    chassis_no: input.chassisNo.toUpperCase(),
    model: input.model,
    invoice_date: input.invoiceDate,
    amount: input.amount,
    status: 'pending',
    remark: input.remark ?? null,
  });
  if (error) {
    loggingService.error('createPurchaseInvoice failed', { error }, 'PurchaseInvoiceService');
    return { error: new Error(error.message) };
  }
  if (input.actorId) void logUserAction(input.actorId, 'create', 'purchase_invoice', undefined, { component: 'PurchaseInvoiceService' });
  return { error: null };
}

/**
 * Mark a purchase invoice as received and ensure a corresponding vehicle row
 * exists. If the vehicle already exists but has no received date, backfill it.
 * Otherwise insert a stub vehicle record so it appears in inventory.
 */
export async function markPurchaseInvoiceReceived(
  id: string,
  options: { companyId: string; chassisNo: string; model: string; actorId?: string },
): Promise<{ error: Error | null }> {
  const receivedDate = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('purchase_invoices')
    .update({ status: 'received', received_date: receivedDate })
    .eq('company_id', options.companyId)
    .eq('id', id);
  if (error) {
    loggingService.error('markPurchaseInvoiceReceived failed', { id, error }, 'PurchaseInvoiceService');
    return { error: new Error(error.message) };
  }

  if (!options.chassisNo || !options.companyId) {
    return { error: null };
  }

  const { data: existing, error: lookupError } = await supabase
    .from('vehicles')
    .select('id, date_received_by_outlet')
    .eq('chassis_no', options.chassisNo)
    .eq('company_id', options.companyId)
    .maybeSingle();

  if (lookupError) {
    loggingService.error('Vehicle lookup after PI receive failed', { id, error: lookupError }, 'PurchaseInvoiceService');
    return { error: new Error(lookupError.message) };
  }

  if (existing) {
    const row = existing as { id: string; date_received_by_outlet: string | null };
    if (!row.date_received_by_outlet) {
      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ date_received_by_outlet: receivedDate })
        .eq('company_id', options.companyId)
        .eq('id', row.id);
      if (updateError) {
        return { error: new Error(updateError.message) };
      }
    }
    return { error: null };
  }

  const { error: insertError } = await insertVehicle(options.companyId, {
    chassis_no: options.chassisNo,
    model: options.model,
    date_received_by_outlet: receivedDate,
  }, options.actorId);
  if (!insertError && options.actorId) {
    void logUserAction(options.actorId, 'update', 'purchase_invoice', id, { component: 'PurchaseInvoiceService' });
  }
  return { error: insertError };
}

/**
 * Fetch a chassis → amount map for received purchase invoices within a
 * company. Used by the Margin Analysis page to compute real per-unit cost.
 */
export async function fetchChassisCostMap(
  companyId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!companyId) return map;
  const { data, error } = await supabase
    .from('purchase_invoices')
    .select('chassis_no, amount')
    .eq('company_id', companyId)
    .eq('status', 'received');
  if (error) {
    loggingService.error('fetchChassisCostMap failed', { companyId, error }, 'PurchaseInvoiceService');
    return map;
  }
  for (const row of data ?? []) {
    const r = row as { chassis_no: string | null; amount: number | null };
    if (r.chassis_no) map.set(r.chassis_no, Number(r.amount ?? 0));
  }
  return map;
}
