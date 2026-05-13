import React from 'react';
import type { DashboardCardMetric } from './types';

interface DashboardSnapshotSectionProps {
  cards: DashboardCardMetric[];
  scopeLabel: string;
}

export function DashboardSnapshotSection({ cards, scopeLabel }: DashboardSnapshotSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.16em]">Operational Snapshot</p>
        <p className="truncate text-[11px] text-muted-foreground">{scopeLabel}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.key} className="glass-panel flex min-w-0 items-center gap-3 p-3">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${card.iconClassName}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{card.label}</p>
                <p className={`truncate text-xl font-semibold tabular-nums ${card.valueClassName}`}>{card.value}</p>
                {card.helperText && <p className="truncate text-[10px] text-muted-foreground">{card.helperText}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { DashboardCardMetric };
