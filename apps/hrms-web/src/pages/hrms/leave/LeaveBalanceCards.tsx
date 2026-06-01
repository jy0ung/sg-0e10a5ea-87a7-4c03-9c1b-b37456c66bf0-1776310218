import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { LeaveType, LeaveBalance } from '@/types';
import { formatDays } from './utils';

// ── Compact per-type row ─────────────────────────────────────────────────────

function CompactBalanceRow({ lt, balance }: { lt: LeaveType; balance: LeaveBalance | null }) {
  const isUnpaid = !lt.requiresBalance;
  const entitled = balance?.entitledDays ?? 0;
  const used = balance?.usedDays ?? 0;
  const remaining = balance?.remainingDays ?? 0;
  const pct = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0;
  const isLow = !isUnpaid && !!balance && entitled > 0 && remaining <= 3;
  const isCritical = !isUnpaid && !!balance && entitled > 0 && remaining < 1;

  return (
    <div className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0">
      <div className="w-28 min-w-0 shrink-0 xl:w-32">
        <p className="truncate text-xs font-medium">{lt.name}</p>
      </div>
      {isUnpaid ? (
        <p className="flex-1 text-xs text-muted-foreground">No entitlement limit / Subject to approval</p>
      ) : !balance ? (
        <p className="flex-1 text-xs italic text-muted-foreground">Not initialized</p>
      ) : (
        <>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(0, 100 - pct)}%` }}
            />
          </div>
          <div className="flex w-16 shrink-0 items-baseline justify-end gap-0.5 tabular-nums">
            <span
              className={`text-sm font-semibold ${
                isCritical
                  ? 'text-red-600 dark:text-red-400'
                  : isLow
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground'
              }`}
            >
              {formatDays(remaining)}
            </span>
            <span className="text-xs text-muted-foreground">/{formatDays(entitled)}</span>
          </div>
          {isLow && (
            <AlertTriangle
              className={`h-3.5 w-3.5 shrink-0 ${isCritical ? 'text-red-500' : 'text-amber-500'}`}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── LeaveBalanceCards ────────────────────────────────────────────────────────

interface LeaveBalanceCardsProps {
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  leaveYear: number;
  isLoading?: boolean;
  showUninitializedAlert?: boolean;
}

export function LeaveBalanceCards({
  leaveTypes,
  leaveBalances,
  leaveYear,
  isLoading = false,
  showUninitializedAlert = true,
}: LeaveBalanceCardsProps) {
  const activeTypes = leaveTypes.filter(lt => lt.active);
  const activeWithBalance = activeTypes.filter(lt => lt.requiresBalance);
  const uninitializedCount = activeWithBalance.filter(
    lt => !leaveBalances.some(b => b.leaveTypeId === lt.id),
  ).length;

  if (isLoading) {
    return (
      <div className="space-y-2 py-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-muted/50" />
            <div className="h-1.5 flex-1 animate-pulse rounded-full bg-muted/50" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </div>
    );
  }

  if (activeTypes.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        No leave types configured. Contact HR administrator.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {showUninitializedAlert && uninitializedCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {uninitializedCount === activeWithBalance.length
              ? `Leave balances for ${leaveYear} have not been initialized.`
              : `${uninitializedCount} leave type${uninitializedCount > 1 ? 's have' : ' has'} not been initialized for ${leaveYear}.`}{' '}
            Contact your HR administrator.
          </span>
        </div>
      )}
      <div className="divide-y">
        {activeTypes.map(lt => (
          <CompactBalanceRow
            key={lt.id}
            lt={lt}
            balance={leaveBalances.find(b => b.leaveTypeId === lt.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
