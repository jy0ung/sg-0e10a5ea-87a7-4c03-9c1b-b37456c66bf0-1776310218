import { supabase } from "@/integrations/supabase/client";
import { logUserAction } from './auditService';
import { loggingService } from "./loggingService";
import type { PurchaseInvoiceLifecycleStatus, ApPaymentStatus } from '@/types';

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
  // AP lifecycle fields (Stage 5)
  lifecycleStatus: PurchaseInvoiceLifecycleStatus;
  paymentStatus: ApPaymentStatus;
  paidAmount: number;
  dueDate?: string;
  notes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  // PO matching
  poLineId?: string;
  poId?: string;
  poNo?: string;
  poQuantity?: number;
  poUnitPrice?: number;
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
    // AP lifecycle fields (Stage 5 — default-safe for rows pre-migration)
    lifecycleStatus: (row.lifecycle_status as PurchaseInvoiceLifecycleStatus) ?? 'received',
    paymentStatus: (row.payment_status as ApPaymentStatus) ?? 'unpaid',
    paidAmount: Number(row.paid_amount ?? 0),
    dueDate: row.due_date ? String(row.due_date) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    verifiedBy: row.verified_by ? String(row.verified_by) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    // PO matching
    poLineId: row.po_line_id ? String(row.po_line_id) : undefined,
    poId: (() => {
      const po = row._po as Record<string, unknown> | undefined;
      return po?.purchase_order_id ? String(po.purchase_order_id) : undefined;
    })(),
    poNo: (() => {
      const po = row._po as Record<string, unknown> | undefined;
      const poHeader = po?.purchase_orders as Record<string, unknown> | undefined;
      return poHeader?.po_no ? String(poHeader.po_no) : undefined;
    })(),
    poQuantity: (() => {
      const po = row._po as Record<string, unknown> | undefined;
      return po?.quantity != null ? Number(po.quantity) : undefined;
    })(),
    poUnitPrice: (() => {
      const po = row._po as Record<string, unknown> | undefined;
      return po?.unit_price != null ? Number(po.unit_price) : undefined;
    })(),
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
  poLineId?: string;
}

export async function createPurchaseInvoice(
  input: CreatePurchaseInvoiceInput,
): Promise<{ error: Error | null }> {
  if (input.poLineId) {
    const { error } = await supabase.rpc('create_linked_purchase_invoice', {
      p_invoice_no: input.invoiceNo,
      p_supplier: input.supplier,
      p_chassis_no: input.chassisNo,
      p_model: input.model,
      p_invoice_date: input.invoiceDate,
      p_amount: input.amount,
      p_remark: input.remark ?? null,
      p_po_line_id: input.poLineId,
    });
    if (error) {
      loggingService.error('createPurchaseInvoice linked creation failed', { error }, 'PurchaseInvoiceService');
      return { error: new Error(error.message) };
    }
    return { error: null };
  }
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

export interface EligiblePoLine {
  id: string;
  poId: string;
  poNo: string;
  supplier: string;
  lineNo: number;
  model: string;
  chassisNo: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
}

/** Same-company candidate IDs for an explicit Purchasing invoice link. */
export async function listEligiblePoLines(companyId: string): Promise<EligiblePoLine[]> {
  const { data: orders, error: ordersError } = await supabase.from('purchase_orders')
    .select('id,po_no,supplier').eq('company_id', companyId)
    .in('lifecycle_status', ['approved', 'fulfilled']).order('order_date', { ascending: false }).limit(100);
  if (ordersError) throw new Error(ordersError.message);
  if (!orders?.length) return [];
  const { data: lines, error: linesError } = await supabase.from('purchase_order_lines')
    .select('id,purchase_order_id,line_no,model,chassis_no,quantity,unit_price')
    .eq('company_id', companyId).in('purchase_order_id', orders.map(order => order.id))
    .order('line_no', { ascending: true });
  if (linesError) throw new Error(linesError.message);
  if (!lines?.length) return [];
  const { data: receipts, error: receiptsError } = await supabase.from('grn_lines')
    .select('purchase_order_line_id,received_quantity').eq('company_id', companyId)
    .in('purchase_order_line_id', lines.map(line => line.id));
  if (receiptsError) throw new Error(receiptsError.message);
  const poById = new Map(orders.map(order => [order.id, order]));
  const receivedByLine = new Map<string, number>();
  for (const receipt of receipts ?? []) receivedByLine.set(
    receipt.purchase_order_line_id,
    (receivedByLine.get(receipt.purchase_order_line_id) ?? 0) + Number(receipt.received_quantity),
  );
  return lines.map(line => {
    const order = poById.get(line.purchase_order_id);
    return {
      id: line.id, poId: line.purchase_order_id, poNo: order?.po_no ?? '', supplier: order?.supplier ?? '',
      lineNo: line.line_no, model: line.model, chassisNo: line.chassis_no,
      orderedQuantity: Number(line.quantity), receivedQuantity: receivedByLine.get(line.id) ?? 0,
      unitPrice: Number(line.unit_price),
    };
  });
}

export async function linkPurchaseInvoicePoLine(invoiceId: string, poLineId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('link_purchase_invoice_po_line', {
    p_invoice_id: invoiceId, p_po_line_id: poLineId,
  });
  return { error: error ? new Error(error.message) : null };
}

/** Receive a PI and record its Vehicle through one audited database command. */
export async function markPurchaseInvoiceReceived(
  id: string,
  options: { companyId: string; branchId: string },
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('receive_purchase_invoice', {
    p_company_id: options.companyId,
    p_invoice_id: id,
    p_branch_id: options.branchId,
  });
  if (error) {
    loggingService.error('markPurchaseInvoiceReceived failed', { id, error }, 'PurchaseInvoiceService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function getPurchaseInvoiceById(
  companyId: string,
  id: string,
): Promise<PurchaseInvoiceRecord | null> {
  const { data, error } = await supabase
    .from('purchase_invoices')
    .select('*, _po:purchase_order_lines!po_line_id(purchase_order_id, quantity, unit_price, purchase_orders!purchase_order_id(po_no))')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    loggingService.error('getPurchaseInvoiceById failed', { companyId, id, error }, 'PurchaseInvoiceService');
    throw new Error(error.message);
  }
  return data ? rowToInvoice(data as Record<string, unknown>) : null;
}

export interface UpdatePurchaseInvoiceInput {
  invoiceNo?: string;
  supplier?: string;
  chassisNo?: string;
  model?: string;
  invoiceDate?: string;
  amount?: number;
  remark?: string | null;
  actorId?: string;
}

export async function updatePurchaseInvoice(
  companyId: string,
  id: string,
  fields: UpdatePurchaseInvoiceInput,
): Promise<{ error: Error | null }> {
  const patch: Record<string, unknown> = {};
  if (fields.invoiceNo   !== undefined) patch['invoice_no']   = fields.invoiceNo;
  if (fields.supplier    !== undefined) patch['supplier']     = fields.supplier;
  if (fields.chassisNo   !== undefined) patch['chassis_no']   = fields.chassisNo.toUpperCase();
  if (fields.model       !== undefined) patch['model']        = fields.model;
  if (fields.invoiceDate !== undefined) patch['invoice_date'] = fields.invoiceDate;
  if (fields.amount      !== undefined) patch['amount']       = fields.amount;
  if (fields.remark      !== undefined) patch['remark']       = fields.remark;

  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase
    .from('purchase_invoices')
    .update(patch as never)
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) {
    loggingService.error('updatePurchaseInvoice failed', { companyId, id, error }, 'PurchaseInvoiceService');
    return { error: new Error(error.message) };
  }
  if (fields.actorId) void logUserAction(fields.actorId, 'update', 'purchase_invoice', id, { component: 'PurchaseInvoiceService' });
  return { error: null };
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
