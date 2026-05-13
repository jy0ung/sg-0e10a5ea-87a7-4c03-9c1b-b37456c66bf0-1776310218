import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  /** Heights of each column as Tailwind w-* fraction. Defaults to equal width. */
  colWidths?: string[];
}

/**
 * Renders an animated skeleton table for use as a page-level loading state.
 * Matches the glass-panel table pattern used across the app.
 */
export function TableSkeleton({ rows = 6, cols = 5, colWidths }: TableSkeletonProps) {
  const widths = colWidths ?? Array(cols).fill('w-full');
  return (
    <div className="glass-panel overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {widths.map((w, i) => (
              <th key={i} className="px-3 py-2">
                <Skeleton className={`h-3 ${w} rounded`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-border last:border-0">
              {widths.map((w, c) => (
                <td key={c} className="px-3 py-2.5">
                  <Skeleton className={`h-3 ${w} rounded`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
