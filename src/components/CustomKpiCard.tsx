import React from 'react';
import { Sparkles, Target, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { CustomKpiEvaluation, CustomKpiFormula } from '@/lib/customKpiFormula';
import { CUSTOM_KPI_AGGREGATION_LABELS, CUSTOM_KPI_SOURCE_LABELS } from '@/lib/customKpiFormula';

export interface CustomKpiCardProps {
  title: string;
  formula: CustomKpiFormula;
  evaluation: CustomKpiEvaluation;
  onEdit?: () => void;
  onRemove?: () => void;
}

export function CustomKpiCard({ title, formula, evaluation, onEdit, onRemove }: CustomKpiCardProps) {
  const summary = formatFormulaSummary(formula);
  const accentClass = evaluation.meetsTarget === true
    ? 'text-success'
    : evaluation.meetsTarget === false
      ? 'text-warning'
      : 'text-foreground';

  return (
    <div className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest">
            <Sparkles className="h-3 w-3 inline mr-1" />My KPI
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} aria-label={`Edit ${title}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onRemove && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove} aria-label={`Remove ${title}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground truncate" title={title}>{title}</p>
        <p className={`text-3xl font-bold ${accentClass}`}>{evaluation.value}</p>
        {evaluation.detail && (
          <p className="text-sm text-foreground/80 truncate" title={evaluation.detail}>{evaluation.detail}</p>
        )}
        <p className="text-xs text-muted-foreground">{evaluation.helperText}</p>
      </div>
      {formula.target && typeof evaluation.progress === 'number' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Target className="h-3 w-3" />Target {formula.target.comparison === 'gte' ? '≥' : '≤'} {formula.target.value}</span>
            <span>{evaluation.progress}%</span>
          </div>
          <Progress value={evaluation.progress} className="h-1.5" />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-2 truncate" title={summary}>
        {summary}
      </p>
    </div>
  );
}

function formatFormulaSummary(formula: CustomKpiFormula): string {
  const agg = CUSTOM_KPI_AGGREGATION_LABELS[formula.aggregation].toLowerCase();
  const source = CUSTOM_KPI_SOURCE_LABELS[formula.source].toLowerCase();
  const head = formula.aggregation === 'count'
    ? `${agg} ${source}`
    : `${agg} of ${formula.field ?? '?'} in ${source}`;
  const filterCount = formula.filters.length;
  const group = formula.groupBy ? ` • by ${formula.groupBy} (${formula.sort ?? 'desc'})` : '';
  const filters = filterCount > 0 ? ` • ${filterCount} filter${filterCount === 1 ? '' : 's'}` : '';
  return `${head}${group}${filters}`;
}
