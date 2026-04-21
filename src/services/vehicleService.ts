import { supabase } from "@/integrations/supabase/client";
import type { VehicleCanonical } from "@/types";
import { logVehicleEdit } from "./auditService";
import { performanceService } from "./performanceService";
import { loggingService } from "./loggingService";
import { LruCache } from "@/lib/lruCache";

export async function getVehicleById(id: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  const queryId = `vehicle-get-${id}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_id");

  if (error) {
    loggingService.error("Failed to get vehicle", { id, error }, "VehicleService");
  }

  return { data, error: error || null };
}

export async function getVehicleByChassis(chassisNo: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  const queryId = `vehicle-chassis-${chassisNo}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("chassis_no", chassisNo)
    .maybeSingle();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_chassis");

  if (error) {
    loggingService.error("Failed to get vehicle by chassis", { chassisNo, error }, "VehicleService");
  }

  return { data, error: error || null };
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

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

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

  return { data, error: error || null, count };
}

export async function updateVehicleWithAudit(
  id: string,
  updates: Partial<Record<string, unknown>>,
  userId: string,
): Promise<{ data: VehicleCanonical | null; error: Error | null }> {
  const { data: before } = await getVehicleById(id);
  const { data, error } = await supabase.from('vehicles').update(updates).eq('id', id).select().single();
  if (error) return { data: null, error: new Error(error.message) };
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    changes[key] = { before: (before as Record<string, unknown> | null)?.[key], after: updates[key] };
  }
  await logVehicleEdit(userId, id, changes);
  return { data: data as VehicleCanonical, error: null };
}

/**
 * Bulk update a set of vehicles by id. Audit logging is the caller's
 * responsibility because bulk actions typically need per-row before/after
 * diffs that the service cannot reconstruct generically.
 */
export async function bulkUpdateVehicles(
  ids: string[],
  updates: Partial<Record<string, unknown>>,
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null };
  const { error } = await supabase.from('vehicles').update(updates).in('id', ids);
  if (error) {
    loggingService.error('Bulk vehicle update failed', { count: ids.length, error }, 'VehicleService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/**
 * Soft-delete a set of vehicles. Uses the is_deleted/deleted_at soft-delete
 * columns and returns after the DB round-trip so callers can log audit rows.
 */
export async function softDeleteVehicles(
  ids: string[],
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null };
  const { error } = await supabase
    .from('vehicles')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .in('id', ids);
  if (error) {
    loggingService.error('Soft-delete vehicles failed', { count: ids.length, error }, 'VehicleService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/**
 * Insert a new vehicle row. Used by purchasing flows where a goods-receipt
 * creates a vehicle record at invoice time.
 */
export async function insertVehicle(
  row: Record<string, unknown>,
): Promise<{ data: VehicleCanonical | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert(row)
    .select()
    .single();
  if (error) {
    loggingService.error('Vehicle insert failed', { error }, 'VehicleService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: data as VehicleCanonical, error: null };
}

// ---------------------------------------------------------------------------
// Phase 2 #17: server-side paginated search + KPI summary
// ---------------------------------------------------------------------------

export interface VehicleSearchParams {
  branch?: string | null;
  model?: string | null;
  search?: string | null;
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

// LRU caches for hot RPCs. Keyed on the serialized args; 30 s TTL keeps
// transient toggles fast without masking fresh mutations for long.
const searchCache = new LruCache<string, VehicleSearchResult>({ max: 64, ttlMs: 30_000 });
const kpiCache = new LruCache<string, VehicleKpiSummary>({ max: 16, ttlMs: 30_000 });

/** Clear the paginated search + KPI caches. Call after vehicle mutations. */
export function invalidateVehicleCaches(): void {
  searchCache.clear();
  kpiCache.clear();
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
    p_branch: params.branch ?? null,
    p_model: params.model ?? null,
    p_search: params.search ?? null,
    p_has_delivery_date: params.hasDeliveryDate ?? null,
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
    rows: (row?.rows ?? []) as VehicleCanonical[],
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
    p_branch: branch ?? null,
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