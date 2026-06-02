import { cn } from '@/lib/utils';
import { toneClass } from '@/lib/statusTones';
import { statusMeta, type StatusDomain } from '@/lib/hrmsStatus';

interface StatusBadgeProps {
  status: string;
  /** Disambiguate statuses shared by multiple domains (e.g. `pending`). */
  domain?: StatusDomain;
  /** Override the resolved label. */
  label?: string;
  className?: string;
}

/**
 * Consistent HRMS status chip. Resolves label + tone from the central
 * {@link statusMeta} registry so every surface renders the same colours.
 */
export function StatusBadge({ status, domain, label, className }: StatusBadgeProps) {
  const meta = statusMeta(status, domain);
  return (
    <span className={cn('status-badge', toneClass(meta.tone), className)}>
      {label ?? meta.label}
    </span>
  );
}
