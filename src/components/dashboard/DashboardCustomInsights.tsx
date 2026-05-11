import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  CUSTOM_INSIGHT_DEFINITIONS,
  type PersonalDashboardCustomFormula,
  type PersonalDashboardCustomMetric,
  type DashboardMetricResult,
} from '@/lib/personalDashboard';
import { CustomKpiCard } from '@/components/CustomKpiCard';
import type { CustomKpiEvaluation } from '@/lib/customKpiFormula';

export type DashboardCustomWidget = PersonalDashboardCustomMetric | PersonalDashboardCustomFormula;

interface DashboardCustomInsightsProps {
  widgets: DashboardCustomWidget[];
  scopeLabel: string;
  customMetricResults: Map<string, DashboardMetricResult>;
  customFormulaResults: Map<string, CustomKpiEvaluation>;
  onRemove: (widgetId: string) => void;
}

export function DashboardCustomInsights({
  widgets,
  scopeLabel,
  customMetricResults,
  customFormulaResults,
  onRemove,
}: DashboardCustomInsightsProps) {
  return (
    <div className="glass-panel p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Custom Insights</p>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mt-1">
            <Sparkles className="h-4 w-4 text-primary" />
            Personal KPI Builder
          </h3>
          <p className="text-sm text-muted-foreground">Track the signals that matter to you in the same scope as the rest of the dashboard.</p>
        </div>
        <p className="text-[11px] text-muted-foreground">{scopeLabel}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {widgets.map(widget => {
          if (widget.type === 'custom-formula') {
            const evaluation = customFormulaResults.get(widget.id);
            if (!evaluation) return null;
            return (
              <CustomKpiCard
                key={widget.id}
                title={widget.title}
                formula={widget.formula}
                evaluation={evaluation}
                onRemove={() => onRemove(widget.id)}
              />
            );
          }

          const definition = CUSTOM_INSIGHT_DEFINITIONS.find(item => item.id === widget.metricId);
          const result = customMetricResults.get(widget.id);

          return (
            <div key={widget.id} className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${definition?.accentClassName ?? 'bg-primary/10 text-primary'}`}>
                  {definition?.label ?? 'Custom Insight'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">{widget.title}</p>
                <p className="text-3xl font-bold text-foreground">{result?.value ?? '—'}</p>
                <p className="text-sm font-medium text-foreground/80">{result?.detail ?? definition?.emptyLabel ?? 'No data'}</p>
                <p className="text-xs text-muted-foreground">{result?.helperText ?? definition?.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
