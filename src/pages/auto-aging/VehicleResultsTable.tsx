import React from 'react';
import { ExcelTable } from '@/components/shared/ExcelTable';
import { VehicleBulkActions } from './VehicleBulkActions';
import type { VehicleRow } from './useVehicleExplorerColumns';
import type { VehicleCanonical } from '@/types';

interface VehicleResultsTableProps {
  data: VehicleRow[];
  columns: ReturnType<typeof import('./useVehicleExplorerColumns').useVehicleExplorerColumns>;
  loading: boolean;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  canEdit: boolean;
  readOnlyMode: boolean;
  permissions: Record<string, 'view' | 'edit'>;
  onCellEdit?: (rowId: string, columnKey: string, value: unknown) => Promise<void>;
  onRowClick: (row: VehicleRow) => void;
  pendingBulkAction: { action: string; vehicles: VehicleCanonical[] } | null;
  onBulkAction?: (action: string, vehicles: VehicleCanonical[]) => Promise<void>;
  onBulkActionComplete: () => Promise<void>;
}

export function VehicleResultsTable({
  data,
  columns,
  loading,
  sortField,
  sortDir,
  onSort,
  page,
  pageSize,
  totalPages,
  totalCount,
  onPageChange,
  onPageSizeChange,
  canEdit,
  readOnlyMode,
  permissions,
  onCellEdit,
  onRowClick,
  pendingBulkAction,
  onBulkAction,
  onBulkActionComplete,
}: VehicleResultsTableProps) {
  return (
    <>
      <ExcelTable<VehicleRow>
        data={data}
        columns={columns}
        loading={loading}
        sort={{ key: sortField, direction: sortDir }}
        onSort={(key) => onSort(key)}
        pagination={{
          page,
          pageSize,
          totalPages,
          total: totalCount,
          onPageChange,
          onPageSizeChange,
        }}
        onEdit={canEdit && !readOnlyMode ? onCellEdit : undefined}
        onRowClick={onRowClick}
        permissions={permissions}
        readOnlyMode={readOnlyMode}
        onBulkAction={canEdit ? onBulkAction : undefined}
      />

      {pendingBulkAction && (
        <VehicleBulkActions
          selectedVehicles={pendingBulkAction.vehicles}
          action={pendingBulkAction.action}
          onComplete={onBulkActionComplete}
        />
      )}
    </>
  );
}
