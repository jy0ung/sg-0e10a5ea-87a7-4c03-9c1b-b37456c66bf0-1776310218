import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  ReconciliationDecision,
  ReconciliationMatch,
  ReconciliationMatchDetail,
  ReconciliationMatchStatus,
  ReconciliationObjectType,
  ReconciliationStatusCount,
  SyncSourceSystem,
} from '@/types';

function mapMatch(row: Record<string, unknown>): ReconciliationMatch {
  return {
    id:                String(row.id ?? ''),
    objectType:        (row.object_type as ReconciliationObjectType) ?? 'sales_order',
    sourceSystem:      (row.source_system as SyncSourceSystem | 'ubs') ?? 'dms',
    sourceTable:       String(row.source_table ?? ''),
    sourceRecordId:    String(row.source_record_id ?? ''),
    canonicalTable:    row.canonical_table ? String(row.canonical_table) : null,
    canonicalRecordId: row.canonical_record_id ? String(row.canonical_record_id) : null,
    matchStatus:       (row.match_status as ReconciliationMatchStatus) ?? 'candidate',
    confidenceScore:   row.confidence_score == null ? null : Number(row.confidence_score),
    matchRule:         row.match_rule ? String(row.match_rule) : null,
    sourcePriority:    Number(row.source_priority ?? 100),
    reviewOwner:       row.review_owner ? String(row.review_owner) : null,
    reviewedAt:        row.reviewed_at ? String(row.reviewed_at) : null,
    createdAt:         String(row.created_at ?? ''),
    updatedAt:         String(row.updated_at ?? ''),
  };
}

function mapMatchDetail(row: Record<string, unknown>): ReconciliationMatchDetail {
  return {
    ...mapMatch(row),
    matchBasis:       (row.match_basis as Record<string, unknown>) ?? {},
    conflictPayload:  (row.conflict_payload as Record<string, unknown>) ?? {},
    reviewNotes:      row.review_notes ? String(row.review_notes) : null,
    sourcePayload:    (row.source_payload as Record<string, unknown>) ?? {},
    canonicalPayload: (row.canonical_payload as Record<string, unknown>) ?? {},
  };
}

/**
 * Paged reconciliation queue. Defaults to action-needed states first
 * (conflict → candidate → auto_matched) then by source_priority.
 */
export async function getReconciliationQueue(
  companyId: string,
  opts: {
    objectType?: ReconciliationObjectType;
    matchStatus?: ReconciliationMatchStatus;
    limit?: number;
  } = {},
): Promise<{ data: ReconciliationMatch[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_reconciliation_queue', {
    p_company_id:   companyId,
    p_object_type:  opts.objectType ?? null,
    p_match_status: opts.matchStatus ?? null,
    p_limit:        opts.limit ?? 100,
  });
  if (error) {
    loggingService.error('getReconciliationQueue failed', { companyId, opts, error }, 'reconciliationService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapMatch),
    error: null,
  };
}

/** Per-status counts for the dashboard header. */
export async function getReconciliationStatusCounts(
  companyId: string,
): Promise<{ data: ReconciliationStatusCount[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_reconciliation_status_counts', {
    p_company_id: companyId,
  });
  if (error) {
    loggingService.error('getReconciliationStatusCounts failed', { companyId, error }, 'reconciliationService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(r => ({
      matchStatus: (r.match_status as ReconciliationMatchStatus) ?? 'candidate',
      total:       Number(r.total ?? 0),
    })),
    error: null,
  };
}

/**
 * Side-by-side detail. Returns the match plus both the source raw payload
 * and the canonical record (if linked) as jsonb. Null result means the
 * match was not found within the caller's company.
 */
export async function getReconciliationMatchDetail(
  companyId: string,
  matchId: string,
): Promise<{ data: ReconciliationMatchDetail | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_reconciliation_match_detail', {
    p_company_id: companyId,
    p_match_id:   matchId,
  });
  if (error) {
    loggingService.error('getReconciliationMatchDetail failed', { companyId, matchId, error }, 'reconciliationService');
    return { data: null, error: new Error(error.message) };
  }
  const rows = data as Record<string, unknown>[] | null;
  if (!rows || rows.length === 0) return { data: null, error: null };
  return { data: mapMatchDetail(rows[0]), error: null };
}

/**
 * Apply a reviewer decision (accepted / rejected / ignored). Writes an
 * append-only source_reconciliation_events row server-side, so the audit
 * trail is complete. Returns the match id on success.
 */
export async function decideReconciliationMatch(
  companyId: string,
  matchId: string,
  decision: ReconciliationDecision,
  notes?: string,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('decide_reconciliation_match', {
    p_company_id: companyId,
    p_match_id:   matchId,
    p_decision:   decision,
    p_notes:      notes ?? null,
  });
  if (error) {
    loggingService.error('decideReconciliationMatch failed', { companyId, matchId, decision, error }, 'reconciliationService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}
