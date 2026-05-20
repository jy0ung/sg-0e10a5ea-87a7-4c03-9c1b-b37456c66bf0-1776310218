/**
 * StandardTable — sortable, filterable, paginated data table.
 *
 * A consistent table shell for admin/list pages. Wraps the design-system
 * glass-panel pattern with:
 *   - Per-column sort (click header, toggles asc/desc)
 *   - Single global text filter (searches all string-valued columns)
 *   - Client-side pagination with configurable page sizes
 *   - Optional row selection with bulk-action slot
 *
 * No additional dependencies — all logic is done with useMemo in the
 * component; no @tanstack/react-table required.
 *
 * @example
 * <StandardTable
 *   data={branches}
 *   columns={[
 *     { key: 'code', label: 'Code' },
 *     { key: 'name', label: 'Name' },
 *     { key: 'actions', label: '', render: (item) => <ActionsMenu item={item} />, sortable: false },
 *   ]}
 * />
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StandardTableColumn<T> {
  key: string;
  label: string;
  /** Custom cell renderer. Falls back to `String(item[key] ?? '—')`. */
  render?: (item: T, index: number) => React.ReactNode;
  /** Whether this column is sortable. Defaults to `true`. */
  sortable?: boolean;
  /** Tailwind className applied to both `<th>` and `<td>`. */
  className?: string;
}

export interface StandardTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: StandardTableColumn<T>[];
  /** Placeholder for the global search box. */
  searchPlaceholder?: string;
  /** Disable the search bar entirely. */
  hideSearch?: boolean;
  /** Page sizes available in the dropdown. Defaults to [10, 25, 50]. */
  pageSizes?: number[];
  /** Empty state message. */
  emptyMessage?: string;
  /** Called when a row is clicked. */
  onRowClick?: (item: T) => void;
  /** When true, shows a checkbox in the first column for each row. */
  selectable?: boolean;
  /** Currently selected row keys (values of `rowKey` field). */
  selected?: Set<string>;
  /** Field used to derive a unique key per row. Defaults to 'id'. */
  rowKey?: string;
  /** Called when the selection set changes. */
  onSelectionChange?: (selected: Set<string>) => void;
  /** Slot rendered above the table when rows are selected (bulk actions bar). */
  bulkActions?: (selected: Set<string>, clearSelection: () => void) => React.ReactNode;
  className?: string;
}

type SortDir = 'asc' | 'desc';

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZES = [10, 25, 50];

export function StandardTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchPlaceholder = 'Search…',
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
}: StandardTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());

  const selected = controlledSelected ?? internalSelected;
  const setSelected = (next: Set<string>) => {
    setInternalSelected(next);
    onSelectionChange?.(next);
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.trim().toLowerCase();
    return data.filter(item =>
      columns.some(col => {
        const val = item[col.key];
        return typeof val === 'string' && val.toLowerCase().includes(term);
      }),
    );
  }, [data, columns, search]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  // Reset to page 1 when filter or sort changes
  const handleSearch = (value: string) => { setSearch(value); setPage(1); };
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const pageKeys = pageData.map(item => String(item[rowKey] ?? ''));
  const allPageSelected = pageKeys.length > 0 && pageKeys.every(k => selected.has(k));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allPageSelected) { pageKeys.forEach(k => next.delete(k)); }
    else { pageKeys.forEach(k => next.add(k)); }
    setSelected(next);
  };
  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
  };
  const clearSelection = () => setSelected(new Set());

  // ── Render helpers ────────────────────────────────────────────────────────
  const SortIcon = ({ col }: { col: StandardTableColumn<T> }) => {
    if (col.sortable === false) return null;
    if (sortKey !== col.key) return <ChevronsUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1 text-primary" />
      : <ChevronDown className="h-3 w-3 ml-1 text-primary" />;
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Toolbar */}
      {(!hideSearch || selectable) && (
        <div className="flex items-center gap-3 flex-wrap">
          {!hideSearch && (
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                value={search}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      )}

      {/* Bulk action bar */}
      {selectable && selected.size > 0 && bulkActions && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-xs font-medium text-primary">{selected.size} selected</span>
          {bulkActions(selected, clearSelection)}
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
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
                  {columns.map(col => (
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
                {pageData.map((item, idx) => {
                  const key = String(item[rowKey] ?? idx);
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
                        <td className="w-10 px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggleRow(key)}
                            aria-label="Select row"
                            className="h-3.5 w-3.5 accent-primary"
                          />
                        </td>
                      )}
                      {columns.map(col => (
                        <td key={col.key} className={cn('px-4 py-3 text-foreground', col.className)}>
                          {col.render
                            ? col.render(item, idx)
                            : String(item[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/10">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={v => { setPageSize(Number(v)); setPage(1); }}
                >
                  <SelectTrigger className="h-7 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizes.map(s => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-2">
                  {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
                </span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(1)} aria-label="First page">«</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page">‹</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next page">›</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)} aria-label="Last page">»</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
