import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { DataQualityIssue, ImportBatch, KpiSummary, SlaPolicy, VehicleCanonical } from '@/types';
import { loggingService } from '@/services/loggingService';
import { performanceService } from '@/services/performanceService';
import { getAutoAgingDashboardSummary } from '@/services/vehicleService';

export type AutoAgingDataLoadMode = 'full' | 'summary-only';

type VehicleInsert = Database['public']['Tables']['vehicles']['Insert'];
type ImportBatchInsert = Database['public']['Tables']['import_batches']['Insert'];
type ImportBatchUpdate = Database['public']['Tables']['import_batches']['Update'];
type QualityIssueInsert = Database['public']['Tables']['quality_issues']['Insert'];

export interface AutoAgingContextData {
  vehicles: VehicleCanonical[];
  kpiSummaries?: KpiSummary[];
  availableBranches?: string[];
  availableModels?: string[];
  batches: ImportBatch[];
  issues: DataQualityIssue[];
  slas: SlaPolicy[];
  errors: string[];
  hasAuthError: boolean;
}

function mapDbVehicle(row: Record<string, unknown>): VehicleCanonical {
  return {
    id: String(row.id || ''),
    chassis_no: String(row.chassis_no || ''),
    bg_date: row.bg_date ? String(row.bg_date) : undefined,
    is_deleted: Boolean(row.is_deleted),
    deleted_at: row.deleted_at ? String(row.deleted_at) : undefined,
    shipment_etd_pkg: row.shipment_etd_pkg ? String(row.shipment_etd_pkg) : undefined,
    shipment_eta_kk_twu_sdk: row.shipment_eta_kk_twu_sdk ? String(row.shipment_eta_kk_twu_sdk) : undefined,
    date_received_by_outlet: row.date_received_by_outlet ? String(row.date_received_by_outlet) : undefined,
    reg_date: row.reg_date ? String(row.reg_date) : undefined,
    delivery_date: row.delivery_date ? String(row.delivery_date) : undefined,
    disb_date: row.disb_date ? String(row.disb_date) : undefined,
    branch_code: String(row.branch_code || 'Unknown'),
    model: String(row.model || 'Unknown'),
    payment_method: String(row.payment_method || 'Unknown'),
    salesman_name: String(row.salesman_name || 'Unknown'),
    customer_name: String(row.customer_name || 'Unknown'),
    remark: row.remark ? String(row.remark) : undefined,
    vaa_date: row.vaa_date ? String(row.vaa_date) : undefined,
    full_payment_date: row.full_payment_date ? String(row.full_payment_date) : undefined,
    is_d2d: Boolean(row.is_d2d),
    import_batch_id: String(row.import_batch_id || ''),
    source_row_id: String(row.source_row_id || ''),
    variant: row.variant ? String(row.variant) : undefined,
    dealer_transfer_price: row.dealer_transfer_price ? String(row.dealer_transfer_price) : undefined,
    full_payment_type: row.full_payment_type ? String(row.full_payment_type) : undefined,
    shipment_name: row.shipment_name ? String(row.shipment_name) : undefined,
    lou: row.lou ? String(row.lou) : undefined,
    contra_sola: row.contra_sola ? String(row.contra_sola) : undefined,
    reg_no: row.reg_no ? String(row.reg_no) : undefined,
    invoice_no: row.invoice_no ? String(row.invoice_no) : undefined,
    obr: row.obr ? String(row.obr) : undefined,
    bg_to_delivery: typeof row.bg_to_delivery === 'number' ? row.bg_to_delivery : null,
    bg_to_shipment_etd: typeof row.bg_to_shipment_etd === 'number' ? row.bg_to_shipment_etd : null,
    etd_to_outlet: typeof row.etd_to_outlet === 'number' ? row.etd_to_outlet : null,
    outlet_to_reg: typeof row.outlet_to_reg === 'number' ? row.outlet_to_reg : null,
    reg_to_delivery: typeof row.reg_to_delivery === 'number' ? row.reg_to_delivery : null,
    bg_to_disb: typeof row.bg_to_disb === 'number' ? row.bg_to_disb : null,
    delivery_to_disb: typeof row.delivery_to_disb === 'number' ? row.delivery_to_disb : null,
    color: row.color ? String(row.color) : undefined,
    commission_paid: row.commission_paid == null ? undefined : Boolean(row.commission_paid),
    commission_remark: row.commission_remark ? String(row.commission_remark) : undefined,
    stage: row.stage ? (String(row.stage) as VehicleCanonical['stage']) : undefined,
    stage_override: row.stage_override ? (String(row.stage_override) as VehicleCanonical['stage_override']) : undefined,
  };
}

function mapDbBatch(row: Record<string, unknown>): ImportBatch {
  return {
    id: String(row.id || ''),
    fileName: String(row.file_name || 'Unknown'),
    uploadedBy: String(row.uploaded_by || 'Unknown'),
    uploadedAt: String(row.uploaded_at || new Date().toISOString()),
    status: String(row.status || 'uploaded') as ImportBatch['status'],
    totalRows: Number(row.total_rows || 0),
    validRows: Number(row.valid_rows || 0),
    errorRows: Number(row.error_rows || 0),
    duplicateRows: Number(row.duplicate_rows || 0),
    publishedRows: typeof row.published_rows === 'number' ? row.published_rows : undefined,
    reviewRows: typeof row.review_rows === 'number' ? row.review_rows : undefined,
    reviewCompletedAt: row.review_completed_at ? String(row.review_completed_at) : undefined,
    publishedAt: row.published_at ? String(row.published_at) : undefined,
  };
}

function mapDbIssue(row: Record<string, unknown>): DataQualityIssue {
  return {
    id: String(row.id || ''),
    chassisNo: String(row.chassis_no || ''),
    field: String(row.field || ''),
    issueType: String(row.issue_type || 'invalid') as DataQualityIssue['issueType'],
    message: String(row.message || ''),
    severity: String(row.severity || 'warning') as DataQualityIssue['severity'],
    importBatchId: String(row.import_batch_id || ''),
  };
}

function mapDbSla(row: Record<string, unknown>): SlaPolicy {
  return {
    id: String(row.id || ''),
    kpiId: String(row.kpi_id || ''),
    label: String(row.label || ''),
    slaDays: Number(row.sla_days || 0),
    companyId: String(row.company_id || ''),
  };
}

function isAuthLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
    status?: number;
  };

  const combined = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return candidate.code === 'PGRST301'
    || candidate.status === 401
    || combined.includes('jwt')
    || combined.includes('token')
    || combined.includes('unauthorized')
    || combined.includes('no suitable key');
}

const VEHICLE_PAGE_SIZE = 1_000;

async function fetchAllVehicles(
  companyId: string,
  branchCode?: string | null,
): Promise<{ data: VehicleCanonical[]; error: unknown | null }> {
  const results: VehicleCanonical[] = [];
  const seenRowIds = new Set<string>();
  let from = 0;
  while (true) {
    let query = supabase
      .from('vehicles')
      .select('*')
      .eq('is_deleted', false)
      .eq('company_id', companyId);
    if (branchCode) query = query.eq('branch_code', branchCode);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + VEHICLE_PAGE_SIZE - 1);
    if (error) {
      loggingService.error('Failed to load vehicles page', { error, from }, 'AutoAgingDataService');
      return { data: results, error };
    }

    let duplicateCount = 0;
    const rows = (data ?? []).map(row => mapDbVehicle(row as unknown as Record<string, unknown>));
    for (const row of rows) {
      if (!row.id || seenRowIds.has(row.id)) {
        duplicateCount += 1;
        continue;
      }
      seenRowIds.add(row.id);
      results.push(row);
    }

    if (duplicateCount > 0) {
      loggingService.warn('Skipped duplicate vehicle rows while paging', { duplicateCount, from }, 'AutoAgingDataService');
    }

    if ((data ?? []).length < VEHICLE_PAGE_SIZE) break;
    from += VEHICLE_PAGE_SIZE;
  }
  return { data: results, error: null };
}

export async function fetchAutoAgingContextData(
  companyId: string,
  branchCode?: string | null,
  mode: AutoAgingDataLoadMode = 'full',
): Promise<AutoAgingContextData> {
  const queryId = `data-reload-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const includeVehicles = mode === 'full';

  const [vehiclesRes, summaryRes, batchesRes, issuesRes, slasRes] = await Promise.all([
    includeVehicles
      ? fetchAllVehicles(companyId, branchCode)
      : Promise.resolve({ data: [] as VehicleCanonical[], error: null }),
    !includeVehicles
      ? getAutoAgingDashboardSummary({ branch: branchCode })
      : Promise.resolve({ data: null, error: null }),
    supabase.from('import_batches').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('quality_issues').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('sla_policies').select('*').eq('company_id', companyId),
  ]);

  if (vehiclesRes.error) loggingService.error('Failed to load vehicles', { error: vehiclesRes.error }, 'AutoAgingDataService');
  if (summaryRes.error) loggingService.error('Failed to load summary', { error: summaryRes.error }, 'AutoAgingDataService');
  if (batchesRes.error) loggingService.error('Failed to load import batches', { error: batchesRes.error }, 'AutoAgingDataService');
  if (issuesRes.error) loggingService.error('Failed to load quality issues', { error: issuesRes.error }, 'AutoAgingDataService');
  if (slasRes.error) loggingService.error('Failed to load SLA policies', { error: slasRes.error }, 'AutoAgingDataService');

  const errors = [
    vehiclesRes.error && 'vehicles',
    summaryRes.error && 'summary',
    batchesRes.error && 'import batches',
    issuesRes.error && 'quality issues',
    slasRes.error && 'SLA policies',
  ].filter((value): value is string => Boolean(value));

  const hasAuthError = [vehiclesRes.error, summaryRes.error, batchesRes.error, issuesRes.error, slasRes.error]
    .some(error => isAuthLikeError(error));

  const dbVehicles = vehiclesRes.data ?? [];
  const dbBatches = (batchesRes.data || []).map(row => mapDbBatch(row as unknown as Record<string, unknown>));
  const dbIssues = (issuesRes.data || []).map(row => mapDbIssue(row as unknown as Record<string, unknown>));
  const dbSlas = (slasRes.data || []).map(row => mapDbSla(row as unknown as Record<string, unknown>));

  performanceService.endQueryTimer(queryId, 'data_reload');
  if (errors.length > 0) {
    loggingService.warn(
      'Data reloaded with errors',
      { errors, vehicles: dbVehicles.length, batches: dbBatches.length, issues: dbIssues.length, slas: dbSlas.length },
      'AutoAgingDataService',
    );
  } else {
    loggingService.info(
      'Data reloaded successfully',
      { vehicles: dbVehicles.length, batches: dbBatches.length, issues: dbIssues.length, slas: dbSlas.length },
      'AutoAgingDataService',
    );
  }

  return {
    vehicles: dbVehicles,
    kpiSummaries: summaryRes.data?.kpiSummaries,
    availableBranches: summaryRes.data?.availableBranches,
    availableModels: summaryRes.data?.availableModels,
    batches: dbBatches,
    issues: dbIssues,
    slas: dbSlas,
    errors,
    hasAuthError,
  };
}

function mapVehicleToInsert(vehicle: VehicleCanonical, companyId: string): VehicleInsert {
  return {
    chassis_no: vehicle.chassis_no,
    bg_date: vehicle.bg_date || null,
    shipment_etd_pkg: vehicle.shipment_etd_pkg || null,
    shipment_eta_kk_twu_sdk: vehicle.shipment_eta_kk_twu_sdk || null,
    date_received_by_outlet: vehicle.date_received_by_outlet || null,
    reg_date: vehicle.reg_date || null,
    delivery_date: vehicle.delivery_date || null,
    disb_date: vehicle.disb_date || null,
    branch_code: vehicle.branch_code,
    model: vehicle.model,
    payment_method: vehicle.payment_method,
    salesman_name: vehicle.salesman_name,
    customer_name: vehicle.customer_name,
    remark: vehicle.remark || null,
    vaa_date: vehicle.vaa_date || null,
    full_payment_date: vehicle.full_payment_date || null,
    is_d2d: Boolean(vehicle.is_d2d),
    import_batch_id: null,
    source_row_id: vehicle.source_row_id,
    variant: vehicle.variant || null,
    dealer_transfer_price: vehicle.dealer_transfer_price || null,
    full_payment_type: vehicle.full_payment_type || null,
    shipment_name: vehicle.shipment_name || null,
    lou: vehicle.lou || null,
    contra_sola: vehicle.contra_sola || null,
    reg_no: vehicle.reg_no || null,
    invoice_no: vehicle.invoice_no || null,
    obr: vehicle.obr || null,
    bg_to_delivery: vehicle.bg_to_delivery ?? null,
    bg_to_shipment_etd: vehicle.bg_to_shipment_etd ?? null,
    etd_to_outlet: vehicle.etd_to_outlet ?? null,
    outlet_to_reg: vehicle.outlet_to_reg ?? null,
    reg_to_delivery: vehicle.reg_to_delivery ?? null,
    bg_to_disb: vehicle.bg_to_disb ?? null,
    delivery_to_disb: vehicle.delivery_to_disb ?? null,
    company_id: companyId,
  };
}

export async function upsertAutoAgingVehicles(
  companyId: string,
  vehicles: VehicleCanonical[],
  batchSize = 500,
) {
  let inserted = 0;
  for (let i = 0; i < vehicles.length; i += batchSize) {
    const chunk = vehicles.slice(i, i + batchSize);
    const dbRows = chunk.map(vehicle => mapVehicleToInsert(vehicle, companyId));

    const { error } = await supabase
      .from('vehicles')
      .upsert(dbRows, { onConflict: 'chassis_no,company_id' });

    if (error) {
      loggingService.error('Failed to upsert vehicles chunk', { error, startIdx: i }, 'AutoAgingDataService');
      throw error;
    }
    inserted += chunk.length;
  }
  return inserted;
}

export async function upsertAutoAgingImportBatch(companyId: string, batch: ImportBatch) {
  const row: ImportBatchInsert = {
    id: batch.id,
    file_name: batch.fileName,
    uploaded_by: batch.uploadedBy,
    uploaded_at: batch.uploadedAt,
    status: batch.status,
    total_rows: batch.totalRows,
    valid_rows: batch.validRows,
    error_rows: batch.errorRows,
    duplicate_rows: batch.duplicateRows,
    published_rows: batch.publishedRows ?? 0,
    review_rows: batch.reviewRows ?? 0,
    review_completed_at: batch.reviewCompletedAt ?? null,
    company_id: companyId,
  };

  return supabase.from('import_batches').upsert(row, { onConflict: 'id' });
}

export async function updateAutoAgingImportBatch(
  companyId: string,
  id: string,
  updates: Partial<ImportBatch>,
) {
  const dbUpdates: ImportBatchUpdate = {};
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.publishedAt) dbUpdates.published_at = updates.publishedAt;
  if (updates.totalRows !== undefined) dbUpdates.total_rows = updates.totalRows;
  if (updates.validRows !== undefined) dbUpdates.valid_rows = updates.validRows;
  if (updates.errorRows !== undefined) dbUpdates.error_rows = updates.errorRows;
  if (updates.duplicateRows !== undefined) dbUpdates.duplicate_rows = updates.duplicateRows;
  if (updates.publishedRows !== undefined) dbUpdates.published_rows = updates.publishedRows;
  if (updates.reviewRows !== undefined) dbUpdates.review_rows = updates.reviewRows;
  if (updates.reviewCompletedAt) dbUpdates.review_completed_at = updates.reviewCompletedAt;

  return supabase.from('import_batches').update(dbUpdates).eq('company_id', companyId).eq('id', id);
}

export async function insertAutoAgingQualityIssues(companyId: string, issues: DataQualityIssue[]) {
  for (let index = 0; index < issues.length; index += 500) {
    const chunk: QualityIssueInsert[] = issues.slice(index, index + 500).map(issue => ({
      chassis_no: issue.chassisNo,
      field: issue.field,
      issue_type: issue.issueType,
      message: issue.message,
      severity: issue.severity,
      import_batch_id: null,
      company_id: companyId,
    }));
    const { error } = await supabase.from('quality_issues').insert(chunk);
    if (error) {
      loggingService.error('Quality issues insert error', { error, chunkIndex: index }, 'AutoAgingDataService');
      throw error;
    }
  }
}

export async function updateAutoAgingSlaPolicy(companyId: string, id: string, slaDays: number) {
  return supabase.from('sla_policies').update({ sla_days: slaDays }).eq('company_id', companyId).eq('id', id);
}

export function subscribeToAutoAgingVehicleChanges(companyId: string, onChange: () => void) {
  const channel = supabase
    .channel(`realtime:vehicles:${companyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'vehicles', filter: `company_id=eq.${companyId}` },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Fetch quality issues for a specific chassis number. */
export async function getQualityIssuesByChassis(
  companyId: string,
  chassisNo: string,
): Promise<DataQualityIssue[]> {
  const { data, error } = await supabase
    .from('quality_issues')
    .select('*')
    .eq('company_id', companyId)
    .eq('chassis_no', chassisNo);

  if (error) {
    loggingService.error('Failed to load quality issues for chassis', { chassisNo, error }, 'AutoAgingDataService');
    return [];
  }

  return (data ?? []).map(row => mapDbIssue(row as unknown as Record<string, unknown>));
}
