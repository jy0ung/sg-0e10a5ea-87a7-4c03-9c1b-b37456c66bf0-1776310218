import React, { useMemo, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, Columns3 } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { cn } from './lib/utils';

export interface StandardTableColumn<T> {
  key: string;
  label: string;
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export type SortDir = 'asc' | 'desc';
export type StandardTableMobileLayout = 'cards' | 'table';

export interface StandardTableProps<T extends object> {
  data: T[];
  columns: StandardTableColumn<T>[];
  searchPlaceholder?: string;
  hideSearch?: boolean;
  pageSizes?: number[];
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  selectable?: boolean;
  selected?: Set<string>;
  rowKey?: string;
  onSelectionChange?: (selected: Set<string>) => void;
  bulkActions?: (selected: Set<string>, clearSelection: () => void) => React.ReactNode;
  className?: string;
  mobileLayout?: StandardTableMobileLayout;
  serverSide?: boolean;
  totalCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onSortChange?: (key: string | null, dir: SortDir) => void;
  onSearchChange?: (term: string) => void;
  /** Enable virtual scrolling for large lists (activates when rows > virtualThreshold) */
  virtual?: boolean;
  virtualThreshold?: number;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50];

function getValue<T extends object>(item: T, key: string): unknown {
  return (item as Record<string, unknown>)[key];
}

export function StandardTable<T extends object>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  hideSearch = false,
  pageSizes = DEFAULT_PAGE_SIZES,
  emptyMessage = 'No data available.',
  onRowClick,
  selectable = false,
  selected: controlledSelected,
  rowKey = 'id',
  onSelectionChange,
  bulkActions,
  className,
  mobileLayout = 'cards',
  serverSide = false,
  totalCount: controlledTotal,
  currentPage: controlledPage,
  onPageChange,
  onSortChange,
  onSearchChange,
  virtual = false,
  virtualThreshold = 200,
}: StandardTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('st-hidden-cols');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); /* localStorage unavailable */ }
  });
  const [showColToggle, setShowColToggle] = useState(false);

  const selected = controlledSelected ?? internalSelected;
  const setSelected = (next: Set<string>) => {
    setInternalSelected(next);
    onSelectionChange?.(next);
  };

  const filtered = useMemo(() => {
    if (serverSide) return data;
    if (!search.trim()) return data;
    const term = search.trim().toLowerCase();
    return data.filter(item =>
      columns.some(col => {
        const val = getValue(item, col.key);
        return typeof val === 'string' && val.toLowerCase().includes(term);
      }),
    );
  }, [columns, data, search, serverSide]);

  const sorted = useMemo(() => {
    if (serverSide) return filtered;
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = getValue(a, sortKey) ?? '';
      const bv = getValue(b, sortKey) ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, serverSide, sortDir, sortKey]);

  const displayData = serverSide ? data : sorted;
  const totalRecords = serverSide ? (controlledTotal ?? displayData.length) : displayData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = serverSide ? (controlledPage ?? 1) : Math.min(page, totalPages);
  const pageData = serverSide ? displayData : displayData.slice((safePage - 1) * pageSize, safePage * pageSize);
  const useVirtual = virtual && pageData.length > virtualThreshold;
  const rowVirtualizer = useVirtualizer({
    count: pageData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    onSearchChange?.(value);
  };

  const handleSort = (key: string) => {
    let newDir: SortDir;
    if (sortKey === key) {
      newDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      setSortKey(key);
      newDir = 'asc';
    }
    setSortDir(newDir);
    setPage(1);
    onSortChange?.(key, newDir);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    onPageChange?.(nextPage);
  };

  const pageKeys = pageData.map(item => String(getValue(item, rowKey) ?? ''));
  const allPageSelected = pageKeys.length > 0 && pageKeys.every(key => selected.has(key));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allPageSelected) {
      pageKeys.forEach(key => next.delete(key));
    } else {
      pageKeys.forEach(key => next.add(key));
    }
    setSelected(next);
  };

  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const clearSelection = () => setSelected(new Set());

  const visibleColumns = columns.filter(c => !hiddenCols.has(c.key));
  const toggleCol = (key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('st-hidden-cols', JSON.stringify([...next])); } catch { /* localStorage unavailable */ }
      return next;
    });
  };

  const SortIcon = ({ col }: { col: StandardTableColumn<T> }) => {
    if (col.sortable === false) return null;
    if (sortKey !== col.key) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 text-primary" />
      : <ChevronDown className="ml-1 h-3 w-3 text-primary" />;
  };

  const table = (
    <div ref={parentRef} className={cn("overflow-x-auto", useVirtual && "max-h-[600px] overflow-y-auto")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {selectable && (
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleAll}
                  aria-label="Select all rows on this page"
                  className="h-3.5 w-3.5 accent-primary"
                />
              </th>
            )}
            {visibleColumns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider',
                  col.sortable !== false && 'cursor-pointer select-none hover:text-foreground transition-colors',
                  col.className,
                )}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <span className="inline-flex items-center">
                  {col.label}
                  <SortIcon col={col} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {useVirtual ? (
            <>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const item = pageData[virtualRow.index];
                const index = virtualRow.index;
                return (
                  <tr
                    key={String(getValue(item, rowKey) ?? index)}
                    style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start - (rowVirtualizer.getVirtualItems()[0]?.start ?? 0)}px)` }}
                    className={cn('border-b border-border/50', onRowClick && 'cursor-pointer hover:bg-muted/50')}
                    onClick={() => onRowClick?.(item)}
                  >
                    {selectable && (
                      <td className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(String(getValue(item, rowKey) ?? ''))}
                          onChange={() => toggleRow(String(getValue(item, rowKey) ?? ''))}
                          aria-label="Select row"
                          className="h-3.5 w-3.5 accent-primary"
                        />
                      </td>
                    )}
                    {visibleColumns.map(col => (
                      <td key={col.key} className={cn('px-3 py-2.5 text-sm', col.className)}>
                        {col.render ? col.render(item, index) : String(getValue(item, col.key) ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </>
          ) : (
          pageData.map((item, index) => {
            const key = String(getValue(item, rowKey) ?? index);
            return (
              <tr
                key={key}
                className={cn(
                  'data-table-row border-b border-border last:border-0',
                  onRowClick && 'cursor-pointer',
                  selected.has(key) && 'bg-primary/5',
                )}
                onClick={() => onRowClick?.(item)}
              >
                {selectable && (
                  <td className="w-10 px-3 py-3" onClick={event => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleRow(key)}
                      aria-label="Select row"
                      className="h-3.5 w-3.5 accent-primary"
                    />
                  </td>
                )}
                {visibleColumns.map(col => (
                  <td key={col.key} className={cn('px-4 py-3 text-foreground', col.className)}>
                    {col.render ? col.render(item, index) : String(getValue(item, col.key) ?? '-')}
                  </td>
                ))}
              </tr>
            );
          })
          )}
        </tbody>
      </table>
    </div>
  );

  const pagination = totalPages > 1 && (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3',
        mobileLayout === 'table' ? 'border-t border-border bg-secondary/10' : 'glass-panel mt-2',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('text-xs text-muted-foreground', mobileLayout === 'cards' && 'hidden sm:inline')}>
          Rows per page
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={value => {
            setPageSize(Number(value));
            handlePageChange(1);
          }}
        >
          <SelectTrigger className="h-7 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map(size => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-2 text-xs text-muted-foreground">
          {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, totalRecords)} of {totalRecords}
        </span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => handlePageChange(1)} aria-label="First page">«</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => handlePageChange(safePage - 1)} aria-label="Previous page">‹</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => handlePageChange(safePage + 1)} aria-label="Next page">›</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => handlePageChange(totalPages)} aria-label="Last page">»</Button>
      </div>
    </div>
  );

  return (
    <div className={cn('space-y-3', className)}>
      {(!hideSearch || selectable) && (
        <div className="flex flex-wrap items-center gap-3">
          {!hideSearch && (
            <div className="relative min-w-[180px] max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-sm"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                value={search}
                onChange={event => handleSearch(event.target.value)}
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setShowColToggle(v => !v)} aria-label="Toggle column visibility">
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </Button>
              {showColToggle && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-md border bg-popover p-2 shadow-md">
                  {columns.map(col => (
                    <label key={col.key} className="flex items-center gap-2 py-1 px-1 text-xs hover:bg-accent rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="h-3 w-3 accent-primary"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {totalRecords} {totalRecords === 1 ? 'result' : 'results'}
            </span>
          </div>
        </div>
      )}

      {selectable && selected.size > 0 && bulkActions && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-primary">{selected.size} selected</span>
          {bulkActions(selected, clearSelection)}
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      )}

      {displayData.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : mobileLayout === 'table' ? (
        <div className="glass-panel overflow-hidden">
          {table}
          {pagination}
        </div>
      ) : (
        <>
          <div className="glass-panel hidden overflow-hidden md:block">{table}</div>

          <ul className="space-y-2 md:hidden" data-testid="standard-table-mobile-list">
            {pageData.map((item, index) => {
              const key = String(getValue(item, rowKey) ?? index);
              const interactive = Boolean(onRowClick);
              const interactiveProps = interactive
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    onClick: () => onRowClick?.(item),
                    onKeyDown: (event: React.KeyboardEvent<HTMLLIElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick?.(item);
                      }
                    },
                  }
                : {};

              return (
                <li
                  key={key}
                  className={cn(
                    'glass-panel flex flex-col gap-1.5 p-3',
                    interactive && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40',
                    selected.has(key) && 'bg-primary/5 ring-1 ring-primary/40',
                  )}
                  data-testid={`standard-table-mobile-row-${key}`}
                  {...interactiveProps}
                >
                  {selectable && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                        onClick={event => event.stopPropagation()}
                        aria-label="Select row"
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span aria-hidden>Select</span>
                    </div>
                  )}
                  {visibleColumns.map(col => {
                    const cell = col.render ? col.render(item, index) : String(getValue(item, col.key) ?? '-');
                    return (
                      <div key={col.key} className="flex items-baseline justify-between gap-3">
                        <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {col.label}
                        </span>
                        <span className={cn('break-words text-right text-sm text-foreground', col.className)}>
                          {cell}
                        </span>
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>

          {pagination}
        </>
      )}
    </div>
  );
}
