import { cn } from '@/lib/utils';

interface StageLabelProps {
  /** Current workflow stage, e.g. "Waiting for GM". Hidden when empty. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Secondary caption that pairs with a {@link StatusBadge} to show the current
 * workflow stage without exposing the full approval chain in list rows.
 */
export function StageLabel({ children, className }: StageLabelProps) {
  if (!children) return null;
  return (
    <span className={cn('block truncate text-xs text-muted-foreground', className)}>
      {children}
    </span>
  );
}
