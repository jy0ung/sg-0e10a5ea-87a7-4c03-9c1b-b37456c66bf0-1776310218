import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseOrderWithLines,
} from '@/types';

function mapPO(row: Record<string, unknown>): PurchaseOrder {
  return {
    id:                   String(row.id ?? ''),
    companyId:            String(row.company_id ?? ''),
    poNo:                 String(row.po_no ?? ''),
    supplier:             String(row.supplier ?? ''),
    orderDate:            String(row.order_date ?? ''),
    expectedDeliveryDate: row.expected_delivery_date ? String(row.expected_delivery_date) : null,
    lifecycleStatus:      (row.lifecycle_status as PurchaseOrderStatus) ?? 'draft',
    totalAmount:          Number(row.total_amount ?? 0),
    notes:                row.notes ? String(row.notes) : null,
    createdBy:            row.created_by ? String(row.created_by) : null,
    approvedBy:           row.approved_by ? String(row.approved_by) : null,
    approvedAt:           row.approved_at ? String(row.approved_at) : null,
    createdAt:            String(row.created_at ?? ''),
    updatedAt:            String(row.updated_at ?? ''),
  };
}

function mapLine(row: Record<string, unknown>): PurchaseOrderLine {
  return {
    id:               String(row.id ?? ''),
    companyId:        String(row.company_id ?? ''),
    purchaseOrderId:  String(row.purchase_order_id ?? ''),
    lineNo:           Number(row.line_no ?? 0),
    chassisNo:        row.chassis_no ? String(row.chassis_no) : null,
    model:            String(row.model ?? ''),
    variant:          row.variant ? String(row.variant) : null,
    quantity:         Number(row.quantity ?? 0),
    unitPrice:        Number(row.unit_price ?? 0),
    lineAmount:       Number(row.line_amount ?? 0),
    createdAt:        String(row.created_at ?? ''),
    updatedAt:        String(row.updated_at ?? ''),
  };
}

/** List POs for a company. Ordered newest-first. */
export async function listPurchaseOrders(
  companyId: string,
  opts: { status?: PurchaseOrderStatus; supplier?: string; limit?: number } = {},
): Promise<{ data: PurchaseOrder[]; error: Error | null }> {
  let query = supabase
    .from('purchase_orders')
    .select('*')
    .eq('company_id', companyId);

  if (opts.status)   query = query.eq('lifecycle_status', opts.status);
  if (opts.supplier) query = query.ilike('supplier', `%${opts.supplier}%`);

  const { data, error } = await query
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (error) {
    loggingService.error('listPurchaseOrders failed', { companyId, opts, error }, 'purchaseOrderService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapPO),
    error: null,
  };
}

/** Fetch one PO header + its lines. Returns null when not found. */
export async function getPurchaseOrder(
  companyId: string,
  id: string,
): Promise<{ data: PurchaseOrderWithLines | null; error: Error | null }> {
  const { data: header, error: headerErr } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();
  if (headerErr) {
    loggingService.error('getPurchaseOrder header failed', { companyId, id, error: headerErr }, 'purchaseOrderService');
    return { data: null, error: new Error(headerErr.message) };
  }
  if (!header) return { data: null, error: null };

  const { data: lines, error: linesErr } = await supabase
    .from('purchase_order_lines')
    .select('*')
    .eq('company_id', companyId)
    .eq('purchase_order_id', id)
    .order('line_no', { ascending: true });
  if (linesErr) {
    loggingService.error('getPurchaseOrder lines failed', { companyId, id, error: linesErr }, 'purchaseOrderService');
    return { data: null, error: new Error(linesErr.message) };
  }

  return {
    data: {
      ...mapPO(header as Record<string, unknown>),
      lines: (lines as Record<string, unknown>[]).map(mapLine),
    },
    error: null,
  };
}

/**
 * Create a new PO atomically (header + lines). RPC recomputes total_amount
 * from line quantities × unit prices so the header stays consistent.
 */
export async function createPurchaseOrder(
  companyId: string,
  input: CreatePurchaseOrderInput,
): Promise<{ data: string | null; error: Error | null }> {
  const linesJson = input.lines.map(l => ({
    line_no:     l.lineNo,
    chassis_no:  l.chassisNo ?? null,
    model:       l.model,
    variant:     l.variant ?? null,
    quantity:    l.quantity,
    unit_price:  l.unitPrice,
  }));
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_company_id:             companyId,
    p_po_no:                  input.poNo,
    p_supplier:               input.supplier,
    p_order_date:             input.orderDate,
    p_expected_delivery_date: input.expectedDeliveryDate ?? null,
    p_notes:                  input.notes ?? null,
    p_lines:                  linesJson,
  });
  if (error) {
    loggingService.error('createPurchaseOrder failed', { companyId, input, error }, 'purchaseOrderService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}

/**
 * Apply a validated lifecycle transition. Allowed paths:
 *   draft → submitted → approved → fulfilled → closed
 *           ↘ cancelled (from draft, submitted, or approved)
 * Approvals require manager+ on the RPC side.
 */
export async function transitionPoStatus(
  companyId: string,
  id: string,
  targetStatus: PurchaseOrderStatus,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('transition_po_status', {
    p_company_id:    companyId,
    p_id:            id,
    p_target_status: targetStatus,
  });
  if (error) {
    loggingService.error('transitionPoStatus failed', { companyId, id, targetStatus, error }, 'purchaseOrderService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}
