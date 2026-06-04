import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from './lib/utils';
import type { Tone } from './statusTones';

export interface MetricCardProps {
  /** Short uppercase eyebrow label, e.g. "Pending Approvals". */
  label: string;
  /** Primary value (already formatted). */
  value: React.ReactNode;
  /** Optional secondary line under the value. */
  hint?: string;
  /** Optional leading icon. */
  icon?: React.ElementType;
  /** Accent tone for the icon chip. */
  tone?: Tone;
  /** Optional trend delta, e.g. "+12.4%". Direction drives colour + arrow. */
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; label?: string };
  onClick?: () => void;
  /** Show a skeleton placeholder in place of the value. */
  loading?: boolean;
  className?: string;
  'data-testid'?: string;
}

const TONE_CHIP: Record<Tone, string> = {
  amber:   'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  red:     'bg-red-500/12 text-red-600 dark:text-red-400',
  blue:    'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  violet:  'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  slate:   'bg-slate-500/12 text-slate-600 dark:text-slate-300',
  muted:   'bg-primary/10 text-primary',
};

/**
 * Executive metric tile — icon chip, value, label and optional trend delta.
 * Shared primitive used by the command-center dashboard, module overviews and
 * the HRMS workspace.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'muted',
  delta,
  onClick,
  loading,
  className,
  ...rest
}: MetricCardProps) {
  const interactive = Boolean(onClick);
  const Wrapper = interactive ? 'button' : 'div';

  const deltaColor =
    delta?.direction === 'up' ? 'text-emerald-600 dark:text-emerald-400'
    : delta?.direction === 'down' ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';
  const DeltaIcon = delta?.direction === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'surface-card flex w-full flex-col gap-3 p-4 text-left',
        interactive && 'surface-card-hover cursor-pointer',
        className,
      )}
      {...rest}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', TONE_CHIP[tone])}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="space-y-1">
        {loading ? (
          <div className="h-7 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <div className="text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">{value}</div>
        )}
        <div className="flex items-center gap-2">
          {delta && (
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', deltaColor)}>
              {delta.direction !== 'flat' && <DeltaIcon className="h-3 w-3" aria-hidden />}
              {delta.value}
            </span>
          )}
          {(hint || delta?.label) && !loading && (
            <span className="truncate text-xs text-muted-foreground">{delta?.label ?? hint}</span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
