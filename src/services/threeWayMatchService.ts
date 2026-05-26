import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type { ThreeWayMatchRow, ThreeWayMatchStatus, ThreeWayMatchStatusCount } from '@/types';

function mapRow(row: Record<string, unknown>): ThreeWayMatchRow {
  return {
    purchaseInvoiceId: String(row.purchase_invoice_id ?? ''),
    invoiceNo:         String(row.invoice_no ?? ''),
    supplier:          String(row.supplier ?? ''),
    chassisNo:         row.chassis_no ? String(row.chassis_no) : null,
    piAmount:          Number(row.pi_amount ?? 0),
    invoiceDate:       row.invoice_date ? String(row.invoice_date) : null,
    poNo:              row.po_no ? String(row.po_no) : null,
    poLineNo:          row.po_line_no == null ? null : Number(row.po_line_no),
    orderedQuantity:   row.ordered_quantity == null ? null : Number(row.ordered_quantity),
    expectedAmount:    row.expected_amount == null ? null : Number(row.expected_amount),
    receivedQuantity:  Number(row.received_quantity ?? 0),
    amountVariance:    row.amount_variance == null ? null : Number(row.amount_variance),
    matchStatus:       (row.match_status as ThreeWayMatchStatus) ?? 'unmatched',
  };
}

/** Per-status totals for the queue header. */
export async function getThreeWayMatchStatusCounts(
  companyId: string,
): Promise<{ data: ThreeWayMatchStatusCount[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_three_way_match_status_counts', {
    p_company_id: companyId,
  });
  if (error) {
    loggingService.error('getThreeWayMatchStatusCounts failed', { companyId, error }, 'threeWayMatchService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(r => ({
      matchStatus: (r.match_status as ThreeWayMatchStatus) ?? 'unmatched',
      total:       Number(r.total ?? 0),
    })),
    error: null,
  };
}

/** Queue: every active PI with its match status, variance/pending first. */
export async function getThreeWayMatchQueue(
  companyId: string,
  opts: { matchStatus?: ThreeWayMatchStatus; limit?: number } = {},
): Promise<{ data: ThreeWayMatchRow[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_three_way_match_queue', {
    p_company_id:   companyId,
    p_match_status: opts.matchStatus ?? null,
    p_limit:        opts.limit ?? 200,
  });
  if (error) {
    loggingService.error('getThreeWayMatchQueue failed', { companyId, opts, error }, 'threeWayMatchService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapRow),
    error: null,
  };
}

/** Single-PI match calculation (for surfacing on a PI detail page). */
export async function getThreeWayMatchStatus(
  companyId: string,
  piId: string,
): Promise<{ data: ThreeWayMatchRow | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_three_way_match_status', {
    p_company_id: companyId,
    p_pi_id:      piId,
  });
  if (error) {
    loggingService.error('getThreeWayMatchStatus failed', { companyId, piId, error }, 'threeWayMatchService');
    return { data: null, error: new Error(error.message) };
  }
  const rows = data as Record<string, unknown>[] | null;
  if (!rows || rows.length === 0) return { data: null, error: null };
  return { data: mapRow(rows[0]), error: null };
}
