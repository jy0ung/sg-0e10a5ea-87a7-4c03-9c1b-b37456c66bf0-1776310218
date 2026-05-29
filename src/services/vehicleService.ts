import { supabase } from "@/integrations/supabase/client";
import type { DataQualityIssue, KpiSummary, VehicleCanonical } from "@/types";
import { logUserAction, logVehicleEdit } from "./auditService";
import { performanceService } from "./performanceService";
import { loggingService } from "./loggingService";
import { LruCache } from "@/lib/lruCache";

function missingCompanyError(): Error {
  return new Error('Company context is required for vehicle operations');
}

export async function getVehicleById(companyId: string, id: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const queryId = `vehicle-get-${id}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .single();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_id");

  if (error) {
    loggingService.error("Failed to get vehicle", { companyId, id, error }, "VehicleService");
  }

  return { data: data as unknown as VehicleCanonical | null, error: error || null };
}

export async function getVehicleByChassis(companyId: string, chassisNo: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const queryId = `vehicle-chassis-${chassisNo}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("company_id", companyId)
    .eq("chassis_no", chassisNo)
    .maybeSingle();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_chassis");

  if (error) {
    loggingService.error("Failed to get vehicle by chassis", { companyId, chassisNo, error }, "VehicleService");
  }

  return { data: data as unknown as VehicleCanonical | null, error: error || null };
}

export async function getVehicles(filters?: {
  branchCode?: string;
  model?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ 
  data: VehicleCanonical[] | null; 
  error: Error | null; 
  count?: number 
}> {
  const queryId = `vehicles-list-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  let query = supabase
    .from("vehicles")
    .select("*", { count: "exact" });

  if (filters?.branchCode) {
    query = query.eq("branch_code", filters.branchCode);
  }

  if (filters?.model) {
    query = query.eq("model", filters.model);
  }

  // Note: vehicles table uses stage_override not a status column
  // if (filters?.status) { query = query.eq("stage_override", filters.status); }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  performanceService.endQueryTimer(queryId, "get_vehicles_filtered");

  if (error) {
    loggingService.error("Failed to get vehicles", { filters, error }, "VehicleService");
  }

  return { data: data as unknown as VehicleCanonical[] | null, error: error || null, count: count ?? undefined };
}

export async function updateVehicleWithAudit(
  companyId: string,
  id: string,
  updates: Partial<Record<string, unknown>>,
  userId: string,
): Promise<{ data: VehicleCanonical | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data: before } = await getVehicleById(companyId, id);
  const { data, error } = await supabase
    .from('vehicles')
    .update(updates as never)
    .eq('company_id', companyId)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    changes[key] = { before: (before as unknown as Record<string, unknown> | null)?.[key], after: updates[key] };
  }
  await logVehicleEdit(userId, id, changes as Record<string, { before: unknown; after: unknown }>);
  return { data: data as unknown as VehicleCanonical, error: null };
}

/**
 * Bulk update a set of vehicles by id. Audit logging is the caller's
 * responsibility because bulk actions typically need per-row before/after
 * diffs that the service cannot reconstruct generically.
 */
export async function bulkUpdateVehicles(
  companyId: string,
  ids: string[],
  updates: Partial<Record<string, unknown>>,
  actorId?: string,
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null };
  if (!companyId) return { error: missingCompanyError() };

  const { data: scopedRows, error: scopeError } = await supabase
    .from('vehicles')
    .select('id')
    .eq('company_id', companyId)
    .in('id', ids);
  if (scopeError) return { error: new Error(scopeError.message) };
  if ((scopedRows ?? []).length !== ids.length) {
    return { error: new Error('One or more vehicles are outside the current company scope') };
  }

  const { error } = await supabase.from('vehicles').update(updates as never).eq('company_id', companyId).in('id', ids);
  if (error) {
    loggingService.error('Bulk vehicle update failed', { count: ids.length, error }, 'VehicleService');
    return { error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'update', 'vehicle', undefined, { component: 'VehicleService', itemCount: ids.length });
  return { error: null };
}

/**
 * Soft-delete a set of vehicles. Uses the is_deleted/deleted_at soft-delete
 * columns and returns after the DB round-trip so callers can log audit rows.
 */
export async function softDeleteVehicles(
  companyId: string,
  ids: string[],
  actorId?: string,
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null };
  if (!companyId) return { error: missingCompanyError() };

  const { data: scopedRows, error: scopeError } = await supabase
    .from('vehicles')
    .select('id')
    .eq('company_id', companyId)
    .in('id', ids);
  if (scopeError) return { error: new Error(scopeError.message) };
  if ((scopedRows ?? []).length !== ids.length) {
    return { error: new Error('One or more vehicles are outside the current company scope') };
  }

  const { error } = await supabase
    .from('vehicles')
    .update({ is_deleted: true, updated_at: new Date().toISOString() } as never)
    .eq('company_id', companyId)
    .in('id', ids);
  if (error) {
    loggingService.error('Soft-delete vehicles failed', { count: ids.length, error }, 'VehicleService');
    return { error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'delete', 'vehicle', undefined, { component: 'VehicleService', itemCount: ids.length });
  return { error: null };
}

/**
 * Insert a new vehicle row. Used by purchasing flows where a goods-receipt
 * creates a vehicle record at invoice time.
 */
export async function insertVehicle(
  companyId: string,
  row: Record<string, unknown>,
  actorId?: string,
): Promise<{ data: VehicleCanonical | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase
    .from('vehicles')
    .insert({ ...row, company_id: companyId } as never)
    .select()
    .single();
  if (error) {
    loggingService.error('Vehicle insert failed', { error }, 'VehicleService');
    return { data: null, error: new Error(error.message) };
  }
  if (actorId) void logUserAction(actorId, 'create', 'vehicle', String((data as Record<string, unknown>).id), { component: 'VehicleService' });
  return { data: data as VehicleCanonical, error: null };
}

// ---------------------------------------------------------------------------
// Server-side Auto Aging report generation
// ---------------------------------------------------------------------------

export type AutoAgingReportType = 'aging_summary' | 'sla_compliance' | 'salesman_performance' | 'vehicle_export';

export interface AutoAgingReportParams {
  reportType: AutoAgingReportType;
  branch?: string | null;
  model?: string | null;
  bgDateFrom?: string | null;
  bgDateTo?: string | null;
  limit?: number;
  offset?: number;
}

export interface AutoAgingReportResult {
  rows: Record<string, unknown>[];
  totalCount: number;
}

const reportCache = new LruCache<string, AutoAgingReportResult>({ max: 32, ttlMs: 30_000 });

export interface AutoAgingSourceLedgerParams {
  branch?: string | null;
  model?: string | null;
  search?: string | null;
  bgDateFrom?: string | null;
  bgDateTo?: string | null;
  limit?: number;
  offset?: number;
}

export interface AutoAgingSourceLedgerRow {
  sourceKey: string;
  vehicleId: string | null;
  salesOrderId: string | null;
  chassisNo: string | null;
  branchCode: string | null;
  model: string | null;
  customerName: string | null;
  salesmanName: string | null;
  paymentMethod: string | null;
  dmsSoNo: string | null;
  lastSourceAt: string | null;
  needsReconciliation: boolean;
  sourcePresence: Record<string, boolean>;
  sourceConflicts: Record<string, unknown>;
  authority: Record<string, unknown>;
  localFacts: Record<string, unknown>;
  dmsFacts: Record<string, unknown>;
  legacyFacts: Record<string, unknown>;
}

export interface AutoAgingSourceLedgerResult {
  rows: AutoAgingSourceLedgerRow[];
  totalCount: number;
  sourceCounts: Record<string, number>;
  generatedAt: string | null;
}

const sourceLedgerCache = new LruCache<string, AutoAgingSourceLedgerResult>({ max: 32, ttlMs: 30_000 });

function toStringOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapBooleanRecord(value: unknown): Record<string, boolean> {
  const record = toRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, Boolean(item)]));
}

function mapNumberRecord(value: unknown): Record<string, number> {
  const record = toRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, Number(item ?? 0)]));
}

function mapSourceLedgerRow(row: Record<string, unknown>): AutoAgingSourceLedgerRow {
  return {
    sourceKey: String(row.source_key || ''),
    vehicleId: toStringOrNull(row.vehicle_id),
    salesOrderId: toStringOrNull(row.sales_order_id),
    chassisNo: toStringOrNull(row.chassis_no),
    branchCode: toStringOrNull(row.branch_code),
    model: toStringOrNull(row.model),
    customerName: toStringOrNull(row.customer_name),
    salesmanName: toStringOrNull(row.salesman_name),
    paymentMethod: toStringOrNull(row.payment_method),
    dmsSoNo: toStringOrNull(row.dms_so_no),
    lastSourceAt: toStringOrNull(row.last_source_at),
    needsReconciliation: Boolean(row.needs_reconciliation),
    sourcePresence: mapBooleanRecord(row.source_presence),
    sourceConflicts: toRecord(row.source_conflicts),
    authority: toRecord(row.authority),
    localFacts: toRecord(row.local_facts),
    dmsFacts: toRecord(row.dms_facts),
    legacyFacts: toRecord(row.legacy_facts),
  };
}

export async function getAutoAgingReport(
  params: AutoAgingReportParams,
): Promise<{ data: AutoAgingReportResult; error: Error | null }> {
  const queryId = `auto-aging-report-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const cacheKey = JSON.stringify(params);
  const cached = reportCache.get(cacheKey);
  if (cached) {
    performanceService.endQueryTimer(queryId, 'auto_aging_report_cached');
    return { data: cached, error: null };
  }

  const { data, error } = await supabase.rpc('auto_aging_report', {
    p_report_type: params.reportType,
    p_branch: params.branch ?? undefined,
    p_model: params.model ?? undefined,
    p_bg_date_from: params.bgDateFrom ?? undefined,
    p_bg_date_to: params.bgDateTo ?? undefined,
    p_limit: params.limit ?? 500,
    p_offset: params.offset ?? 0,
  });

  performanceService.endQueryTimer(queryId, 'auto_aging_report');

  if (error) {
    loggingService.error('auto_aging_report RPC failed', { params, error }, 'VehicleService');
    return { data: { rows: [], totalCount: 0 }, error: new Error(error.message) };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const result: AutoAgingReportResult = {
    rows: Array.isArray(raw.rows) ? raw.rows as Record<string, unknown>[] : [],
    totalCount: Number(raw.total_count ?? 0),
  };

  reportCache.set(cacheKey, result);
  return { data: result, error: null };
}

export async function getAutoAgingSourceLedger(
  params: AutoAgingSourceLedgerParams = {},
): Promise<{ data: AutoAgingSourceLedgerResult; error: Error | null }> {
  const queryId = `auto-aging-source-ledger-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const cacheKey = JSON.stringify(params);
  const cached = sourceLedgerCache.get(cacheKey);
  if (cached) {
    performanceService.endQueryTimer(queryId, 'auto_aging_source_ledger_cached');
    return { data: cached, error: null };
  }

  const { data, error } = await supabase.rpc('auto_aging_source_ledger', {
    p_branch: params.branch ?? undefined,
    p_model: params.model ?? undefined,
    p_search: params.search ?? undefined,
    p_bg_date_from: params.bgDateFrom ?? undefined,
    p_bg_date_to: params.bgDateTo ?? undefined,
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
  });

  performanceService.endQueryTimer(queryId, 'auto_aging_source_ledger');

  if (error) {
    loggingService.error('auto_aging_source_ledger RPC failed', { params, error }, 'VehicleService');
    return {
      data: { rows: [], totalCount: 0, sourceCounts: {}, generatedAt: null },
      error: new Error(error.message),
    };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const result: AutoAgingSourceLedgerResult = {
    rows: Array.isArray(raw.rows)
      ? raw.rows.map(item => mapSourceLedgerRow(item as Record<string, unknown>))
      : [],
    totalCount: Number(raw.total_count ?? 0),
    sourceCounts: mapNumberRecord(raw.source_counts),
    generatedAt: toStringOrNull(raw.generated_at),
  };

  sourceLedgerCache.set(cacheKey, result);
  return { data: result, error: null };
}

// ---------------------------------------------------------------------------
// Phase 2 #17: server-side paginated search + KPI summary
// ---------------------------------------------------------------------------

export interface VehicleSearchParams {
  branch?: string | null;
  model?: string | null;
  payment?: string | null;
  stage?: string | null;
  search?: string | null;
  bgDateFrom?: string | null;
  bgDateTo?: string | null;
  hasDeliveryDate?: boolean | null;
  limit?: number;
  offset?: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface VehicleSearchResult {
  rows: VehicleCanonical[];
  totalCount: number;
}

function mapSearchVehicle(row: Record<string, unknown>): VehicleCanonical {
  return {
    id: String(row.id || ''),
    chassis_no: String(row.chassis_no || ''),
    is_deleted: Boolean(row.is_deleted),
    deleted_at: row.deleted_at ? String(row.deleted_at) : undefined,
    bg_date: row.bg_date ? String(row.bg_date) : undefined,
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
    color: row.color ? String(row.color) : undefined,
    dealer_transfer_price: row.dealer_transfer_price ? String(row.dealer_transfer_price) : undefined,
    full_payment_type: row.full_payment_type ? String(row.full_payment_type) : undefined,
    shipment_name: row.shipment_name ? String(row.shipment_name) : undefined,
    lou: row.lou ? String(row.lou) : undefined,
    contra_sola: row.contra_sola ? String(row.contra_sola) : undefined,
    reg_no: row.reg_no ? String(row.reg_no) : undefined,
    invoice_no: row.invoice_no ? String(row.invoice_no) : undefined,
    obr: row.obr ? String(row.obr) : undefined,
    commission_paid: row.commission_paid == null ? undefined : Boolean(row.commission_paid),
    commission_remark: row.commission_remark ? String(row.commission_remark) : undefined,
    stage: row.stage ? (String(row.stage) as VehicleCanonical['stage']) : undefined,
    stage_override: row.stage_override ? (String(row.stage_override) as VehicleCanonical['stage_override']) : undefined,
    bg_to_delivery: typeof row.bg_to_delivery === 'number' ? row.bg_to_delivery : null,
    bg_to_shipment_etd: typeof row.bg_to_shipment_etd === 'number' ? row.bg_to_shipment_etd : null,
    etd_to_outlet: typeof row.etd_to_outlet === 'number' ? row.etd_to_outlet : null,
    outlet_to_reg: typeof row.outlet_to_reg === 'number' ? row.outlet_to_reg : null,
    reg_to_delivery: typeof row.reg_to_delivery === 'number' ? row.reg_to_delivery : null,
    bg_to_disb: typeof row.bg_to_disb === 'number' ? row.bg_to_disb : null,
    delivery_to_disb: typeof row.delivery_to_disb === 'number' ? row.delivery_to_disb : null,
    is_incomplete: Boolean(row.is_incomplete),
    pending_fields: Array.isArray(row.pending_fields) ? row.pending_fields.map(String) : undefined,
    salesman_id: row.salesman_id ? String(row.salesman_id) : null,
  };
}

export interface VehicleKpiSummary {
  total: number;
  delivered: number;
  pendingDelivery: number;
  pendingRegistration: number;
  pendingDisbursement: number;
  avgBgToDelivery: number | null;
  avgBgToDisb: number | null;
  avgEtdToOutlet: number | null;
  avgOutletToReg: number | null;
  avgRegToDelivery: number | null;
  byBranch: Record<string, number>;
  byModel: Record<string, number>;
}

export interface AutoAgingDashboardSummaryParams {
  branch?: string | null;
  model?: string | null;
  bgDateFrom?: string | null;
  bgDateTo?: string | null;
}

export interface AutoAgingDashboardSummary {
  availableBranches: string[];
  availableModels: string[];
  kpiSummaries: KpiSummary[];
  qualityIssueCount: number;
  qualityIssueSample: DataQualityIssue[];
}

// LRU caches for hot RPCs. Keyed on the serialized args; 30 s TTL keeps
// transient toggles fast without masking fresh mutations for long.
const searchCache = new LruCache<string, VehicleSearchResult>({ max: 64, ttlMs: 30_000 });
const kpiCache = new LruCache<string, VehicleKpiSummary>({ max: 16, ttlMs: 30_000 });
const dashboardSummaryCache = new LruCache<string, AutoAgingDashboardSummary>({ max: 32, ttlMs: 30_000 });

/** Clear the paginated search + KPI + report caches. Call after vehicle mutations. */
export function invalidateVehicleCaches(): void {
  searchCache.clear();
  kpiCache.clear();
  dashboardSummaryCache.clear();
  reportCache.clear();
  sourceLedgerCache.clear();
}

export async function searchVehicles(
  params: VehicleSearchParams = {},
): Promise<{ data: VehicleSearchResult; error: Error | null }> {
  const queryId = `vehicle-search-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const cacheKey = JSON.stringify(params);
  const cached = searchCache.get(cacheKey);
  if (cached) {
    performanceService.endQueryTimer(queryId, 'search_vehicles_cached');
    return { data: cached, error: null };
  }

  const { data, error } = await supabase.rpc('search_vehicles', {
    p_branch: (params.branch ?? null) as unknown as string | undefined,
    p_model: (params.model ?? null) as unknown as string | undefined,
    p_payment: (params.payment ?? null) as unknown as string | undefined,
    p_stage: (params.stage ?? null) as unknown as string | undefined,
    p_search: (params.search ?? null) as unknown as string | undefined,
    p_bg_date_from: (params.bgDateFrom ?? null) as unknown as string | undefined,
    p_bg_date_to: (params.bgDateTo ?? null) as unknown as string | undefined,
    p_has_delivery_date: (params.hasDeliveryDate ?? null) as unknown as boolean | undefined,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_sort_column: params.sortColumn ?? 'created_at',
    p_sort_direction: params.sortDirection ?? 'desc',
  });

  performanceService.endQueryTimer(queryId, 'search_vehicles');

  if (error) {
    loggingService.error('searchVehicles RPC failed', { params, error }, 'VehicleService');
    return { data: { rows: [], totalCount: 0 }, error: new Error(error.message) };
  }

  // The RPC returns a table with exactly one row of shape {rows, total_count}.
  const row = Array.isArray(data) ? data[0] : data;
  const result: VehicleSearchResult = {
    rows: ((row?.rows ?? []) as Record<string, unknown>[]).map(mapSearchVehicle),
    totalCount: Number(row?.total_count ?? 0),
  };

  searchCache.set(cacheKey, result);
  return { data: result, error: null };
}

export async function getVehicleKpiSummary(
  branch?: string | null,
): Promise<{ data: VehicleKpiSummary | null; error: Error | null }> {
  const queryId = `vehicle-kpi-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const cacheKey = branch ?? '__all__';
  const cached = kpiCache.get(cacheKey);
  if (cached) {
    performanceService.endQueryTimer(queryId, 'vehicle_kpi_summary_cached');
    return { data: cached, error: null };
  }

  const { data, error } = await supabase.rpc('vehicle_kpi_summary', {
    p_branch: (branch ?? null) as unknown as string | undefined,
  });

  performanceService.endQueryTimer(queryId, 'vehicle_kpi_summary');

  if (error) {
    loggingService.error('vehicle_kpi_summary RPC failed', { branch, error }, 'VehicleService');
    return { data: null, error: new Error(error.message) };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const summary: VehicleKpiSummary = {
    total: Number(raw.total ?? 0),
    delivered: Number(raw.delivered ?? 0),
    pendingDelivery: Number(raw.pending_delivery ?? 0),
    pendingRegistration: Number(raw.pending_registration ?? 0),
    pendingDisbursement: Number(raw.pending_disbursement ?? 0),
    avgBgToDelivery: raw.avg_bg_to_delivery == null ? null : Number(raw.avg_bg_to_delivery),
    avgBgToDisb: raw.avg_bg_to_disb == null ? null : Number(raw.avg_bg_to_disb),
    avgEtdToOutlet: raw.avg_etd_to_outlet == null ? null : Number(raw.avg_etd_to_outlet),
    avgOutletToReg: raw.avg_outlet_to_reg == null ? null : Number(raw.avg_outlet_to_reg),
    avgRegToDelivery: raw.avg_reg_to_delivery == null ? null : Number(raw.avg_reg_to_delivery),
    byBranch: (raw.by_branch ?? {}) as Record<string, number>,
    byModel: (raw.by_model ?? {}) as Record<string, number>,
  };

  kpiCache.set(cacheKey, summary);
  return { data: summary, error: null };
}

function mapDashboardIssue(row: Record<string, unknown>): DataQualityIssue {
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

function mapDashboardKpiSummary(row: Record<string, unknown>): KpiSummary {
  return {
    kpiId: String(row.kpi_id || ''),
    label: String(row.label || ''),
    shortLabel: String(row.short_label || ''),
    validCount: Number(row.valid_count ?? 0),
    invalidCount: Number(row.invalid_count ?? 0),
    missingCount: Number(row.missing_count ?? 0),
    median: Number(row.median ?? 0),
    average: Number(row.average ?? 0),
    p90: Number(row.p90 ?? 0),
    overdueCount: Number(row.overdue_count ?? 0),
    slaDays: Number(row.sla_days ?? 0),
  };
}

export async function getAutoAgingDashboardSummary(
  params: AutoAgingDashboardSummaryParams = {},
): Promise<{ data: AutoAgingDashboardSummary | null; error: Error | null }> {
  const queryId = `auto-aging-dashboard-summary-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const cacheKey = JSON.stringify(params);
  const cached = dashboardSummaryCache.get(cacheKey);
  if (cached) {
    performanceService.endQueryTimer(queryId, 'auto_aging_dashboard_summary_cached');
    return { data: cached, error: null };
  }

  const { data, error } = await supabase.rpc('auto_aging_dashboard_summary', {
    p_branch: params.branch ?? undefined,
    p_model: params.model ?? undefined,
    p_from: params.bgDateFrom ?? undefined,
    p_to: params.bgDateTo ?? undefined,
  });

  performanceService.endQueryTimer(queryId, 'auto_aging_dashboard_summary');

  if (error) {
    loggingService.error('auto_aging_dashboard_summary RPC failed', { params, error }, 'VehicleService');
    return { data: null, error: new Error(error.message) };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const summary: AutoAgingDashboardSummary = {
    availableBranches: Array.isArray(raw.available_branches)
      ? raw.available_branches.map(String).filter(Boolean)
      : [],
    availableModels: Array.isArray(raw.available_models)
      ? raw.available_models.map(String).filter(Boolean)
      : [],
    kpiSummaries: Array.isArray(raw.kpi_summaries)
      ? raw.kpi_summaries.map(item => mapDashboardKpiSummary(item as Record<string, unknown>))
      : [],
    qualityIssueCount: Number(raw.quality_issue_count ?? 0),
    qualityIssueSample: Array.isArray(raw.quality_issue_sample)
      ? raw.quality_issue_sample.map(item => mapDashboardIssue(item as Record<string, unknown>))
      : [],
  };

  dashboardSummaryCache.set(cacheKey, summary);
  return { data: summary, error: null };
}
