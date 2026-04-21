import React, { useMemo } from 'react';
import { Filter, Search, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    <div className="glass-panel p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="h-4 w-4" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide">Filters</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {activeCount} active
            </Badge>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <input
            value={state.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search chassis, customer, invoice..."
            aria-label="Search vehicles"
            className="h-8 w-64 rounded-md bg-secondary border border-border pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {state.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={state.branch} onValueChange={(v) => onChange({ branch: v })}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Branch filter">
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
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Model filter">
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
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Payment filter">
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
          <SelectTrigger className="h-8 w-52 text-xs" aria-label="Stage filter">
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
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5 mr-1" aria-hidden />
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {typeof resultCount === 'number' && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {resultCount.toLocaleString('en-US')}
              {typeof totalCount === 'number' && totalCount !== resultCount
                ? ` of ${totalCount.toLocaleString('en-US')}`
                : ''}
              {' '}result{resultCount === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-xs text-muted-foreground">Rows:</span>
          <Select
            value={String(state.pageSize)}
            onValueChange={(v) => onChange({ pageSize: Number(v) })}
          >
            <SelectTrigger className="h-8 w-20 text-xs" aria-label="Rows per page">
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
