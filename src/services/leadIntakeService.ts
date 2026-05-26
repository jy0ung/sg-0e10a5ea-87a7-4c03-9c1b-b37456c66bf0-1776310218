import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  LeadDetail,
  LeadFeedRow,
  LeadFollowup,
  LeadFollowupOutcome,
  LeadSourceKind,
} from '@/types';

function mapFeedRow(row: Record<string, unknown>): LeadFeedRow {
  return {
    sourceKind:          (row.source_kind as LeadSourceKind) ?? 'lead',
    sourceRawId:         String(row.source_raw_id ?? ''),
    dmsExternalId:       row.dms_external_id ? String(row.dms_external_id) : null,
    dmsCustomerId:       row.dms_customer_id ? String(row.dms_customer_id) : null,
    branchCode:          row.branch_code ? String(row.branch_code) : null,
    salespersonCode:     row.salesperson_code ? String(row.salesperson_code) : null,
    status:              row.status ? String(row.status) : null,
    sourceCreatedAt:     row.source_created_at ? String(row.source_created_at) : null,
    fetchedAt:           String(row.fetched_at ?? ''),
    followupCount:       Number(row.followup_count ?? 0),
    lastFollowupAt:      row.last_followup_at ? String(row.last_followup_at) : null,
    lastFollowupOutcome: row.last_followup_outcome ? (row.last_followup_outcome as LeadFollowupOutcome) : null,
    nextActionDate:      row.next_action_date ? String(row.next_action_date) : null,
  };
}

function mapFollowup(row: Record<string, unknown>): LeadFollowup {
  return {
    id:             String(row.id ?? ''),
    companyId:      String(row.company_id ?? ''),
    sourceKind:     (row.source_kind as LeadSourceKind) ?? 'lead',
    sourceRawId:    String(row.source_raw_id ?? ''),
    notes:          String(row.notes ?? ''),
    outcome:        row.outcome ? (row.outcome as LeadFollowupOutcome) : null,
    nextActionDate: row.next_action_date ? String(row.next_action_date) : null,
    authorId:       row.author_id ? String(row.author_id) : null,
    createdAt:      String(row.created_at ?? ''),
    updatedAt:      String(row.updated_at ?? ''),
  };
}

function mapDetail(row: Record<string, unknown>): LeadDetail {
  const followupsRaw = (row.followups as Record<string, unknown>[]) ?? [];
  return {
    sourceKind:      (row.source_kind as LeadSourceKind) ?? 'lead',
    sourceRawId:     String(row.source_raw_id ?? ''),
    dmsExternalId:   row.dms_external_id ? String(row.dms_external_id) : null,
    dmsCustomerId:   row.dms_customer_id ? String(row.dms_customer_id) : null,
    branchCode:      row.branch_code ? String(row.branch_code) : null,
    salespersonCode: row.salesperson_code ? String(row.salesperson_code) : null,
    status:          row.status ? String(row.status) : null,
    sourceCreatedAt: row.source_created_at ? String(row.source_created_at) : null,
    fetchedAt:       String(row.fetched_at ?? ''),
    rawPayload:      (row.raw_payload as Record<string, unknown>) ?? {},
    followups:       followupsRaw.map(mapFollowup),
  };
}

/**
 * Unified leads/prospects feed. Past-due next-actions are listed first,
 * then never-followed-up leads, then everything else by creation date.
 */
export async function getLeadsFeed(
  companyId: string,
  opts: { kind?: LeadSourceKind; status?: string; branchCode?: string; limit?: number } = {},
): Promise<{ data: LeadFeedRow[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_leads_feed', {
    p_company_id:  companyId,
    p_kind:        opts.kind ?? null,
    p_status:      opts.status ?? null,
    p_branch_code: opts.branchCode ?? null,
    p_limit:       opts.limit ?? 200,
  });
  if (error) {
    loggingService.error('getLeadsFeed failed', { companyId, opts, error }, 'leadIntakeService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapFeedRow),
    error: null,
  };
}

/** Single lead/prospect with all attached follow-ups in time order. */
export async function getLeadDetail(
  companyId: string,
  sourceKind: LeadSourceKind,
  rawId: string,
): Promise<{ data: LeadDetail | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_lead_detail', {
    p_company_id:  companyId,
    p_source_kind: sourceKind,
    p_raw_id:      rawId,
  });
  if (error) {
    loggingService.error('getLeadDetail failed', { companyId, sourceKind, rawId, error }, 'leadIntakeService');
    return { data: null, error: new Error(error.message) };
  }
  const rows = data as Record<string, unknown>[] | null;
  if (!rows || rows.length === 0) return { data: null, error: null };
  return { data: mapDetail(rows[0]), error: null };
}

/**
 * Append a follow-up. The RPC forces author_id = auth.uid() server-side
 * so the browser cannot impersonate. Returns the new follow-up id.
 */
export async function addLeadFollowup(
  companyId: string,
  sourceKind: LeadSourceKind,
  rawId: string,
  notes: string,
  opts: { outcome?: LeadFollowupOutcome; nextActionDate?: string } = {},
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('add_lead_followup', {
    p_company_id:       companyId,
    p_source_kind:      sourceKind,
    p_source_raw_id:    rawId,
    p_notes:            notes,
    p_outcome:          opts.outcome ?? null,
    p_next_action_date: opts.nextActionDate ?? null,
  });
  if (error) {
    loggingService.error('addLeadFollowup failed', { companyId, sourceKind, rawId, error }, 'leadIntakeService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as string, error: null };
}
