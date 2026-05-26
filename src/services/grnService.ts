import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  CreateGrnInput,
  GoodsReceiptNote,
  GoodsReceiptNoteWithLines,
  GrnLine,
  PoLineReceiptSummary,
} from '@/types';

function mapGrn(row: Record<string, unknown>): GoodsReceiptNote {
  return {
    id:               String(row.id ?? ''),
    companyId:        String(row.company_id ?? ''),
    grnNo:            String(row.grn_no ?? ''),
    purchaseOrderId:  String(row.purchase_order_id ?? ''),
    receivedDate:     String(row.received_date ?? ''),
    supplierDnNo:     row.supplier_dn_no ? String(row.supplier_dn_no) : null,
    notes:            row.notes ? String(row.notes) : null,
    receivedBy:       row.received_by ? String(row.received_by) : null,
    createdAt:        String(row.created_at ?? ''),
    updatedAt:        String(row.updated_at ?? ''),
  };
}

function mapGrnLine(row: Record<string, unknown>): GrnLine {
  return {
    id:                   String(row.id ?? ''),
    companyId:            String(row.company_id ?? ''),
    goodsReceiptNoteId:   String(row.goods_receipt_note_id ?? ''),
    purchaseOrderLineId:  String(row.purchase_order_line_id ?? ''),
    receivedQuantity:     Number(row.received_quantity ?? 0),
    lineNotes:            row.line_notes ? String(row.line_notes) : null,
    createdAt:            String(row.created_at ?? ''),
  };
}

function mapReceiptSummary(row: Record<string, unknown>): PoLineReceiptSummary {
  return {
    purchaseOrderLineId: String(row.purchase_order_line_id ?? ''),
    lineNo:              Number(row.line_no ?? 0),
    chassisNo:           row.chassis_no ? String(row.chassis_no) : null,
    model:               String(row.model ?? ''),
    variant:             row.variant ? String(row.variant) : null,
    orderedQuantity:     Number(row.ordered_quantity ?? 0),
    receivedQuantity:    Number(row.received_quantity ?? 0),
    remainingQuantity:   Number(row.remaining_quantity ?? 0),
  };
}

/** List GRNs across all POs for the company. Newest first. */
export async function listGoodsReceiptNotes(
  companyId: string,
  opts: { purchaseOrderId?: string; limit?: number } = {},
): Promise<{ data: GoodsReceiptNote[]; error: Error | null }> {
  let query = supabase
    .from('goods_receipt_notes')
    .select('*')
    .eq('company_id', companyId);

  if (opts.purchaseOrderId) query = query.eq('purchase_order_id', opts.purchaseOrderId);

  const { data, error } = await query
    .order('received_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (error) {
    loggingService.error('listGoodsReceiptNotes failed', { companyId, opts, error }, 'grnService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapGrn),
    error: null,
  };
}

/** Fetch one GRN with its lines. */
export async function getGoodsReceiptNote(
  companyId: string,
  id: string,
): Promise<{ data: GoodsReceiptNoteWithLines | null; error: Error | null }> {
  const { data: header, error: headerErr } = await supabase
    .from('goods_receipt_notes')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();
  if (headerErr) {
    loggingService.error('getGoodsReceiptNote header failed', { companyId, id, error: headerErr }, 'grnService');
    return { data: null, error: new Error(headerErr.message) };
  }
  if (!header) return { data: null, error: null };

  const { data: lines, error: linesErr } = await supabase
    .from('grn_lines')
    .select('*')
    .eq('company_id', companyId)
    .eq('goods_receipt_note_id', id)
    .order('created_at', { ascending: true });
  if (linesErr) {
    loggingService.error('getGoodsReceiptNote lines failed', { companyId, id, error: linesErr }, 'grnService');
    return { data: null, error: new Error(linesErr.message) };
  }

  return {
    data: {
      ...mapGrn(header as Record<string, unknown>),
      lines: (lines as Record<string, unknown>[]).map(mapGrnLine),
    },
    error: null,
  };
}

/** Per-po_line ordered/received/remaining for the receive form. */
export async function getPoLineReceipts(
  companyId: string,
  poId: string,
): Promise<{ data: PoLineReceiptSummary[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_po_line_receipts', {
    p_company_id: companyId,
    p_po_id:      poId,
  });
  if (error) {
    loggingService.error('getPoLineReceipts failed', { companyId, poId, error }, 'grnService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapReceiptSummary),
    error: null,
  };
}

/**
 * Create a GRN. Server-side enforces: PO is in approved/fulfilled state,
 * each line belongs to the PO, cumulative receipts never exceed ordered
 * quantity. Auto-flips PO to 'fulfilled' when every line is fully received.
 */
export async function createGrn(
  companyId: string,
  input: CreateGrnInput,
): Promise<{ data: string | null; error: Error | null }> {
  const linesJson = input.lines.map(l => ({
    purchase_order_line_id: l.purchaseOrderLineId,
    received_quantity:      l.receivedQuantity,
    line_notes:             l.lineNotes ?? null,
  }));
  const { data, error } = await supabase.rpc('create_grn', {
    p_company_id:     companyId,
    p_grn_no:         input.grnNo,
    p_po_id:          input.purchaseOrderId,
    p_received_date:  input.receivedDate,
    p_supplier_dn_no: input.supplierDnNo ?? null,
    p_notes:          input.notes ?? null,
    p_lines:          linesJson,
  });
  if (error) {
    loggingService.error('createGrn failed', { companyId, input, error }, 'grnService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}
