import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SortAsc, SortDesc, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface TableColumn<T = unknown> {
  key: string;
  label: string;
  width?: number;
  sortable?: boolean;
  editable?: boolean;
  type?: ColumnType;
  options?: string[];
  format?: (value: unknown, rowIndex: number) => string;
  validate?: (value: unknown) => string | null;
  onSave?: (rowId: string, value: unknown) => Partial<T>;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

interface ExcelTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  sort?: SortConfig;
  onSort?: (key: string) => void;
  pagination?: PaginationConfig;
  onEdit?: (rowId: string, column: string, value: unknown) => Promise<void>;
  onRowClick?: (row: T) => void;
  permissions?: Record<string, 'view' | 'edit'>;
  readOnlyMode?: boolean;
  onBulkAction?: (action: string, selectedRows: T[]) => Promise<void>;
  showSelection?: boolean;
  getRowClassName?: (row: T) => string;
}

type TableRowRecord = Record<string, unknown>;
type TableColumnRecord = TableColumn<TableRowRecord>;

interface EditableGridCellProps {
  row: TableRowRecord;
  rowId: string;
  column: TableColumnRecord;
  isEditing: boolean;
  editValue?: unknown;
  validationError?: string | null;
  canEdit: boolean;
  onActivateCell: (row: TableRowRecord, column: TableColumnRecord) => void;
  onEditValueChange: (value: unknown) => void;
  onSave: (rowId: string, column: string, columnDef: TableColumnRecord) => void;
  onCancel: () => void;
}

const EditableGridCell = React.memo(function EditableGridCell({
  row,
  rowId,
  column,
  isEditing,
  editValue,
  validationError,
  canEdit,
  onActivateCell,
  onEditValueChange,
  onSave,
  onCancel,
}: EditableGridCellProps) {
  const value = row[column.key];

  const renderDisplayValue = () => {
    if (column.format) {
      return column.format(value);
    }

    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    return <span>{String(value)}</span>;
  };

  return (
    <TableCell
      className={cn(
        "whitespace-nowrap",
        canEdit && "cursor-text hover:bg-secondary/20"
      )}
      style={column.width ? { minWidth: `${column.width}px` } : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onActivateCell(row, column);
      }}
    >
      {isEditing ? (
        <div className="space-y-1">
          {column.type === 'number' && (
            <Input
              type="number"
              value={editValue as string}
              onChange={(event) => onEditValueChange(parseFloat(event.target.value))}
              onBlur={() => void onSave(rowId, column.key, column)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void onSave(rowId, column.key, column);
                if (event.key === 'Escape') onCancel();
              }}
              className={cn('h-8', validationError && 'border-destructive')}
              autoFocus
            />
          )}

          {column.type === 'date' && (
            <input
              type="date"
              value={editValue as string}
              onChange={(event) => onEditValueChange(event.target.value)}
              onBlur={() => void onSave(rowId, column.key, column)}
              className={cn('h-8 px-2 rounded border border-input bg-background text-foreground', validationError && 'border-destructive')}
              autoFocus
            />
          )}

          {column.type === 'select' && (
            <select
              value={editValue as string}
              onChange={(event) => onEditValueChange(event.target.value)}
              onBlur={() => void onSave(rowId, column.key, column)}
              className={cn('h-8 px-2 rounded border border-input bg-background text-foreground', validationError && 'border-destructive')}
              autoFocus
            >
              <option value="">-- Select --</option>
              {column.options?.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          )}

          {column.type !== 'number' && column.type !== 'date' && column.type !== 'select' && (
            <Input
              value={editValue as string}
              onChange={(event) => onEditValueChange(event.target.value)}
              onBlur={() => void onSave(rowId, column.key, column)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void onSave(rowId, column.key, column);
                if (event.key === 'Escape') onCancel();
              }}
              className={cn('h-8', validationError && 'border-destructive')}
              autoFocus
            />
          )}

          {validationError && (
            <div className="flex items-center gap-1 text-destructive text-xs">
              <AlertCircle className="h-3 w-3" />
              {validationError}
            </div>
          )}

          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => void onSave(rowId, column.key, column)}
            >
              <Check className="h-3.5 w-3.5 text-success" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={onCancel}
            >
              <X className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      ) : (
        renderDisplayValue()
      )}
    </TableCell>
  );
}, (previousProps, nextProps) => {
  if (previousProps.row !== nextProps.row) return false;
  if (previousProps.column !== nextProps.column) return false;
  if (previousProps.canEdit !== nextProps.canEdit) return false;
  if (previousProps.isEditing !== nextProps.isEditing) return false;
  if (!nextProps.isEditing) return true;

  return previousProps.editValue === nextProps.editValue && previousProps.validationError === nextProps.validationError;
});

interface EditableGridRowProps {
  row: TableRowRecord;
  columns: TableColumnRecord[];
  rowClassName?: string;
  showSelection: boolean;
  isSelected: boolean;
  activeEditingColumn: string | null;
  editValue: unknown;
  validationError: string | null;
  hasOnEdit: boolean;
  permissions?: Record<string, 'view' | 'edit'>;
  readOnlyMode: boolean;
  onRowClick?: (row: TableRowRecord) => void;
  onActivateCell: (row: TableRowRecord, column: TableColumnRecord) => void;
  onEditValueChange: (value: unknown) => void;
  onSave: (rowId: string, column: string, columnDef: TableColumnRecord) => void;
  onCancel: () => void;
  onSelectRow: (rowId: string, checked: boolean) => void;
}

const EditableGridRow = React.memo(function EditableGridRow({
  row,
  columns,
  rowClassName,
  showSelection,
  isSelected,
  activeEditingColumn,
  editValue,
  validationError,
  hasOnEdit,
  permissions,
  readOnlyMode,
  onRowClick,
  onActivateCell,
  onEditValueChange,
  onSave,
  onCancel,
  onSelectRow,
}: EditableGridRowProps) {
  const rowId = row.id as string;

  return (
    <TableRow
      className={cn(
        'cursor-pointer hover:bg-secondary/30',
        onRowClick && 'hover:border-primary/30',
        isSelected && 'bg-primary/5',
        rowClassName
      )}
      onClick={() => onRowClick?.(row)}
    >
      {showSelection && (
        <TableCell onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            className="rounded border-input"
            checked={isSelected}
            onChange={(event) => onSelectRow(rowId, event.target.checked)}
          />
        </TableCell>
      )}
      {columns.map((column) => {
        const canEdit = Boolean(column.editable && hasOnEdit && permissions?.[column.key] === 'edit' && !readOnlyMode);

        return (
          <EditableGridCell
            key={column.key}
            row={row}
            rowId={rowId}
            column={column}
            isEditing={activeEditingColumn === column.key}
            editValue={activeEditingColumn === column.key ? editValue : undefined}
            validationError={activeEditingColumn === column.key ? validationError : null}
            canEdit={canEdit}
            onActivateCell={onActivateCell}
            onEditValueChange={onEditValueChange}
            onSave={onSave}
            onCancel={onCancel}
          />
        );
      })}
    </TableRow>
  );
}, (previousProps, nextProps) => {
  if (previousProps.row !== nextProps.row) return false;
  if (previousProps.rowClassName !== nextProps.rowClassName) return false;
  if (previousProps.showSelection !== nextProps.showSelection) return false;
  if (previousProps.isSelected !== nextProps.isSelected) return false;
  if (previousProps.activeEditingColumn !== nextProps.activeEditingColumn) return false;
  if (previousProps.columns !== nextProps.columns) return false;
  if (previousProps.hasOnEdit !== nextProps.hasOnEdit) return false;
  if (previousProps.permissions !== nextProps.permissions) return false;
  if (previousProps.readOnlyMode !== nextProps.readOnlyMode) return false;
  if (!nextProps.activeEditingColumn) return true;

  return previousProps.editValue === nextProps.editValue && previousProps.validationError === nextProps.validationError;
});

export function ExcelTable<T>({
  data,
  columns,
  loading = false,
  sort,
  onSort,
  pagination,
  onEdit,
  onRowClick,
  permissions,
  readOnlyMode = false,
  onBulkAction,
  showSelection = true,
  getRowClassName,
}: ExcelTableProps<T>) {
  const tableData = data as TableRowRecord[];
  const tableColumns = columns as TableColumnRecord[];
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState<unknown>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const editingControlRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!editingCell) return;
    editingControlRef.current?.focus();
  }, [editingCell]);

  const canEditColumn = useCallback((column: TableColumn<T>): boolean => {
    // Column must be declared editable by the caller (reflects canEdit + field-level rules),
    // onEdit handler must exist, and we must not be in read-only mode.
    if (!column.editable || !onEdit || readOnlyMode) return false;
    // Permission map semantics: an explicit 'view' entry downgrades to read-only;
    // missing entries or an empty map imply full access (admin/manager defaults).
    const entry = permissions?.[column.key];
    return entry !== 'view';
  }, [onEdit, permissions, readOnlyMode]);

  const handleCellClick = useCallback((row: T, column: TableColumn<T>) => {
    if (!canEditColumn(column)) return;
    const rowId = (row as Record<string, unknown>).id as string;
    setEditingCell({ rowId, column: column.key });
    setEditValue((row as Record<string, unknown>)[column.key]);
    setValidationError(null);
  }, [canEditColumn]);

  const handleCellSave = useCallback(async (rowId: string, column: string, columnDef: TableColumn<T>) => {
    if (columnDef.validate) {
      const error = columnDef.validate(editValue);
      if (error) {
        setValidationError(error);
        return;
      }
    }

    setValidationError(null);
    
    if (onEdit) {
      await onEdit(rowId, column, editValue);
    }
    setEditingCell(null);
    setEditValue('');
  }, [editValue, onEdit]);

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
    setValidationError(null);
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(tableData.map(row => row.id as string)));
    } else {
      setSelectedRows(new Set());
    }
  }, [tableData]);

  const handleSelectRow = useCallback((rowId: string, checked: boolean) => {
    setSelectedRows(previousSelectedRows => {
      const nextSelectedRows = new Set(previousSelectedRows);
      if (checked) {
        nextSelectedRows.add(rowId);
      } else {
        nextSelectedRows.delete(rowId);
      }
      return nextSelectedRows;
    });
  }, []);

  const handleBulkAction = useCallback(async (action: string) => {
    const selectedData = tableData.filter(row => 
      selectedRows.has(row.id as string)
    );
    
    if (onBulkAction && selectedData.length > 0) {
      await onBulkAction(action, selectedData as T[]);
      setSelectedRows(new Set());
    }
  }, [onBulkAction, selectedRows, tableData]);

  const handleCellActivate = useCallback((row: TableRowRecord, column: TableColumnRecord) => {
    handleCellClick(row as T, column as TableColumn<T>);
  }, [handleCellClick]);

  const handleCellSaveForRow = useCallback((rowId: string, column: string, columnDef: TableColumnRecord) => {
    void handleCellSave(rowId, column, columnDef as TableColumn<T>);
  }, [handleCellSave]);

  if (loading) {
    return (
      <div className="glass-panel p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  if (tableData.length === 0) {
    return (
      <div className="glass-panel p-8 text-center">
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onSort && (
            <Button variant="outline" size="sm" onClick={() => onSort(sort?.key || columns[0].key)}>
              <SortAsc className="h-3.5 w-3.5 mr-1" />
              Sort
            </Button>
          )}
          
          {showSelection && onBulkAction && selectedRows.size > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedRows.size} selected</Badge>
              <select
                onChange={(e) => e.target.value && handleBulkAction(e.target.value)}
                className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground"
                defaultValue=""
              >
                <option value="">Bulk Actions</option>
                <option value="mark_complete">Mark Complete</option>
                <option value="assign">Assign</option>
                <option value="delete">Delete</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                {showSelection && (
                  <TableHead className="w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-input"
                      checked={selectedRows.size === data.length && data.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </TableHead>
                )}
                {tableColumns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      "whitespace-nowrap font-semibold text-foreground",
                      onSort && column.sortable !== false && "cursor-pointer hover:bg-secondary/50"
                    )}
                    style={column.width ? { minWidth: `${column.width}px` } : undefined}
                    onClick={() => onSort && column.sortable !== false && onSort(column.key)}
                  >
                    <div className="flex items-center gap-1">
                      {column.label}
                      {sort?.key === column.key && (
                        sort.direction === 'asc' ? (
                          <SortAsc className="h-3 w-3 text-primary" />
                        ) : (
                          <SortDesc className="h-3 w-3 text-primary" />
                        )
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => {
                const rowId = row.id as string;
                const isSelected = selectedRows.has(rowId);
                const activeEditingColumn = editingCell?.rowId === rowId ? editingCell.column : null;
                
                return (
                  <EditableGridRow
                    key={rowId}
                    row={row}
                    columns={tableColumns}
                    rowClassName={getRowClassName?.(row as T)}
                    showSelection={showSelection}
                    isSelected={isSelected}
                    activeEditingColumn={activeEditingColumn}
                    editValue={activeEditingColumn ? editValue : undefined}
                    validationError={activeEditingColumn ? validationError : null}
                    hasOnEdit={Boolean(onEdit)}
                    permissions={permissions}
                    readOnlyMode={readOnlyMode}
                    onRowClick={onRowClick ? (candidateRow) => onRowClick(candidateRow as T) : undefined}
                    onActivateCell={handleCellActivate}
                    onEditValueChange={setEditValue}
                    onSave={handleCellSaveForRow}
                    onCancel={handleCellCancel}
                    onSelectRow={handleSelectRow}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {pagination && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Showing {pagination.total === 0 ? 0 : ((pagination.page - 1) * pagination.pageSize) + 1}
            {' '}to {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} records
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-foreground tabular-nums">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}