import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DASHBOARD_PERIOD_OPTIONS, getDashboardScopeSummary, type DashboardPeriod } from '@/lib/dashboardFilters';

interface BranchPeriodFilterProps {
  branches: string[];
  branch: string;
  period: DashboardPeriod;
  model?: string;
  models?: string[];
  onBranchChange: (value: string) => void;
  onPeriodChange: (value: DashboardPeriod) => void;
  onModelChange?: (value: string) => void;
  branchLabel?: string;
  periodLabel?: string;
  modelLabel?: string;
  allBranchLabel?: string;
  allModelLabel?: string;
}

export function BranchPeriodFilter({
  branches,
  branch,
  period,
  model = 'all',
  models = [],
  onBranchChange,
  onPeriodChange,
  onModelChange,
  branchLabel = 'Branch',
  periodLabel = 'Date period',
  modelLabel = 'Model',
  allBranchLabel = 'All branches',
  allModelLabel = 'All models',
}: BranchPeriodFilterProps) {
  const hasModelFilter = models.length > 0 && Boolean(onModelChange);
  const activeCount = (branch !== 'all' ? 1 : 0) + (period !== 'all_time' ? 1 : 0) + (hasModelFilter && model !== 'all' ? 1 : 0);
  const summary = getDashboardScopeSummary(
    { branch, period, model },
    { allBranchLabel, allModelLabel },
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter</span>
          {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Advanced Filter</h3>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{branchLabel}</label>
            <Select value={branch} onValueChange={onBranchChange}>
              <SelectTrigger>
                <SelectValue placeholder={allBranchLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{allBranchLabel}</SelectItem>
                {branches.map(branchCode => (
                  <SelectItem key={branchCode} value={branchCode}>{branchCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{periodLabel}</label>
            <Select value={period} onValueChange={(value) => onPeriodChange(value as DashboardPeriod)}>
              <SelectTrigger>
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                {DASHBOARD_PERIOD_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasModelFilter && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{modelLabel}</label>
              <Select value={model} onValueChange={onModelChange}>
                <SelectTrigger>
                  <SelectValue placeholder={allModelLabel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{allModelLabel}</SelectItem>
                  {models.map(modelName => (
                    <SelectItem key={modelName} value={modelName}>{modelName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            disabled={activeCount === 0}
            onClick={() => {
              onBranchChange('all');
              onPeriodChange('all_time');
              onModelChange?.('all');
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}