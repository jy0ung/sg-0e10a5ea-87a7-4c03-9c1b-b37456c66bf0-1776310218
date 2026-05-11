import React from 'react';
import type { DashboardCardMetric } from './types';

interface DashboardScorecardsProps {
  cards: DashboardCardMetric[];
}

export function DashboardScorecards({ cards }: DashboardScorecardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="kpi-card">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${card.iconClassName}`} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <p className={`text-2xl font-bold ${card.valueClassName}`}>{card.value}</p>
            {card.helperText && <p className="text-[11px] text-muted-foreground mt-1">{card.helperText}</p>}
          </div>
        );
      })}
    </div>
  );
}
