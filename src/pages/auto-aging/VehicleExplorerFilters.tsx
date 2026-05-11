import React, { useMemo } from 'react';
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

import { VEHICLE_STAGES, VEHICLE_STAGE_LABELS } from '@/utils/vehicleStage';

export interface VehicleFilterState {
  search: string;
  branch: string;
  model: string;
  payment: string;
  stage: string;
  pageSize: number;
}

export interface VehicleExplorerFiltersProps {
  state: VehicleFilterState;
  onChange: (next: Partial<VehicleFilterState>) => void;
  branches: readonly string[];
  models: readonly string[];
  payments: readonly string[];
  pageSizeOptions: readonly number[];
  /** Count of rows after filtering — shown as a chip. */
  resultCount?: number;
  /** Total unfiltered rows available — shown as context. */
  totalCount?: number;
  /** Baseline pageSize used to determine whether the filter is "active". */
  defaultPageSize?: number;
}

const DEFAULT_STATE: VehicleFilterState = {
  search: '',
  branch: 'all',
  model: 'all',
  payment: 'all',
  stage: 'all',
  pageSize: 50,
};

/**
 * Filters strip for VehicleExplorer. Consolidates search, segment filters,
 * page size, active-filter summary, and a quick "Clear" affordance so the
 * table body can render with no top toolbar of its own.
 */
export function VehicleExplorerFilters({
  state,
  onChange,
  branches,
  models,
  payments,
  pageSizeOptions,
  resultCount,
  totalCount,
  defaultPageSize = DEFAULT_STATE.pageSize,
}: VehicleExplorerFiltersProps) {
  const activeCount = useMemo(() => {
    let n = 0;
    if (state.search.trim()) n++;
    if (state.branch !== 'all') n++;
    if (state.model !== 'all') n++;
    if (state.payment !== 'all') n++;
    if (state.stage !== 'all') n++;
    return n;
  }, [state]);

  const handleClear = () => {
    onChange({
      search: '',
      branch: 'all',
      model: 'all',
      payment: 'all',
      stage: 'all',
      pageSize: defaultPageSize,
    });
  };

  return (
    <div className="mb-4 rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground">Drill filters</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Search and segment vehicle aging results</p>
          </div>
        </div>
        {typeof resultCount === 'number' && (
          <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums">
            {resultCount.toLocaleString('en-US')}
            {typeof totalCount === 'number' && totalCount !== resultCount
              ? ` of ${totalCount.toLocaleString('en-US')}`
              : ''}
            {' '}result{resultCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">

        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            value={state.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search chassis, customer, invoice..."
            aria-label="Search vehicles"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9 pr-8"
          />
          {state.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={state.branch} onValueChange={(v) => onChange({ branch: v })}>
          <SelectTrigger className="h-9 w-[9.5rem] text-sm" aria-label="Branch filter">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={state.model} onValueChange={(v) => onChange({ model: v })}>
          <SelectTrigger className="h-9 w-[9.5rem] text-sm" aria-label="Model filter">
            <SelectValue placeholder="All Models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {models.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={state.payment} onValueChange={(v) => onChange({ payment: v })}>
          <SelectTrigger className="h-9 w-[10.5rem] text-sm" aria-label="Payment filter">
            <SelectValue placeholder="All Payments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            {payments.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={state.stage} onValueChange={(v) => onChange({ stage: v })}>
          <SelectTrigger className="h-9 w-[12rem] text-sm" aria-label="Stage filter">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {VEHICLE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{VEHICLE_STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm"
            onClick={handleClear}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
            Reset
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows:</span>
          <Select
            value={String(state.pageSize)}
            onValueChange={(v) => onChange({ pageSize: Number(v) })}
          >
            <SelectTrigger className="h-9 w-20 text-sm" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((s) => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
