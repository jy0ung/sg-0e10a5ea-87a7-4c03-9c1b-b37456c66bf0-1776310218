import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { LeaveType, LeaveBalance } from '@/types';
import { formatDays } from './utils';

function BalanceCard({ lt, balance }: { lt: LeaveType; balance: LeaveBalance | null }) {
  const isUnpaid    = !lt.requiresBalance;
  const hasBalance  = !!balance;
  const entitled    = balance?.entitledDays  ?? 0;
  const used        = balance?.usedDays      ?? 0;
  const remaining   = balance?.remainingDays ?? 0;
  const pending     = 0; // pendingDays not on LeaveBalance type; reserved for future
  const pct         = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0;
  const isLow       = !isUnpaid && hasBalance && entitled > 0 && remaining <= 3;
  const isCritical  = !isUnpaid && hasBalance && entitled > 0 && remaining < 1;

  return (
    <div className={[
      'flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow',
      isLow ? 'border-amber-200 dark:border-amber-800' : '',
    ].join(' ')}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{lt.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isUnpaid ? 'Unpaid leave' : `${lt.daysPerYear} days/year`}
          </p>
        </div>
        {isLow && (
          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${isCritical ? 'text-red-500' : 'text-amber-500'}`} />
        )}
      </div>

      {isUnpaid ? (
        <div className="mt-auto space-y-0.5 rounded bg-muted/50 px-2 py-1.5">
          <p className="text-xs font-medium">No entitlement limit</p>
          <p className="text-xs text-muted-foreground">Subject to approval</p>
        </div>
      ) : hasBalance ? (
        <div className="mt-auto">
          <div className="mb-1 flex items-end justify-between">
            <span className={`text-xl font-bold tabular-nums leading-none ${
              isCritical ? 'text-red-600 dark:text-red-400'
              : isLow ? 'text-amber-600 dark:text-amber-400'
              : 'text-foreground'
            }`}>
              {formatDays(remaining)}
            </span>
            <span className="pb-0.5 text-xs text-muted-foreground">of {formatDays(entitled)}</span>
          </div>
          <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(0, 100 - pct)}%` }}
            />
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{formatDays(used)} used</span>
            {pending > 0 && <span className="text-amber-600 dark:text-amber-400">{formatDays(pending)} pending</span>}
          </div>
        </div>
      ) : (
        <p className="mt-auto text-xs italic text-muted-foreground">Balance pending setup</p>
      )}
    </div>
  );
}

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
      <div className="grid gap-2 sm:grid-cols-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/30" />
        ))}
      </div>
    );
  }

  if (activeTypes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No leave types configured. Contact HR administrator.</p>
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
              : `${uninitializedCount} leave type${uninitializedCount > 1 ? 's have' : ' has'} not been initialized for ${leaveYear}.`}
            {' '}Contact your HR administrator.
          </span>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {activeTypes.map(lt => (
          <BalanceCard
            key={lt.id}
            lt={lt}
            balance={leaveBalances.find(b => b.leaveTypeId === lt.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
