import React from 'react';
import type { DashboardCardMetric } from './types';

interface DashboardSnapshotSectionProps {
  cards: DashboardCardMetric[];
  scopeLabel: string;
}

export function DashboardSnapshotSection({ cards, scopeLabel }: DashboardSnapshotSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Operational Snapshot</p>
        <p className="text-[11px] text-muted-foreground">{scopeLabel}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.key} className="glass-panel p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.iconClassName}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className={`text-xl font-bold ${card.valueClassName}`}>{card.value}</p>
                {card.helperText && <p className="text-[10px] text-muted-foreground">{card.helperText}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { DashboardCardMetric };
