import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ExcelTable } from '@/components/shared/ExcelTable';
import { VehicleDetailPanel } from '@/components/vehicles/VehicleDetailPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Download, Edit, Eye, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { updateVehicleWithAudit, invalidateVehicleCaches, searchVehicles } from '@/services/vehicleService';
import { getUserPermissions } from '@/services/permissionService';
import type { VehicleCanonical } from '@/types';
import { loggingService } from '@/services/loggingService';
import { VehicleBulkActions } from './VehicleBulkActions';
import { VehicleExplorerFilters, type VehicleFilterState } from './VehicleExplorerFilters';
import { useVehicleExplorerColumns, type VehicleRow } from './useVehicleExplorerColumns';
import { deriveVehicleStage } from '@/utils/vehicleStage';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

type UserPermissions = Awaited<ReturnType<typeof getUserPermissions>>;

const DEFAULT_FILTERS: VehicleFilterState = {
  search: '',
  branch: 'all',
  model: 'all',
  payment: 'all',
  stage: 'all',
  pageSize: 50,
};

function getRowValue(row: VehicleRow, key: string): unknown {
  return (row as unknown as Record<string, unknown>)[key];
}

function filterVehicles(vehicles: VehicleCanonical[], filters: VehicleFilterState): VehicleCanonical[] {
  const { search, branch, model, payment, stage } = filters;
  const needle = search.toLowerCase();
  return vehicles.filter((v) => {
    if (
      needle &&
      !v.chassis_no.toLowerCase().includes(needle) &&
      !v.customer_name.toLowerCase().includes(needle) &&
      !v.invoice_no?.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (branch !== 'all' && v.branch_code !== branch) return false;
    if (model !== 'all' && v.model !== model) return false;
    if (payment !== 'all') {
      const raw = (v.payment_method ?? '').trim();
      if (payment === 'Unspecified') {
        const isUnspec = !raw || raw.toLowerCase() === 'unknown' || raw === '-' || raw === '\u2014';
        if (!isUnspec) return false;
      } else if (raw.toUpperCase() !== payment.toUpperCase()) {
        return false;
      }
    }
    if (stage !== 'all') {
      const current = v.stage_override ?? v.stage ?? deriveVehicleStage(v);
      if (current !== stage) return false;
    }
    return true;
  });
}

function sortVehicles(rows: VehicleCanonical[], sortField: string, sortDir: 'asc' | 'desc'): VehicleCanonical[] {
  return [...rows].sort((a, b) => {
    const aVal = getRowValue(a as VehicleRow, sortField);
    const bVal = getRowValue(b as VehicleRow, sortField);

    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    return sortDir === 'desc'
      ? (bVal as number) - (aVal as number)
      : (aVal as number) - (bVal as number);
  });
}

function toServerValue(value: string): string | null {
  return value === 'all' ? null : value;
}

function normalizeServerSortField(sortField: string): string {
  return sortField === 'row_no' ? 'created_at' : sortField;
}

export default function VehicleExplorer() {
  const { user } = useAuth();
  const { vehicles, loading, loadErrors, reloadFromDb } = useData();
  const queryClient = useQueryClient();
  const { chassis_no: chassisParam } = useParams();
  const [searchParams] = useSearchParams();

  // Seed filters from the URL once on mount so drill-downs from the dashboard
  // (e.g. `?stage=complete`, `?payment=FLOOR STOCK`, `?branch=KK`) hydrate the
  // filter bar without an extra click. Read-once pattern — further user edits
  // go through setFilters and do not touch the URL.
  const initialFilters = useMemo<VehicleFilterState>(() => {
    const next = { ...DEFAULT_FILTERS };
    const s = searchParams.get('search');
    const b = searchParams.get('branch');
    const m = searchParams.get('model');
    const p = searchParams.get('payment');
    const st = searchParams.get('stage');
    if (s) next.search = s;
    if (b) next.branch = b;
    if (m) next.model = m;
    if (p) next.payment = p;
    if (st) next.stage = st;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filters, setFilters] = useState<VehicleFilterState>(initialFilters);
  const [sortField, setSortField] = useState<string>('chassis_no');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleCanonical | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState<UserPermissions>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(true);
  const [pendingBulkAction, setPendingBulkAction] = useState<{ action: string; vehicles: VehicleCanonical[] } | null>(null);
  const serverOffset = (page - 1) * filters.pageSize;

  const serverQuery = useQuery({
    queryKey: [
      'vehicle-explorer-search',
      user?.company_id,
      filters.search,
      filters.branch,
      filters.model,
      filters.payment,
      filters.stage,
      filters.pageSize,
      page,
      sortField,
      sortDir,
    ],
    queryFn: () => searchVehicles({
      branch: toServerValue(filters.branch),
      model: toServerValue(filters.model),
      payment: toServerValue(filters.payment),
      stage: toServerValue(filters.stage),
      search: filters.search.trim() || null,
      limit: filters.pageSize,
      offset: serverOffset,
      sortColumn: normalizeServerSortField(sortField),
      sortDirection: sortDir,
    }).then(result => {
      if (result.error) throw result.error;
      return result.data;
    }),
    enabled: !!user?.id && !!user.company_id,
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
  });

  const usingServerData = Boolean(serverQuery.data && !serverQuery.error);
  const optionRows = useMemo(
    () => (vehicles.length > 0 ? vehicles : serverQuery.data?.rows ?? []),
    [vehicles, serverQuery.data?.rows],
  );

  useEffect(() => {
    if (user?.id) {
      getUserPermissions(user.id).then(setUserPermissions);
    }
  }, [user?.id]);

  useEffect(() => {
    if (chassisParam) {
      const vehicle = vehicles.find((v) => v.chassis_no === chassisParam);
      if (vehicle) {
        setSelectedVehicle(vehicle);
        setDetailPanelOpen(true);
      }
    }
  }, [chassisParam, vehicles]);

  // Distinct values for filter dropdowns, derived from the full dataset so
  // users can still filter to any legal value regardless of the visible page.
  const branches = useMemo(
    () => [...new Set(optionRows.map((v) => v.branch_code))].sort(),
    [optionRows],
  );
  const models = useMemo(
    () => [...new Set(optionRows.map((v) => v.model))].sort(),
    [optionRows],
  );
  const payments = useMemo(
    () => [...new Set(optionRows.map((v) => v.payment_method))].sort(),
    [optionRows],
  );

  const fallbackFiltered = useMemo(
    () => (usingServerData ? [] : filterVehicles(vehicles, filters)),
    [usingServerData, vehicles, filters],
  );
  const fallbackSorted = useMemo(
    () => (usingServerData ? [] : sortVehicles(fallbackFiltered, sortField, sortDir)),
    [usingServerData, fallbackFiltered, sortField, sortDir],
  );
  const filteredCount = usingServerData ? serverQuery.data?.totalCount ?? 0 : fallbackFiltered.length;
  const totalVehicleCount = vehicles.length > 0 ? vehicles.length : filteredCount;
  const totalPages = Math.max(1, Math.ceil(filteredCount / filters.pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * filters.pageSize;
  const pageData = usingServerData
    ? serverQuery.data?.rows ?? []
    : fallbackSorted.slice(startIdx, startIdx + filters.pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.branch, filters.model, filters.payment, filters.stage, filters.pageSize]);

  const canEdit = (userPermissions?.canEdit || false) && !readOnlyMode;
  const allColumns = useVehicleExplorerColumns({
    canEdit: userPermissions?.canEdit || false,
    branches,
    models,
    payments,
    startIdx,
  });

  const permissions = useMemo<Record<string, 'view' | 'edit'>>(
    () =>
      userPermissions?.columns
        ? Object.fromEntries(
            Array.from(userPermissions.columns.entries()).filter(
              (entry): entry is [string, 'view' | 'edit'] => entry[1] === 'view' || entry[1] === 'edit',
            ),
          )
        : {},
    [userPermissions?.columns],
  );

  const filteredColumns = useMemo(
    () =>
      allColumns.filter((col) => {
        // Mirror canViewField() semantics from useColumnPermissions:
        //   - canEdit (super/company admin, director, manager, GM) → full access
        //   - empty columns map → implicit view-all (analyst default)
        //   - otherwise require explicit 'view' or 'edit' on this column
        if (userPermissions?.canEdit) return true;
        if (!userPermissions?.columns || userPermissions.columns.size === 0) return true;
        const perm = permissions[col.key];
        return perm === 'edit' || perm === 'view';
      }),
    [allColumns, permissions, userPermissions?.canEdit, userPermissions?.columns],
  );

  const handleCellEdit = async (
    rowId: string,
    columnKey: string,
    value: unknown,
  ) => {
    if (!user?.id || !user.company_id) return;
    const column = allColumns.find((candidate) => candidate.key === columnKey);
    if (!column) return;

    const updates = column.onSave ? column.onSave(rowId, value) : { [columnKey]: value };
    const result = await updateVehicleWithAudit(user.company_id, rowId, updates, user.id);
    if (result.error) {
      loggingService.error('Failed to update vehicle', { error: result.error }, 'VehicleExplorer');
    } else {
      invalidateVehicleCaches();
      await Promise.all([
        reloadFromDb(),
        queryClient.invalidateQueries({ queryKey: ['vehicle-explorer-search'] }),
      ]);
    }
  };

  const handleExportCSV = () => {
    if (!userPermissions) {
      loggingService.warn('Permissions not loaded yet; skipping export', {}, 'VehicleExplorer');
      return;
    }
    setExportLoading(true);
    try {
      const exportColumns = filteredColumns;
      const headers = exportColumns.map((c) => c.label).join(',');
      const rows = sortVehicles(filterVehicles(vehicles, filters), sortField, sortDir)
        .map((vehicle, index) =>
          exportColumns
            .map((col) => {
              const value = col.format
                ? col.format(getRowValue(vehicle as VehicleRow, col.key), index)
                : getRowValue(vehicle as VehicleRow, col.key) || '';
              return `"${String(value).replace(/"/g, '""')}"`;
            })
            .join(','),
        )
        .join('\n');
      const csv = `${headers}\n${rows}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vehicles_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      loggingService.error('Export failed', { error }, 'VehicleExplorer');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRowClick = (row: VehicleRow) => {
    setSelectedVehicle(row);
    setDetailPanelOpen(true);
  };

  const handleBulkAction = async (action: string, selectedVehicles: VehicleCanonical[]) => {
    setPendingBulkAction({ action, vehicles: selectedVehicles });
  };

  const handleBulkActionComplete = async () => {
    if (pendingBulkAction) {
      invalidateVehicleCaches();
      await Promise.all([
        reloadFromDb(),
        queryClient.invalidateQueries({ queryKey: ['vehicle-explorer-search'] }),
      ]);
    }
    setPendingBulkAction(null);
  };

  if (loading && vehicles.length === 0 && !serverQuery.data && !serverQuery.isFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" aria-label="Loading vehicles" />
      </div>
    );
  }

  if (loadErrors.length > 0 && vehicles.length === 0 && !usingServerData) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader
          title="Vehicle Explorer"
          description="Vehicle inventory and milestone details"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicle Explorer' }]}
        />
        <div className="glass-panel p-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" aria-hidden />
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Vehicles</h3>
          <p className="text-sm text-muted-foreground mb-6">
            The explorer could not load {loadErrors.join(', ')}. Retry the query, and sign out then sign back in if the problem persists.
          </p>
          <Button onClick={() => void reloadFromDb()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
            Retry Load
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Vehicle Explorer"
        description={`${filteredCount} of ${totalVehicleCount} vehicles`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Vehicle Explorer' }]}
        actions={
          <div className="flex items-center gap-2">
            {userPermissions?.canEdit && (
              <Button
                variant={readOnlyMode ? 'outline' : 'default'}
                size="sm"
                onClick={() => setReadOnlyMode(!readOnlyMode)}
              >
                {readOnlyMode ? <Edit className="h-3.5 w-3.5 mr-1" aria-hidden /> : <Eye className="h-3.5 w-3.5 mr-1" aria-hidden />}
                {readOnlyMode ? 'Edit' : 'Read Only'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={exportLoading}>
              <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        }
      />

      <VehicleExplorerFilters
        state={filters}
        onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
        branches={branches}
        models={models}
        payments={payments}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        resultCount={filteredCount}
        totalCount={totalVehicleCount}
        defaultPageSize={DEFAULT_FILTERS.pageSize}
      />

      <ExcelTable<VehicleRow>
        data={pageData as VehicleRow[]}
        columns={filteredColumns}
        loading={serverQuery.isFetching && pageData.length === 0}
        sort={{ key: sortField, direction: sortDir }}
        onSort={(key) => {
          if (sortField === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          } else {
            setSortField(key);
            setSortDir('desc');
          }
        }}
        pagination={{
          page: currentPage,
          pageSize: filters.pageSize,
          totalPages,
          total: filteredCount,
          onPageChange: setPage,
          onPageSizeChange: (pageSize) => setFilters((prev) => ({ ...prev, pageSize })),
        }}
        onEdit={canEdit ? handleCellEdit : undefined}
        onRowClick={handleRowClick}
        permissions={permissions}
        readOnlyMode={readOnlyMode}
        onBulkAction={canEdit ? handleBulkAction : undefined}
      />

      {pendingBulkAction && (
        <VehicleBulkActions
          selectedVehicles={pendingBulkAction.vehicles}
          action={pendingBulkAction.action}
          onComplete={handleBulkActionComplete}
        />
      )}

      <VehicleDetailPanel
        vehicle={selectedVehicle}
        open={detailPanelOpen}
        onClose={() => {
          setDetailPanelOpen(false);
          setSelectedVehicle(null);
        }}
        canEdit={userPermissions?.canEdit || false}
        onEdit={
          userPermissions?.canEdit
            ? async (id, updates) => {
                if (!user?.id || !user.company_id) return;
                const result = await updateVehicleWithAudit(user.company_id, id, updates, user.id);
                if (result.error) {
                  loggingService.error('Failed to update vehicle', { error: result.error }, 'VehicleExplorer');
                } else {
                  invalidateVehicleCaches();
                  await Promise.all([
                    reloadFromDb(),
                    queryClient.invalidateQueries({ queryKey: ['vehicle-explorer-search'] }),
                  ]);
                }
              }
            : undefined
        }
      />
    </div>
  );
}
