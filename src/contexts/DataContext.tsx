import React, { createContext, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { VehicleCanonical, ImportBatch, DataQualityIssue, SlaPolicy, KpiSummary } from '@/types';
import { computeKpiSummaries } from '@/utils/kpi-computation';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { loggingService } from '@/services/loggingService';
import { performanceService } from '@/services/performanceService';
import { resolveBranchCode } from '@/services/branchService';
import { useToast } from '@/hooks/use-toast';

interface DataContextType {
  vehicles: VehicleCanonical[];
  importBatches: ImportBatch[];
  qualityIssues: DataQualityIssue[];
  slas: SlaPolicy[];
  kpiSummaries: KpiSummary[];
  loadErrors: string[];
  lastRefresh: string;
  loading: boolean;
  setVehicles: (v: VehicleCanonical[]) => void;
  addImportBatch: (b: ImportBatch) => void;
  updateImportBatch: (id: string, updates: Partial<ImportBatch>) => void;
  addQualityIssues: (issues: DataQualityIssue[]) => void;
  updateSla: (id: string, slaDays: number) => void;
  refreshKpis: () => void;
  reloadFromDb: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

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

export const dataQueryKey = (companyId: string, branchId?: string | null) =>
  ['data', companyId, branchId ?? 'all'] as const;

/** Fetch all vehicles in chunks of VEHICLE_PAGE_SIZE to avoid unbounded queries. */
const VEHICLE_PAGE_SIZE = 1_000;

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

async function recoverSessionForDataLoad(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) {
      loggingService.warn('Session refresh failed after data load auth error', { error }, 'DataContext');
      return false;
    }

    loggingService.info('Session refreshed after data load auth error', { userId: data.session.user.id }, 'DataContext');
    return true;
  } catch (error) {
    loggingService.warn('Unexpected session refresh error after data load auth error', { error }, 'DataContext');
    return false;
  }
}

async function fetchAllVehicles(
  companyId: string,
  branchCode?: string | null
): Promise<{ data: VehicleCanonical[]; error: unknown | null }> {
  const results: VehicleCanonical[] = [];
  const seenRowIds = new Set<string>();
  let from = 0;
  while (true) {
    let q = supabase
      .from('vehicles')
      .select('*')
      .eq('is_deleted', false)
      .eq('company_id', companyId);
    if (branchCode) q = q.eq('branch_code', branchCode);
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + VEHICLE_PAGE_SIZE - 1);
    if (error) {
      loggingService.error('Failed to load vehicles page', { error, from }, 'DataContext');
      return { data: results, error };
    }

    let duplicateCount = 0;
    const rows = (data ?? []).map(r => mapDbVehicle(r as unknown as Record<string, unknown>));
    for (const row of rows) {
      if (!row.id || seenRowIds.has(row.id)) {
        duplicateCount += 1;
        continue;
      }
      seenRowIds.add(row.id);
      results.push(row);
    }

    if (duplicateCount > 0) {
      loggingService.warn('Skipped duplicate vehicle rows while paging', { duplicateCount, from }, 'DataContext');
    }

    if ((data ?? []).length < VEHICLE_PAGE_SIZE) break;
    from += VEHICLE_PAGE_SIZE;
  }
  return { data: results, error: null };
}

async function fetchDataFromDb(companyId: string, branchCode?: string | null) {
  const queryId = `data-reload-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const [vehiclesRes, batchesRes, issuesRes, slasRes] = await Promise.all([
    fetchAllVehicles(companyId, branchCode),
    supabase.from('import_batches').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('quality_issues').select('*').order('created_at', { ascending: false }),
    supabase.from('sla_policies').select('*').eq('company_id', companyId),
  ]);

  if (vehiclesRes.error) loggingService.error('Failed to load vehicles', { error: vehiclesRes.error }, 'DataContext');
  if (batchesRes.error) loggingService.error('Failed to load import batches', { error: batchesRes.error }, 'DataContext');
  if (issuesRes.error) loggingService.error('Failed to load quality issues', { error: issuesRes.error }, 'DataContext');
  if (slasRes.error) loggingService.error('Failed to load SLA policies', { error: slasRes.error }, 'DataContext');

  const errors = [
    vehiclesRes.error && 'vehicles',
    batchesRes.error && 'import batches',
    issuesRes.error && 'quality issues',
    slasRes.error && 'SLA policies',
  ].filter((value): value is string => Boolean(value));

  const hasAuthError = [vehiclesRes.error, batchesRes.error, issuesRes.error, slasRes.error]
    .some(error => isAuthLikeError(error));

  const dbVehicles = vehiclesRes.data ?? [];
  const dbBatches  = (batchesRes.data  || []).map(r => mapDbBatch(r  as unknown as Record<string, unknown>));
  const dbIssues   = (issuesRes.data   || []).map(r => mapDbIssue(r  as unknown as Record<string, unknown>));
  const dbSlas     = (slasRes.data     || []).map(r => mapDbSla(r    as unknown as Record<string, unknown>));

  performanceService.endQueryTimer(queryId, 'data_reload');
  if (errors.length > 0) {
    loggingService.warn('Data reloaded with errors',
      { errors, vehicles: dbVehicles.length, batches: dbBatches.length, issues: dbIssues.length, slas: dbSlas.length },
      'DataContext'
    );
  } else {
    loggingService.info('Data reloaded successfully',
      { vehicles: dbVehicles.length, batches: dbBatches.length, issues: dbIssues.length, slas: dbSlas.length },
      'DataContext'
    );
  }

  return { vehicles: dbVehicles, batches: dbBatches, issues: dbIssues, slas: dbSlas, errors, hasAuthError };
}

type DataQueryResult = Awaited<ReturnType<typeof fetchDataFromDb>>;
const emptyData: DataQueryResult = { vehicles: [], batches: [], issues: [], slas: [], errors: [], hasAuthError: false };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Branch-scoped users only see their branch's vehicles.
  const branchId = user?.access_scope === 'branch' ? (user.branch_id ?? null) : null;

  // React Query is the single source of truth — no local useState mirrors.
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: dataQueryKey(companyId, branchId),
    queryFn: async () => {
      const loadOnce = async () => {
        let branchCode: string | null = null;
        if (branchId) {
          branchCode = await resolveBranchCode(branchId);
        }
        return fetchDataFromDb(companyId, branchCode);
      };

      let result = await loadOnce();
      if (result.hasAuthError) {
        const recovered = await recoverSessionForDataLoad();
        if (recovered) {
          result = await loadOnce();
        }
      }

      return result;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Derive all context values directly from query data.
  const vehicles = data?.vehicles ?? [];
  const importBatches = data?.batches ?? [];
  const qualityIssues = data?.issues ?? [];
  const slas = data?.slas ?? [];
  const loadErrors = data?.errors ?? [];
  const kpiSummaries = useMemo(() => computeKpiSummaries(vehicles, slas), [vehicles, slas]);
  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : new Date().toISOString();

  // Surface fetch errors to users via toast (only once per fetch).
  const lastErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const errors = data?.errors ?? [];
    if (errors.length > 0) {
      const key = errors.join(',');
      if (lastErrorRef.current !== key) {
        lastErrorRef.current = key;
        toast({ title: `Failed to load: ${errors.join(', ')}`, variant: 'destructive' });
      }
    } else {
      lastErrorRef.current = null;
    }
  }, [data?.errors, toast]);

  const reloadFromDb = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: dataQueryKey(companyId, branchId) });
  }, [queryClient, companyId, branchId]);

  // Realtime: invalidate whenever a vehicle row changes in this company.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`realtime:vehicles:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles', filter: `company_id=eq.${companyId}` },
        () => { queryClient.invalidateQueries({ queryKey: dataQueryKey(companyId, branchId) }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, branchId, queryClient]);

  const setVehicles = useCallback(async (v: VehicleCanonical[]) => {
    const queryId = `vehicles-upsert-${Date.now()}`;
    performanceService.startQueryTimer(queryId);

    try {
      const dbRows = v.map(vehicle => ({
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
        is_d2d: vehicle.is_d2d,
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
      }));

      for (let i = 0; i < dbRows.length; i += 500) {
        const chunk = dbRows.slice(i, i + 500);
        const { error } = await supabase
          .from('vehicles')
          .upsert(chunk, { onConflict: 'chassis_no,company_id' });
        if (error) {
          loggingService.error('Vehicle upsert error', { error, chunkIndex: i }, 'DataContext');
        }
      }

      performanceService.endQueryTimer(queryId, 'vehicles_upsert');
      await reloadFromDb();
    } catch (err) {
      performanceService.endQueryTimer(queryId, 'vehicles_upsert');
      loggingService.error('Unexpected error upserting vehicles', { error: err }, 'DataContext');
    }
  }, [reloadFromDb, companyId]);

  const addImportBatch = useCallback(async (b: ImportBatch) => {
    try {
      const { error } = await supabase.from('import_batches').insert({
        file_name: b.fileName,
        uploaded_by: b.uploadedBy,
        uploaded_at: b.uploadedAt,
        status: b.status,
        total_rows: b.totalRows,
        valid_rows: b.validRows,
        error_rows: b.errorRows,
        duplicate_rows: b.duplicateRows,
        company_id: companyId,
      });
      
      if (error) {
        loggingService.error('Import batch insert error', { error, batch: b }, 'DataContext');
      } else {
        queryClient.setQueryData<DataQueryResult>(dataQueryKey(companyId, branchId), prev => {
          const base = prev ?? emptyData;
          return { ...base, batches: [b, ...base.batches] };
        });
        loggingService.info('Import batch added', { batchId: b.id }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error adding import batch', { error: err }, 'DataContext');
    }
  }, [companyId, queryClient, branchId]);

  const updateImportBatch = useCallback(async (id: string, updates: Partial<ImportBatch>) => {
    try {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.publishedAt) dbUpdates.published_at = updates.publishedAt;
      if (updates.totalRows !== undefined) dbUpdates.total_rows = updates.totalRows;
      if (updates.validRows !== undefined) dbUpdates.valid_rows = updates.validRows;
      if (updates.errorRows !== undefined) dbUpdates.error_rows = updates.errorRows;

      const { error } = await supabase.from('import_batches').update(dbUpdates).eq('id', id);
      
      if (error) {
        loggingService.error('Import batch update error', { error, id, updates }, 'DataContext');
      } else {
        queryClient.setQueryData<DataQueryResult>(dataQueryKey(companyId, branchId), prev => {
          const base = prev ?? emptyData;
          return { ...base, batches: base.batches.map(b => b.id === id ? { ...b, ...updates } : b) };
        });
        loggingService.info('Import batch updated', { batchId: id }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error updating import batch', { error: err }, 'DataContext');
    }
  }, [queryClient, companyId, branchId]);

  const addQualityIssues = useCallback(async (issues: DataQualityIssue[]) => {
    if (issues.length === 0) return;

    try {
      const dbIssues = issues.map(i => ({
        chassis_no: i.chassisNo,
        field: i.field,
        issue_type: i.issueType,
        message: i.message,
        severity: i.severity,
        import_batch_id: null,
        company_id: companyId,
      }));

      for (let idx = 0; idx < dbIssues.length; idx += 500) {
        const chunk = dbIssues.slice(idx, idx + 500);
        const { error } = await supabase.from('quality_issues').insert(chunk);
        if (error) {
          loggingService.error('Quality issues insert error', { error, chunkIndex: idx }, 'DataContext');
        }
      }

      queryClient.setQueryData<DataQueryResult>(dataQueryKey(companyId, branchId), prev => {
        const base = prev ?? emptyData;
        return { ...base, issues: [...issues, ...base.issues] };
      });
      loggingService.info('Quality issues added', { count: issues.length }, 'DataContext');
    } catch (err) {
      loggingService.error('Unexpected error adding quality issues', { error: err }, 'DataContext');
    }
  }, [companyId, queryClient, branchId]);

  const updateSla = useCallback(async (id: string, slaDays: number) => {
    try {
      const { error } = await supabase.from('sla_policies').update({ sla_days: slaDays }).eq('id', id);
      
      if (error) {
        loggingService.error('SLA update error', { error, id, slaDays }, 'DataContext');
      } else {
        queryClient.setQueryData<DataQueryResult>(dataQueryKey(companyId, branchId), prev => {
          const base = prev ?? emptyData;
          return { ...base, slas: base.slas.map(s => s.id === id ? { ...s, slaDays } : s) };
        });
        loggingService.info('SLA updated', { slaId: id, slaDays }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error updating SLA', { error: err }, 'DataContext');
    }
  }, [queryClient, companyId, branchId]);

  const refreshKpis = useCallback(() => {
    // KPIs are auto-derived via useMemo; this function triggers a cache touch
    // to notify consumers. In practice, reloadFromDb is preferred.
    queryClient.invalidateQueries({ queryKey: dataQueryKey(companyId, branchId) });
    loggingService.info('KPIs refresh requested', { vehicleCount: vehicles.length }, 'DataContext');
  }, [queryClient, companyId, branchId, vehicles.length]);

  return (
    <DataContext.Provider value={{ vehicles, importBatches, qualityIssues, slas, kpiSummaries, loadErrors, lastRefresh, loading: isLoading, setVehicles, addImportBatch, updateImportBatch, addQualityIssues, updateSla, refreshKpis, reloadFromDb }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
