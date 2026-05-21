import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Infinity as InfinityIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaveBalance, LeaveType } from '@/types';

interface LeaveBalanceCardsProps {
  balances: LeaveBalance[];
  leaveTypes: LeaveType[];
  compact?: boolean;
}

function getProgressColor(remaining: number, entitled: number): string {
  if (entitled === 0) return 'bg-muted';
  const pct = remaining / entitled;
  if (pct > 0.5) return '[&>div]:bg-emerald-500';
  if (pct > 0.2) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

function isUnpaidType(lt: LeaveType): boolean {
  return lt.code === 'UNPAID' || lt.daysPerYear === 0;
}

export default function LeaveBalanceCards({ balances, leaveTypes, compact }: LeaveBalanceCardsProps) {
  const currentYear = new Date().getFullYear();
  const hasAnyBalance = balances.length > 0;
  const paidTypes = leaveTypes.filter(lt => !isUnpaidType(lt));
  const unpaidTypes = leaveTypes.filter(lt => isUnpaidType(lt));

  // Check if balances exist for paid types
  const paidTypesWithoutBalance = paidTypes.filter(
    lt => !balances.some(b => b.leaveTypeId === lt.id)
  );
  const showUninitializedAlert = paidTypesWithoutBalance.length > 0 && !hasAnyBalance;

  return (
    <div className="space-y-2">
      {showUninitializedAlert && (
        <Alert variant="default" className="border-amber-200 dark:border-amber-800/40 bg-amber-500/5 py-2.5 px-3">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
            Leave balances for {currentYear} have not been initialized. Contact HR administrator.
          </AlertDescription>
        </Alert>
      )}

      <div className={cn(
        'grid gap-2',
        compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
      )}>
        {paidTypes.map(lt => {
          const balance = balances.find(b => b.leaveTypeId === lt.id);
          return (
            <BalanceCard
              key={lt.id}
              leaveType={lt}
              balance={balance}
              compact={compact}
              showUninitializedState={!balance && showUninitializedAlert}
            />
          );
        })}
        {unpaidTypes.map(lt => (
          <UnpaidCard key={lt.id} leaveType={lt} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function BalanceCard({
  leaveType,
  balance,
  compact,
  showUninitializedState,
}: {
  leaveType: LeaveType;
  balance?: LeaveBalance;
  compact?: boolean;
  showUninitializedState?: boolean;
}) {
  if (!balance) {
    return (
      <div className={cn(
        'rounded-lg border border-border/50 bg-card/50',
        compact ? 'p-2.5' : 'p-3'
      )}>
        <div className="flex items-center justify-between">
          <span className={cn('font-medium text-foreground/70', compact ? 'text-[11px]' : 'text-xs')}>
            {leaveType.name}
          </span>
          <span className={cn('text-muted-foreground/50', compact ? 'text-[10px]' : 'text-[11px]')}>
            {leaveType.daysPerYear}d
          </span>
        </div>
        <p className={cn('text-muted-foreground/60 mt-1', compact ? 'text-[10px]' : 'text-[11px]')}>
          {showUninitializedState ? 'Balance pending setup' : 'Not configured'}
        </p>
      </div>
    );
  }

  const pctUsed = balance.entitledDays > 0
    ? Math.round((balance.usedDays / balance.entitledDays) * 100)
    : 0;

  return (
    <div className={cn(
      'rounded-lg border border-border/60 bg-card transition-colors',
      compact ? 'p-2.5' : 'p-3'
    )}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn('font-medium text-foreground', compact ? 'text-[11px]' : 'text-xs')}>
          {leaveType.name}
        </span>
        <span className={cn('font-semibold text-foreground', compact ? 'text-xs' : 'text-sm')}>
          {balance.remainingDays}
          <span className="text-muted-foreground font-normal">/{balance.entitledDays}d</span>
        </span>
      </div>
      <Progress
        value={pctUsed}
        className={cn('h-1.5 bg-muted/50', getProgressColor(balance.remainingDays, balance.entitledDays))}
      />
      <div className={cn(
        'flex items-center gap-3 mt-1.5 text-muted-foreground',
        compact ? 'text-[10px]' : 'text-[11px]'
      )}>
        <span>{balance.remainingDays} avail</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{balance.usedDays} used</span>
      </div>
    </div>
  );
}

function UnpaidCard({ leaveType, compact }: { leaveType: LeaveType; compact?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border border-dashed border-border/50 bg-card/30',
      compact ? 'p-2.5' : 'p-3'
    )}>
      <div className="flex items-center justify-between">
        <span className={cn('font-medium text-foreground/70', compact ? 'text-[11px]' : 'text-xs')}>
          {leaveType.name}
        </span>
        <InfinityIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>
      <p className={cn('text-muted-foreground/60 mt-0.5', compact ? 'text-[10px]' : 'text-[11px]')}>
        No entitlement limit · Subject to approval
      </p>
    </div>
  );
}
