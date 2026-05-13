import React from 'react';
import type { DashboardCardMetric } from './types';

interface DashboardScorecardsProps {
  cards: DashboardCardMetric[];
}

export function DashboardScorecards({ cards }: DashboardScorecardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="kpi-card min-w-0">
            <div className="mb-3 flex items-start justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{card.label}</span>
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className={`h-4 w-4 ${card.iconClassName}`} />
              </span>
            </div>
            <p className={`truncate text-2xl font-semibold tabular-nums tracking-tight ${card.valueClassName}`} title={String(card.value)}>{card.value}</p>
            {card.helperText && <p className="mt-1 truncate text-[11px] text-muted-foreground" title={card.helperText}>{card.helperText}</p>}
          </div>
        );
      })}
    </div>
  );
}
