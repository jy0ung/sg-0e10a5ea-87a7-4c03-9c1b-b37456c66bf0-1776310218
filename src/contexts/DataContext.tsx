/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { VehicleCanonical, ImportBatch, DataQualityIssue, SlaPolicy, KpiSummary } from '@/types';
import { computeKpiSummaries } from '@/utils/kpi-computation';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { loggingService } from '@/services/loggingService';
import { resolveBranchCode } from '@/services/branchService';
import { useToast } from '@/hooks/use-toast';
import {
  fetchAutoAgingContextData,
  insertAutoAgingQualityIssues,
  subscribeToAutoAgingVehicleChanges,
  updateAutoAgingImportBatch,
  updateAutoAgingSlaPolicy,
  upsertAutoAgingImportBatch,
  upsertAutoAgingVehicles,
  type AutoAgingContextData,
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

type DataLoadMode = 'full' | 'summary-only';

/**
 * All routes now use summary-only mode — no full vehicle hydration.
 * Pages that need vehicle rows use direct service calls (searchVehicles,
 * getVehicleByChassis) instead of reading from DataContext.
 */
function getDataLoadMode(_pathname: string): DataLoadMode {
  return 'summary-only';
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

type DataQueryResult = AutoAgingContextData;
const emptyData: DataQueryResult = { vehicles: [], kpiSummaries: undefined, availableBranches: undefined, availableModels: undefined, batches: [], issues: [], slas: [], errors: [], hasAuthError: false };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Branch-scoped users only see their branch's vehicles.
  const branchId = user?.access_scope === 'branch' ? (user.branch_id ?? null) : null;
  const routeLoadMode = getDataLoadMode(location.pathname);
  const activeDataQueryKey = useMemo(
    () => [...dataQueryKey(companyId, branchId), routeLoadMode] as const,
    [companyId, branchId, routeLoadMode],
  );

  // React Query is the single source of truth — no local useState mirrors.
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: activeDataQueryKey,
    queryFn: async () => {
      const loadOnce = async () => {
        let branchCode: string | null = null;
        if (branchId) {
          branchCode = await resolveBranchCode(branchId);
        }
        return fetchAutoAgingContextData(companyId, branchCode, routeLoadMode);
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

  // Derive all context values directly from query data (wrapped in useMemo to
  // avoid new array references on every render when the underlying data is stable).
  const vehicles = useMemo(() => data?.vehicles ?? [], [data]);
  const importBatches = useMemo(() => data?.batches ?? [], [data]);
  const qualityIssues = useMemo(() => data?.issues ?? [], [data]);
  const slas = useMemo(() => data?.slas ?? [], [data]);
  const loadErrors = useMemo(() => data?.errors ?? [], [data]);
  const dbKpiSummaries = data?.kpiSummaries;
  const kpiSummaries = useMemo(() => dbKpiSummaries ?? computeKpiSummaries(vehicles, slas), [dbKpiSummaries, vehicles, slas]);
  const availableBranches = useMemo(() => data?.availableBranches ?? [], [data]);
  const availableModels = useMemo(() => data?.availableModels ?? [], [data]);
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

  useEffect(() => {
    if (!companyId) return;
    return subscribeToAutoAgingVehicleChanges(companyId, () => {
      queryClient.invalidateQueries({ queryKey: dataQueryKey(companyId, branchId) });
    });
  }, [companyId, branchId, queryClient]);

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
        queryClient.setQueryData<DataQueryResult>(activeDataQueryKey, prev => {
          const base = prev ?? emptyData;
          const remainingBatches = base.batches.filter(existingBatch => existingBatch.id !== b.id);
          return { ...base, batches: [b, ...remainingBatches] };
        });
        loggingService.info('Import batch added', { batchId: b.id }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error adding import batch', { error: err }, 'DataContext');
    }
  }, [companyId, queryClient, activeDataQueryKey]);

  const updateImportBatch = useCallback(async (id: string, updates: Partial<ImportBatch>) => {
    try {
      const { error } = await updateAutoAgingImportBatch(companyId, id, updates);
      if (error) {
        loggingService.error('Import batch update error', { error, id, updates }, 'DataContext');
      } else {
        queryClient.setQueryData<DataQueryResult>(activeDataQueryKey, prev => {
          const base = prev ?? emptyData;
          return { ...base, batches: base.batches.map(b => b.id === id ? { ...b, ...updates } : b) };
        });
        loggingService.info('Import batch updated', { batchId: id }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error updating import batch', { error: err }, 'DataContext');
    }
  }, [queryClient, companyId, activeDataQueryKey]);

  const addQualityIssues = useCallback(async (issues: DataQualityIssue[]) => {
    if (issues.length === 0) return;

    try {
      await insertAutoAgingQualityIssues(companyId, issues);
      queryClient.setQueryData<DataQueryResult>(activeDataQueryKey, prev => {
        const base = prev ?? emptyData;
        return { ...base, issues: [...issues, ...base.issues] };
      });
      loggingService.info('Quality issues added', { count: issues.length }, 'DataContext');
    } catch (err) {
      loggingService.error('Unexpected error adding quality issues', { error: err }, 'DataContext');
    }
  }, [companyId, queryClient, activeDataQueryKey]);

  const updateSla = useCallback(async (id: string, slaDays: number) => {
    try {
      const { error } = await updateAutoAgingSlaPolicy(companyId, id, slaDays);
      if (error) {
        loggingService.error('SLA update error', { error, id, slaDays }, 'DataContext');
      } else {
        queryClient.setQueryData<DataQueryResult>(activeDataQueryKey, prev => {
          const base = prev ?? emptyData;
          return { ...base, slas: base.slas.map(s => s.id === id ? { ...s, slaDays } : s) };
        });
        loggingService.info('SLA updated', { slaId: id, slaDays }, 'DataContext');
      }
    } catch (err) {
      loggingService.error('Unexpected error updating SLA', { error: err }, 'DataContext');
    }
  }, [queryClient, companyId, activeDataQueryKey]);

  const refreshKpis = useCallback(() => {
    // KPIs are auto-derived via useMemo; this function triggers a cache touch
    // to notify consumers. In practice, reloadFromDb is preferred.
    queryClient.invalidateQueries({ queryKey: dataQueryKey(companyId, branchId) });
    loggingService.info('KPIs refresh requested', { vehicleCount: vehicles.length }, 'DataContext');
  }, [queryClient, companyId, branchId, vehicles.length]);

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
      loading: isLoading,
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
      isLoading,
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
