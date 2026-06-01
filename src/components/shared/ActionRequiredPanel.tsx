import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ShieldCheck, GitMerge, Bell, Inbox as InboxIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneClass } from '@/lib/statusTones';
import { EmptyState } from '@/components/shared/PageState';
import type { InboxItem, InboxSource } from '@/services/inboxService';

const SOURCE_META: Record<InboxSource, { label: string; icon: React.ElementType }> = {
  approval:       { label: 'Approval',       icon: ShieldCheck },
  reconciliation: { label: 'Reconciliation', icon: GitMerge },
  ticket:         { label: 'Request',        icon: ClipboardList },
  notification:   { label: 'Notification',   icon: Bell },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export interface ActionRequiredPanelProps {
  items: InboxItem[];
  /** Max rows to show. */
  limit?: number;
  className?: string;
}

/**
 * "Items waiting for you" — a compact, deep-linkable list bound to the real
 * unified inbox service. Presentational only; the caller supplies items.
 */
export function ActionRequiredPanel({ items, limit = 6, className }: ActionRequiredPanelProps) {
  const navigate = useNavigate();
  const shown = items.slice(0, limit);

  if (shown.length === 0) {
    return (
      <EmptyState
        title="You're all caught up"
        description="Approvals, reconciliation matches, and requests that need you will appear here."
        icon={<InboxIcon className="h-5 w-5" aria-hidden />}
      />
    );
  }

  return (
    <ul className={cn('divide-y', className)} data-testid="action-required-list">
      {shown.map((item) => {
        const meta = SOURCE_META[item.source];
        const Icon = meta.icon;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => navigate(item.href)}
              className="flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                  {item.badge && (
                    <span className={cn('inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium', toneClass(item.badgeTone))}>
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wide">{meta.label}</span>
                  {item.subtitle && <span className="truncate">· {item.subtitle}</span>}
                </span>
              </span>
              <span className="mt-0.5 flex-shrink-0 text-xs tabular-nums text-muted-foreground">{timeAgo(item.updatedAt)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
