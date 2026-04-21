import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ExcelTable } from '@/components/shared/ExcelTable';
import { VehicleDetailPanel } from '@/components/vehicles/VehicleDetailPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Download, Edit, Eye, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { updateVehicleWithAudit, invalidateVehicleCaches } from '@/services/vehicleService';
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

export default function VehicleExplorer() {
  const { user } = useAuth();
  const { vehicles, loading, loadErrors, reloadFromDb } = useData();
  const navigate = useNavigate();
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
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<{ action: string; vehicles: VehicleCanonical[] } | null>(null);

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
    () => [...new Set(vehicles.map((v) => v.branch_code))].sort(),
    [vehicles],
  );
  const models = useMemo(
    () => [...new Set(vehicles.map((v) => v.model))].sort(),
    [vehicles],
  );
  const payments = useMemo(
    () => [...new Set(vehicles.map((v) => v.payment_method))].sort(),
    [vehicles],
  );

  const filtered = useMemo(() => {
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
        // Case-insensitive match so drill-downs from PaymentPieChart (which
        // upper-cases labels to merge duplicates like "Floor Stock" vs
        // "FLOOR STOCK") still select the right rows.
        const raw = (v.payment_method ?? '').trim();
        if (payment === 'Unspecified') {
          const isUnspec = !raw || raw.toLowerCase() === 'unknown' || raw === '-' || raw === '\u2014';
          if (!isUnspec) return false;
        } else if (raw.toUpperCase() !== payment.toUpperCase()) {
          return false;
        }
      }
      if (stage !== 'all') {
        // Prefer persisted stage (set by DB trigger), fall back to derivation
        // so the filter still works on locally-loaded rows before sync.
        const current = v.stage ?? deriveVehicleStage(v);
        if (current !== stage) return false;
      }
      return true;
    });
  }, [vehicles, filters]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let aVal: unknown;
      let bVal: unknown;

      if (sortField === 'row_no') {
        aVal = filtered.indexOf(a);
        bVal = filtered.indexOf(b);
      } else {
        aVal = (a as Record<string, unknown>)[sortField];
        bVal = (b as Record<string, unknown>)[sortField];
      }

      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return sortDir === 'desc'
        ? (bVal as number) - (aVal as number)
        : (aVal as number) - (bVal as number);
    });
    return rows;
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / filters.pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * filters.pageSize;
  const pageData = sorted.slice(startIdx, startIdx + filters.pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.branch, filters.model, filters.payment, filters.pageSize]);

  const canEdit = (userPermissions?.canEdit || false) && !readOnlyMode;
  const allColumns = useVehicleExplorerColumns({
    canEdit: userPermissions?.canEdit || false,
    branches,
    models,
    payments,
    startIdx,
  });

  const permissions = useMemo(() => {
    return userPermissions?.columns
      ? Object.fromEntries(Array.from(userPermissions.columns.entries()).map(([col, level]) => [col, level]))
      : {};
  }, [userPermissions]);

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
    column: { key: string; onSave?: (rowId: string, value: unknown) => Partial<VehicleCanonical> },
    value: unknown,
  ) => {
    if (!user?.id) return;
    const updates = column.onSave ? column.onSave(rowId, value) : { [column.key]: value };
    const result = await updateVehicleWithAudit(rowId, updates, user.id);
    if (result.error) {
      loggingService.error('Failed to update vehicle', { error: result.error }, 'VehicleExplorer');
    } else {
      invalidateVehicleCaches();
      await reloadFromDb();
    }
  };

  const handleExportCSV = () => {
    if (!userPermissions?.canEdit && !userPermissions?.canView) {
      loggingService.warn('No permission to export', {}, 'VehicleExplorer');
      return;
    }
    setExportLoading(true);
    try {
      const headers = allColumns.map((c) => c.label).join(',');
      const rows = sorted
        .map((vehicle) =>
          allColumns
            .map((col) => {
              const value = col.format
                ? col.format((vehicle as Record<string, unknown>)[col.key], sorted.indexOf(vehicle))
                : (vehicle as Record<string, unknown>)[col.key] || '';
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
    navigate(`/auto-aging/vehicles/${row.chassis_no}`);
  };

  const handleBulkAction = async (action: string, selectedVehicles: VehicleCanonical[]) => {
    setPendingBulkAction({ action, vehicles: selectedVehicles });
  };

  const handleBulkActionComplete = async () => {
    if (pendingBulkAction) {
      invalidateVehicleCaches();
      await reloadFromDb();
    }
    setPendingBulkAction(null);
  };

  if (loading && vehicles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" aria-label="Loading vehicles" />
      </div>
    );
  }

  if (loadErrors.length > 0 && vehicles.length === 0) {
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
        description={`${filtered.length} of ${vehicles.length} vehicles`}
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
        resultCount={filtered.length}
        totalCount={vehicles.length}
        defaultPageSize={DEFAULT_FILTERS.pageSize}
      />

      <ExcelTable<VehicleRow>
        data={pageData as VehicleRow[]}
        columns={filteredColumns}
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
          total: filtered.length,
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
          navigate('/auto-aging/vehicles');
        }}
        canEdit={userPermissions?.canEdit || false}
        onEdit={
          userPermissions?.canEdit
            ? async (id, updates) => {
                if (!user?.id) return;
                const result = await updateVehicleWithAudit(id, updates, user.id);
                if (result.error) {
                  loggingService.error('Failed to update vehicle', { error: result.error }, 'VehicleExplorer');
                } else {
                  invalidateVehicleCaches();
                  await reloadFromDb();
                }
              }
            : undefined
        }
      />
    </div>
  );
}
