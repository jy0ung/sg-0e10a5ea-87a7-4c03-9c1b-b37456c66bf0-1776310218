/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { VehicleCanonical, ImportBatch, DataQualityIssue, SlaPolicy, KpiSummary } from '@/types';
import { computeKpiSummaries } from '@/utils/kpi-computation';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { loggingService } from '@flc/platform-services';
import { resolveBranchCode } from '@/services/branchService';
import { useToast } from '@/hooks/use-toast';
import {
  fetchAutoAgingImportBatches,
  fetchAutoAgingQualityIssues,
  fetchAutoAgingSlaPolicies,
  fetchAutoAgingSummary,
  fetchAutoAgingVehicles,
  insertAutoAgingQualityIssues,
  subscribeToAutoAgingVehicleChanges,
  updateAutoAgingImportBatch,
  updateAutoAgingSlaPolicy,
  upsertAutoAgingImportBatch,
  upsertAutoAgingVehicles,
} from '@/services/autoAgingDataService';

interface DataContextType {
  vehicles: VehicleCanonical[];
  importBatches: ImportBatch[];
  qualityIssues: DataQualityIssue[];
  slas: SlaPolicy[];
  kpiSummaries: KpiSummary[];
  availableBranches: string[];
  availableModels: string[];
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

export const dataQueryKey = (companyId: string, branchId?: string | null) =>
  ['data', companyId, branchId ?? 'all'] as const;
export const dataVehiclesKey = (companyId: string, branchCode?: string | null) =>
  ['data', 'vehicles', companyId, branchCode ?? 'all'] as const;
export const dataSummaryKey = (companyId: string, branchCode?: string | null) =>
  ['data', 'summary', companyId, branchCode ?? 'all'] as const;
export const dataBatchesKey = (companyId: string) => ['data', 'batches', companyId] as const;
export const dataIssuesKey = (companyId: string) => ['data', 'issues', companyId] as const;
export const dataSlasKey = (companyId: string) => ['data', 'slas', companyId] as const;

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

async function withAuthRecovery<T extends { hasAuthError: boolean }>(loader: () => Promise<T>): Promise<T> {
  let result = await loader();
  if (result.hasAuthError && await recoverSessionForDataLoad()) {
    result = await loader();
  }
  return result;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const branchId = user?.access_scope === 'branch' ? (user.branch_id ?? null) : null;

  const { data: branchCode } = useQuery({
    queryKey: ['data', 'branch-code', branchId],
    queryFn: () => resolveBranchCode(branchId!),
    enabled: !!branchId,
    staleTime: 5 * 60_000,
  });

  const canLoadScopedData = !!companyId && (!branchId || branchCode !== undefined);

  // Split queries: no single DataContext mount should block on all datasets.
  const vehiclesQuery = useQuery({
    queryKey: dataVehiclesKey(companyId, branchCode),
    queryFn: async () => withAuthRecovery(() => fetchAutoAgingVehicles(companyId, branchCode)),
    enabled: false, // full vehicle hydration is deprecated; pages use searchVehicles/getVehicleByChassis directly.
    staleTime: 60_000,
  });

  const summaryQuery = useQuery({
    queryKey: dataSummaryKey(companyId, branchCode),
    queryFn: async () => withAuthRecovery(() => fetchAutoAgingSummary(branchCode)),
    enabled: canLoadScopedData,
    staleTime: 60_000,
  });

  const batchesQuery = useQuery({
    queryKey: dataBatchesKey(companyId),
    queryFn: async () => withAuthRecovery(() => fetchAutoAgingImportBatches(companyId)),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const issuesQuery = useQuery({
    queryKey: dataIssuesKey(companyId),
    queryFn: async () => withAuthRecovery(() => fetchAutoAgingQualityIssues(companyId)),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const slasQuery = useQuery({
    queryKey: dataSlasKey(companyId),
    queryFn: async () => withAuthRecovery(() => fetchAutoAgingSlaPolicies(companyId)),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  const vehicles = useMemo(() => vehiclesQuery.data?.data ?? [], [vehiclesQuery.data]);
  const importBatches = useMemo(() => batchesQuery.data?.data ?? [], [batchesQuery.data]);
  const qualityIssues = useMemo(() => issuesQuery.data?.data ?? [], [issuesQuery.data]);
  const slas = useMemo(() => slasQuery.data?.data ?? [], [slasQuery.data]);
  const kpiSummaries = useMemo(
    () => summaryQuery.data?.kpiSummaries ?? computeKpiSummaries(vehicles, slas),
    [summaryQuery.data?.kpiSummaries, vehicles, slas],
  );
  const availableBranches = useMemo(() => summaryQuery.data?.availableBranches ?? [], [summaryQuery.data]);
  const availableModels = useMemo(() => summaryQuery.data?.availableModels ?? [], [summaryQuery.data]);
  const loadErrors = useMemo(() => {
    const errors = [
      ...(summaryQuery.data?.errors ?? []),
      batchesQuery.data?.error && 'import batches',
      issuesQuery.data?.error && 'quality issues',
      slasQuery.data?.error && 'SLA policies',
    ].filter((value): value is string => Boolean(value));
    return [...new Set(errors)];
  }, [summaryQuery.data?.errors, batchesQuery.data?.error, issuesQuery.data?.error, slasQuery.data?.error]);
  const lastRefreshMs = Math.max(
    summaryQuery.dataUpdatedAt,
    batchesQuery.dataUpdatedAt,
    issuesQuery.dataUpdatedAt,
    slasQuery.dataUpdatedAt,
    vehiclesQuery.dataUpdatedAt,
  );
  const lastRefresh = lastRefreshMs ? new Date(lastRefreshMs).toISOString() : new Date().toISOString();
  const loading = summaryQuery.isLoading || batchesQuery.isLoading || issuesQuery.isLoading || slasQuery.isLoading;

  const lastErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadErrors.length > 0) {
      const key = loadErrors.join(',');
      if (lastErrorRef.current !== key) {
        lastErrorRef.current = key;
        toast({ title: `Failed to load: ${loadErrors.join(', ')}`, variant: 'destructive' });
      }
    } else {
      lastErrorRef.current = null;
    }
  }, [loadErrors, toast]);

  const reloadFromDb = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['data'] });
  }, [queryClient]);

  useEffect(() => {
    if (!companyId) return;
    return subscribeToAutoAgingVehicleChanges(companyId, () => {
      queryClient.invalidateQueries({ queryKey: dataSummaryKey(companyId, branchCode) });
      queryClient.invalidateQueries({ queryKey: dataVehiclesKey(companyId, branchCode) });
    });
  }, [companyId, branchCode, queryClient]);

  const setVehicles = useCallback(async (v: VehicleCanonical[]) => {
    try {
      await upsertAutoAgingVehicles(companyId, v);
      loggingService.info('Vehicles upsert completed', { count: v.length }, 'DataContext');
      await reloadFromDb();
    } catch (error) {
      loggingService.error('Bulk upsert failed', { error }, 'DataContext');
    }
  }, [companyId, reloadFromDb]);

  const addImportBatch = useCallback(async (b: ImportBatch) => {
    try {
      const { error } = await upsertAutoAgingImportBatch(companyId, b);
      if (error) {
        loggingService.error('Import batch insert error', { error, batch: b }, 'DataContext');
      } else {
        queryClient.setQueryData<{ data: ImportBatch[]; error: unknown | null; hasAuthError: boolean }>(dataBatchesKey(companyId), prev => ({
          data: [b, ...(prev?.data ?? []).filter(existingBatch => existingBatch.id !== b.id)],
          error: prev?.error ?? null,
          hasAuthError: prev?.hasAuthError ?? false,
        }));
        loggingService.info('Import batch added', { batchId: b.id }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error adding import batch', { error: err }, 'DataContext');
    }
  }, [companyId, queryClient]);

  const updateImportBatch = useCallback(async (id: string, updates: Partial<ImportBatch>) => {
    try {
      const { error } = await updateAutoAgingImportBatch(companyId, id, updates);
      if (error) {
        loggingService.error('Import batch update error', { error, id, updates }, 'DataContext');
      } else {
        queryClient.setQueryData<{ data: ImportBatch[]; error: unknown | null; hasAuthError: boolean }>(dataBatchesKey(companyId), prev => ({
          data: (prev?.data ?? []).map(b => b.id === id ? { ...b, ...updates } : b),
          error: prev?.error ?? null,
          hasAuthError: prev?.hasAuthError ?? false,
        }));
        loggingService.info('Import batch updated', { batchId: id }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error updating import batch', { error: err }, 'DataContext');
    }
  }, [queryClient, companyId]);

  const addQualityIssues = useCallback(async (issues: DataQualityIssue[]) => {
    if (issues.length === 0) return;

    try {
      await insertAutoAgingQualityIssues(companyId, issues);
      queryClient.setQueryData<{ data: DataQualityIssue[]; error: unknown | null; hasAuthError: boolean }>(dataIssuesKey(companyId), prev => ({
        data: [...issues, ...(prev?.data ?? [])],
        error: prev?.error ?? null,
        hasAuthError: prev?.hasAuthError ?? false,
      }));
      loggingService.info('Quality issues added', { count: issues.length }, 'DataContext');
    } catch (err) {
      loggingService.error('Unexpected error adding quality issues', { error: err }, 'DataContext');
    }
  }, [companyId, queryClient]);

  const updateSla = useCallback(async (id: string, slaDays: number) => {
    try {
      const { error } = await updateAutoAgingSlaPolicy(companyId, id, slaDays);
      if (error) {
        loggingService.error('SLA update error', { error, id, slaDays }, 'DataContext');
      } else {
        queryClient.setQueryData<{ data: SlaPolicy[]; error: unknown | null; hasAuthError: boolean }>(dataSlasKey(companyId), prev => ({
          data: (prev?.data ?? []).map(s => s.id === id ? { ...s, slaDays } : s),
          error: prev?.error ?? null,
          hasAuthError: prev?.hasAuthError ?? false,
        }));
        loggingService.info('SLA updated', { slaId: id, slaDays }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error updating SLA', { error: err }, 'DataContext');
    }
  }, [queryClient, companyId]);

  const refreshKpis = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: dataSummaryKey(companyId, branchCode) });
    loggingService.info('KPIs refresh requested', { vehicleCount: vehicles.length }, 'DataContext');
  }, [queryClient, companyId, branchCode, vehicles.length]);

  const contextValue = useMemo(
    () => ({
      vehicles,
      importBatches,
      qualityIssues,
      slas,
      kpiSummaries,
      availableBranches,
      availableModels,
      loadErrors,
      lastRefresh,
      loading,
      setVehicles,
      addImportBatch,
      updateImportBatch,
      addQualityIssues,
      updateSla,
      refreshKpis,
      reloadFromDb,
    }),
    [
      vehicles,
      importBatches,
      qualityIssues,
      slas,
      kpiSummaries,
      availableBranches,
      availableModels,
      loadErrors,
      lastRefresh,
      loading,
      setVehicles,
      addImportBatch,
      updateImportBatch,
      addQualityIssues,
      updateSla,
      refreshKpis,
      reloadFromDb,
    ],
  );

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
