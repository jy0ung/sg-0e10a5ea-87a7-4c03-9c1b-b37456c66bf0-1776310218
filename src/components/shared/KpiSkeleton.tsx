import { Skeleton } from '@/components/ui/skeleton';

interface KpiSkeletonProps {
  /** Number of KPI cards to render. */
  count?: number;
}

/**
 * Renders animated skeleton KPI cards matching the glass-panel pattern used
 * across all dashboard pages.
 */
export function KpiSkeleton({ count = 4 }: KpiSkeletonProps) {
  return (
    <div className={`grid gap-4 grid-cols-2 md:grid-cols-${Math.min(count, 4)}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-panel p-4 flex items-start gap-3">
          <Skeleton className="h-5 w-5 rounded mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-7 w-32 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
