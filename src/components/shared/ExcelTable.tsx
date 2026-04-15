import React, { useState, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SortAsc, SortDesc, ChevronLeft, ChevronRight, MoreVertical, Edit2, Eye, EyeOff } from 'lucide-react';

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface TableColumn<T = unknown> {
  key: string;
  label: string;
  width?: number;
  sortable?: boolean;
  editable?: boolean;
  type?: ColumnType;
  options?: string[];
  format?: (value: unknown) => string;
  validate?: (value: unknown) => string | null;
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
}

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
}: ExcelTableProps<T>) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState<unknown>('');

  const handleCellClick = useCallback((row: T, column: TableColumn<T>) => {
    const rowId = (row as Record<string, unknown>).id as string;
    
    // If editing is disabled or user doesn't have edit permission
    if (!column.editable || !onEdit || permissions?.[column.key] !== 'edit') {
      return;
    }

    setEditingCell({ rowId, column: column.key });
    setEditValue((row as Record<string, unknown>)[column.key]);
  }, [onEdit, permissions]);

  const handleCellSave = useCallback(async (rowId: string, column: string, columnDef: TableColumn<T>) => {
    if (onEdit) {
      await onEdit(rowId, column, editValue);
    }
    setEditingCell(null);
    setEditValue('');
  }, [editValue, onEdit]);

  const renderCellContent = (row: T, column: TableColumn<T>) => {
    const value = (row as Record<string, unknown>)[column.key];
    const rowId = (row as Record<string, unknown>).id as string;
    const isEditing = editingCell?.rowId === rowId && editingCell?.column === column.key;

    // If editing
    if (isEditing) {
      switch (column.type) {
        case 'number':
          return (
            <Input
              type="number"
              value={editValue as string}
              onChange={(e) => setEditValue(parseFloat(e.target.value))}
              onBlur={() => handleCellSave(rowId, column.key, column)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCellSave(rowId, column.key, column);
                if (e.key === 'Escape') setEditingCell(null);
              }}
              className="h-8"
              autoFocus
            />
          );
        case 'date':
          return (
            <input
              type="date"
              value={editValue as string}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleCellSave(rowId, column.key, column)}
              className="h-8 px-2 rounded border border-input bg-background text-foreground"
              autoFocus
            />
          );
        case 'select':
          return (
            <select
              value={editValue as string}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleCellSave(rowId, column.key, column)}
              className="h-8 px-2 rounded border border-input bg-background text-foreground"
              autoFocus
            >
              <option value="">-- Select --</option>
              {column.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        default:
          return (
            <Input
              value={editValue as string}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleCellSave(rowId, column.key, column)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCellSave(rowId, column.key, column);
                if (e.key === 'Escape') setEditingCell(null);
              }}
              className="h-8"
              autoFocus
            />
          );
      }
    }

    // Display mode
    if (column.format) {
      return column.format(value);
    }

    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    return <span>{String(value)}</span>;
  };

  if (loading) {
    return (
      <div className="glass-panel p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="glass-panel p-8 text-center">
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onSort && (
            <>
              <Button variant="outline" size="sm" onClick={() => onSort(sort?.key || columns[0].key)}>
                <SortAsc className="h-3.5 w-3.5 mr-1" />
                Sort
              </Button>
            </>
          )}
        </div>
        {pagination && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm text-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(parseInt(e.target.value))}
              className="h-8 rounded-md bg-secondary border border-border px-2 text-xs text-foreground"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                <TableHead className="w-10">
                  <input type="checkbox" className="rounded border-input" />
                </TableHead>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      "whitespace-nowrap font-semibold text-foreground",
                      column.width && `w-[${column.width}px]`,
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
              {data.map((row) => (
                <TableRow
                  key={(row as Record<string, unknown>).id}
                  className={cn(
                    "cursor-pointer hover:bg-secondary/30",
                    onRowClick && "hover:border-primary/30"
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  <TableCell>
                    <input type="checkbox" className="rounded border-input" onClick={(e) => e.stopPropagation()} />
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap",
                        column.editable && onEdit && permissions?.[column.key] === 'edit' && "cursor-text hover:bg-secondary/20"
                      )}
                      style={column.width ? { minWidth: `${column.width}px` } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCellClick(row, column);
                      }}
                    >
                      {renderCellContent(row, column)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination at bottom */}
      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {((pagination.page - 1) * pagination.pageSize) + 1} to {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} records</span>
        </div>
      )}
    </div>
  );
}