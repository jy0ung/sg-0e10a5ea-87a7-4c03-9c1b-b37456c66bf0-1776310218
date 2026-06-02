import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { loadInbox, type InboxItem, type InboxSource, type InboxTone } from '@/services/inboxService';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowRight, Bell, ClipboardList, GitMerge, Inbox as InboxIcon, ShieldCheck } from 'lucide-react';

const SOURCE_META: Record<InboxSource, { label: string; icon: typeof InboxIcon }> = {
  approval:       { label: 'Approvals',      icon: ShieldCheck },
  reconciliation: { label: 'Reconciliation', icon: GitMerge },
  ticket:         { label: 'Requests',       icon: ClipboardList },
  notification:   { label: 'Notifications',  icon: Bell },
};

const TONE_CLASSES: Record<InboxTone, string> = {
  amber:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  red:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  blue:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  muted:   'bg-muted text-muted-foreground',
};

type FilterValue = 'all' | InboxSource;

export default function Inbox() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const canUseInbox = useFeatureFlag('phase4.unified-inbox', false);
  const [filter, setFilter] = useState<FilterValue>('all');

  const companyId = user?.companyId ?? '';
  const includeReconciliation = hasRole(['super_admin', 'company_admin', 'director']);

  const query = useQuery({
    queryKey: ['unified-inbox', companyId, user?.id, includeReconciliation],
    queryFn: () => loadInbox(companyId, {
      approver: user ? {
        id: user.id,
        hrmsRoleIds: hrmsAccess.roleIds,
        hrmsRoleCodes: hrmsAccess.roleCodes,
        canApproveRequests: hrmsAccess.canApproveRequests,
      } : null,
      userId: user!.id,
      includeReconciliation,
      perSourceLimit: 50,
    }),
    enabled: !!companyId && !!user?.id && canUseInbox,
    staleTime: 30_000,
  });

  const filtered = useMemo<InboxItem[]>(() => {
    const all = query.data?.items ?? [];
    return filter === 'all' ? all : all.filter(i => i.source === filter);
  }, [query.data?.items, filter]);

  if (!canUseInbox) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Inbox"
          description="Unified workspace for approvals, reconciliation, requests, and notifications"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Inbox' }]}
        />
        <FeatureUnavailableState routeId="platform-inbox" data-testid="inbox-feature-off" />
      </div>
    );
  }

  if (query.isLoading) return <TableSkeleton />;
  if (query.isError)   return <PageErrorState error={query.error} />;

  const counts = query.data?.counts ?? { approval: 0, reconciliation: 0, ticket: 0, notification: 0, total: 0 };
  const errors = query.data?.errors ?? [];

  const FilterChip = ({ value, label, count }: { value: FilterValue; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      data-testid={`inbox-filter-${value}`}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        filter === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary/40'
      }`}
    >
      {label}
      <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full text-[10px] px-1 ${
        filter === value ? 'bg-primary-foreground/20' : 'bg-background/60'
      }`}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Inbox"
        description={`${counts.total} item${counts.total === 1 ? '' : 's'} pending your attention`}
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Inbox' }]}
      />

      <div className="glass-panel p-4 flex flex-wrap gap-2" role="tablist" aria-label="Inbox filters">
        <FilterChip value="all"            label="All"            count={counts.total} />
        <FilterChip value="approval"       label="Approvals"      count={counts.approval} />
        {includeReconciliation && (
          <FilterChip value="reconciliation" label="Reconciliation" count={counts.reconciliation} />
        )}
        <FilterChip value="ticket"         label="Requests"       count={counts.ticket} />
        <FilterChip value="notification"   label="Notifications"  count={counts.notification} />
      </div>

      {errors.length > 0 && (
        <div className="glass-panel border-l-4 border-amber-500 p-3 text-xs text-muted-foreground" data-testid="inbox-partial-errors">
          <p className="font-medium text-foreground mb-1">Some sources failed to load:</p>
          <ul className="list-disc pl-5">{errors.map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing in your inbox"
          description="You're all caught up. New approvals, reconciliation matches, requests, and alerts will appear here."
          icon={<InboxIcon className="h-5 w-5" aria-hidden />}
        />
      ) : (
        <div className="space-y-2" data-testid="inbox-list">
          {filtered.map(item => {
            const Meta = SOURCE_META[item.source];
            const Icon = Meta.icon;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => navigate(item.href)}
                data-testid={`inbox-item-${item.source}`}
                className={`glass-panel w-full text-left p-4 flex items-start gap-3 transition-colors hover:bg-secondary/30 ${
                  item.unread ? 'border-l-2 border-primary' : ''
                }`}
              >
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{Meta.label}</span>
                    {item.badge && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_CLASSES[item.badgeTone ?? 'muted']}`}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
                  {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.updatedAt).toLocaleString()}</p>
                </div>
                <ArrowRight className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
