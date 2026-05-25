import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type {
  DmsRawStagingCount,
  SyncRun,
  SyncRunStatus,
  SyncRunSummaryRow,
  SyncSourceSystem,
} from '@/types';

function mapSyncRun(row: Record<string, unknown>): SyncRun {
  return {
    id:             String(row.id ?? ''),
    companyId:      String(row.company_id ?? ''),
    sourceSystem:   (row.source_system as SyncSourceSystem) ?? 'manual',
    syncType:       String(row.sync_type ?? ''),
    sourceEndpoint: row.source_endpoint ? String(row.source_endpoint) : null,
    requestFilters: (row.request_filters as Record<string, unknown>) ?? {},
    status:         (row.status as SyncRunStatus) ?? 'pending',
    recordCount:    Number(row.record_count ?? 0),
    startedAt:      String(row.started_at ?? ''),
    finishedAt:     row.finished_at ? String(row.finished_at) : null,
    errorCode:      row.error_code ? String(row.error_code) : null,
    errorMessage:   row.error_message ? String(row.error_message) : null,
    createdAt:      String(row.created_at ?? ''),
    updatedAt:      String(row.updated_at ?? ''),
  };
}

function mapSummaryRow(row: Record<string, unknown>): SyncRunSummaryRow {
  return {
    sourceSystem:     (row.source_system as SyncSourceSystem) ?? 'manual',
    totalRuns:        Number(row.total_runs ?? 0),
    succeededRuns:    Number(row.succeeded_runs ?? 0),
    failedRuns:       Number(row.failed_runs ?? 0),
    runningRuns:      Number(row.running_runs ?? 0),
    pendingRuns:      Number(row.pending_runs ?? 0),
    lastRunAt:        row.last_run_at ? String(row.last_run_at) : null,
    lastRunStatus:    row.last_run_status ? (row.last_run_status as SyncRunStatus) : null,
    totalRecordCount: Number(row.total_record_count ?? 0),
  };
}

function mapStagingCount(row: Record<string, unknown>): DmsRawStagingCount {
  return {
    tableName:       String(row.table_name ?? ''),
    totalRows:       Number(row.total_rows ?? 0),
    normalizedRows:  Number(row.normalized_rows ?? 0),
    pendingRows:     Number(row.pending_rows ?? 0),
    latestFetchedAt: row.latest_fetched_at ? String(row.latest_fetched_at) : null,
  };
}

/**
 * Aggregate sync_runs KPIs per source_system for a company. Returns at most
 * one row per source the company has ever run; sources with no runs do not
 * appear.
 */
export async function getDmsSyncRunsSummary(
  companyId: string,
): Promise<{ data: SyncRunSummaryRow[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_dms_sync_runs_summary', {
    p_company_id: companyId,
  });
  if (error) {
    loggingService.error('getDmsSyncRunsSummary failed', { companyId, error }, 'dmsService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapSummaryRow),
    error: null,
  };
}

/**
 * Per-staging-table row counts (total / normalized / pending) across the
 * nine dms_raw_* tables. Operators use this alongside the runs summary to
 * spot a table that's accumulating staged rows without normalization.
 */
export async function getDmsRawStagingCounts(
  companyId: string,
): Promise<{ data: DmsRawStagingCount[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_dms_raw_staging_counts', {
    p_company_id: companyId,
  });
  if (error) {
    loggingService.error('getDmsRawStagingCounts failed', { companyId, error }, 'dmsService');
    return { data: null, error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapStagingCount),
    error: null,
  };
}

/**
 * Paged sync_runs list with optional source_system / status filters. Default
 * limit 50, ordered newest-first.
 */
export async function listSyncRuns(
  companyId: string,
  opts: { sourceSystem?: SyncSourceSystem; status?: SyncRunStatus; limit?: number } = {},
): Promise<{ data: SyncRun[]; error: Error | null }> {
  let query = supabase
    .from('sync_runs')
    .select('*')
    .eq('company_id', companyId);

  if (opts.sourceSystem) query = query.eq('source_system', opts.sourceSystem);
  if (opts.status)       query = query.eq('status', opts.status);

  const { data, error } = await query
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (error) {
    loggingService.error('listSyncRuns failed', { companyId, opts, error }, 'dmsService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapSyncRun),
    error: null,
  };
}
