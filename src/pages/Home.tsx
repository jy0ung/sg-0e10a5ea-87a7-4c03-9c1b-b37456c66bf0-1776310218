import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MetricCard } from '@/components/shared/MetricCard';
import { SectionCard } from '@/components/shared/SectionCard';
import { ActionRequiredPanel } from '@/components/shared/ActionRequiredPanel';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getRoleHomeKpis, type RoleHomeKpi } from '@/services/kpiHomeService';
import { getNotifications } from '@flc/platform-services';
import { listDeals, getStageLabel, getStageOrder } from '@/services/dealService';
import { loadInbox } from '@/services/inboxService';
import { hrefForKpi } from './home/hrefForKpi';
import { isHrmsWorkspacePath, openDedicatedHrmsWorkspace } from '@/lib/hrmsWorkspace';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Brain,
  Briefcase,
  ChevronRight,
  ClipboardList,
  Clock,
  DollarSign,
  HeadphonesIcon,
  Inbox as InboxIcon,
  LayoutGrid,
  Package,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react';

const moduleIconMap: Record<string, React.ElementType> = {
  Timer,
  DollarSign,
  TrendingUp,
  Settings,
  Package,
  Users,
  UserCheck,
  Brain,
  Briefcase,
  BarChart3,
  Truck,
  HeadphonesIcon,
};

interface ModuleSection {
  id: string;
  title: string;
  subtitle: string;
  moduleIds: string[];
  accent: string;
  iconColor: string;
}

const MODULE_SECTIONS: ModuleSection[] = [
  {
    id: 'operations',
    title: 'Operations',
    subtitle: 'Vehicle lifecycle, inventory, and procurement workflows.',
    moduleIds: ['auto-aging', 'inventory', 'purchasing'],
    accent: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
  },
  {
    id: 'commercial',
    title: 'Commercial',
    subtitle: 'Sales performance, financial intelligence, and reporting.',
    moduleIds: ['sales', 'reports'],
    accent: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
  },
  {
    id: 'people',
    title: 'People & Administration',
    subtitle: 'Employee management, user access, and configuration.',
    moduleIds: ['hrms', 'admin', 'support'],
    accent: 'bg-violet-500/15',
    iconColor: 'text-violet-500',
  },
];

function formatRoleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { modules, loading: modulesLoading } = useModuleAccess();
  const hrmsAccess = useHrmsAccess();
  const canUseInbox = useFeatureFlag('phase4.unified-inbox', false);

  const companyId = user?.companyId ?? '';
  const role = user?.role ?? 'creator_updater';
  const includeReconciliation = hasRole(['super_admin', 'company_admin', 'director']);

  const kpiQuery = useQuery({
    queryKey: ['role-home-kpis', companyId, role],
    queryFn: async () => {
      const r = await getRoleHomeKpis(companyId, role);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', user?.id ?? ''],
    queryFn: async () => {
      const r = await getNotifications(user!.id);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const dealActionsQuery = useQuery({
    queryKey: ['home-deal-actions', companyId, user?.id],
    queryFn: async () => {
      const { data, error } = await listDeals({
        company_id: companyId,
        sales_advisor_id: user!.id,
        limit: 50,
      });
      if (error) throw error;
      return data.filter(d => d.stage !== 'completed');
    },
    enabled: !!companyId && !!user?.id,
    staleTime: 30_000,
  });

  const pipelineQuery = useQuery({
    queryKey: ['home-pipeline', companyId],
    queryFn: async () => {
      const { data, error } = await listDeals({
        company_id: companyId,
        limit: 500,
      });
      if (error) throw error;
      const active = data.filter(d => d.stage !== 'completed');
      const stages = getStageOrder().filter(s => s !== 'completed');
      return stages.map(stage => ({
        stage,
        label: getStageLabel(stage),
        count: active.filter(d => d.stage === stage).length,
        value: active.filter(d => d.stage === stage).reduce((s, d) => s + (d.total_amount || 0), 0),
      }));
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const inboxQuery = useQuery({
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
      perSourceLimit: 25,
    }),
    enabled: !!companyId && !!user?.id && canUseInbox,
    staleTime: 30_000,
  });

  const moduleById = useMemo(
    () => Object.fromEntries(modules.map(m => [m.id, m])),
    [modules],
  );
  const roadmapModules = useMemo(
    () => modules.filter(m => m.status !== 'active'),
    [modules],
  );
  const activeModuleCount = useMemo(
    () => modules.filter(m => m.status === 'active').length,
    [modules],
  );

  function openModule(path?: string) {
    if (!path) return;
    if (isHrmsWorkspacePath(path)) {
      openDedicatedHrmsWorkspace(path);
      return;
    }
    navigate(path);
  }

  const firstName = user?.name?.split(' ')[0];
  const kpis: RoleHomeKpi[] = kpiQuery.data ?? [];
  const counts = inboxQuery.data?.counts;
  const inboxItems = inboxQuery.data?.items ?? [];
  const unreadCount = (notificationsQuery.data ?? []).filter(n => !n.read).length;
  const dash = (n: number | undefined) => (n === undefined ? '—' : String(n));
  const myDeals = dealActionsQuery.data ?? [];
  const stalledDeals = myDeals.filter(d => {
    const days = Math.floor((Date.now() - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
    return days > 7;
  });
  const urgentDeals = stalledDeals.slice(0, 5);
  const pipelineData = pipelineQuery.data ?? [];
  const totalPipelineValue = pipelineData.reduce((s, p) => s + p.value, 0);
  const totalPipelineCount = pipelineData.reduce((s, p) => s + p.count, 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Executive hero */}
      <header className="hero-gradient surface-card flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">{formatRoleLabel(role)} workspace</p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground">
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what needs your attention across the business today.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/portal/tickets/new')}>
            <HeadphonesIcon className="mr-1.5 h-4 w-4" aria-hidden />
            New request
          </Button>
          <Button size="sm" onClick={() => navigate(canUseInbox ? '/inbox' : '/notifications')}>
            <InboxIcon className="mr-1.5 h-4 w-4" aria-hidden />
            Open inbox
          </Button>
        </div>
      </header>

      {/* Metric strip — real signals only */}
      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pending Approvals"
          value={canUseInbox ? dash(counts?.approval) : '—'}
          hint={canUseInbox ? 'Awaiting your decision' : 'Inbox not enabled'}
          icon={ShieldCheck}
          tone="amber"
          onClick={canUseInbox ? () => navigate('/inbox') : undefined}
          data-testid="home-metric-approvals"
        />
        <MetricCard
          label="Open Requests"
          value={canUseInbox ? dash(counts?.ticket) : '—'}
          hint="Internal service tickets"
          icon={ClipboardList}
          tone="blue"
          onClick={() => navigate(canUseInbox ? '/inbox' : '/portal/tickets')}
          data-testid="home-metric-requests"
        />
        <MetricCard
          label="Notifications"
          value={notificationsQuery.isLoading ? '…' : dash(unreadCount)}
          hint="Unread alerts"
          icon={Bell}
          tone="violet"
          onClick={() => navigate('/notifications')}
          data-testid="home-metric-notifications"
        />
        <MetricCard
          label="Active Modules"
          value={modulesLoading ? '…' : dash(activeModuleCount)}
          hint="Enabled for your company"
          icon={LayoutGrid}
          tone="emerald"
          data-testid="home-metric-modules"
        />
      </section>

      {/* My Action Items */}
      {myDeals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Action Items</h2>
              <p className="mt-1 text-xs text-muted-foreground">{myDeals.length} deals requiring your attention</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/sales/deals')}>
              View all deals
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {urgentDeals.map(deal => {
              const days = Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
              return (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => navigate(`/sales/deals/${deal.id}`)}
                  className="surface-card surface-card-hover flex flex-col gap-1.5 p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{deal.customer_name}</span>
                    <span className={`text-xs font-medium ${days > 7 ? 'text-destructive' : 'text-muted-foreground'}`}>{days}d</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{deal.model_name || '—'} {deal.variant}</p>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {getStageLabel(deal.stage)}
                    </span>
                    {deal.total_amount && (
                      <span className="text-xs font-medium text-foreground">RM {deal.total_amount.toLocaleString()}</span>
                    )}
                  </div>
                </button>
              );
            })}
            {stalledDeals.length > 5 && (
              <button
                type="button"
                onClick={() => navigate('/sales/deals')}
                className="surface-card surface-card-hover flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground"
              >
                +{stalledDeals.length - 5} more stalled deals
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </section>
      )}

      {/* Pipeline Overview */}
      {pipelineData.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Overview</h2>
              <p className="mt-1 text-xs text-muted-foreground">{totalPipelineCount} active deals · RM {(totalPipelineValue / 1000).toFixed(0)}k total value</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/sales/pipeline')}>
              Open pipeline
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {pipelineData.filter(p => p.count > 0).map(item => (
              <button
                key={item.stage}
                type="button"
                onClick={() => navigate('/sales/deals?stage=' + item.stage)}
                className="surface-card surface-card-hover flex-shrink-0 flex flex-col gap-1 p-3 min-w-[120px] text-left"
              >
                <span className="text-lg font-bold text-foreground">{item.count}</span>
                <span className="text-xs text-muted-foreground truncate">{item.label}</span>
                {item.value > 0 && (
                  <span className="text-[10px] text-muted-foreground">RM {(item.value / 1000).toFixed(0)}k</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* System Alerts */}
      {stalledDeals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Alerts</h2>
            <Badge variant="destructive" className="text-[10px]">{stalledDeals.length}</Badge>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {stalledDeals.length} deal{stalledDeals.length > 1 ? 's' : ''} stuck for over 7 days
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              These deals need attention. Review and advance or escalate.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate('/sales/deals')}>
              Review stalled deals
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </section>
      )}

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          <SectionCard
            title="Action required"
            description="Items waiting for you"
            icon={InboxIcon}
            action={canUseInbox ? { label: 'Open inbox', to: '/inbox' } : undefined}
            bodyClassName="py-1"
          >
            {!canUseInbox ? (
              <EmptyState
                title="Unified inbox not enabled"
                description="Approvals, reconciliation, and requests appear here once the inbox is enabled for your company."
                icon={<InboxIcon className="h-5 w-5" aria-hidden />}
              />
            ) : inboxQuery.isLoading ? (
              <div className="py-2"><TableSkeleton /></div>
            ) : inboxQuery.isError ? (
              <PageErrorState error={inboxQuery.error} />
            ) : (
              <ActionRequiredPanel items={inboxItems} limit={6} />
            )}
          </SectionCard>

          <SectionCard
            title="KPIs for your role"
            description="Curated through the KPI Studio"
            icon={Sparkles}
          >
            {kpiQuery.isLoading ? (
              <TableSkeleton />
            ) : kpiQuery.isError ? (
              <PageErrorState error={kpiQuery.error} />
            ) : kpis.length === 0 ? (
              <EmptyState
                title="No KPIs configured for your role"
                description="Ask an administrator to assign KPIs through the KPI Studio."
                icon={<Sparkles className="h-5 w-5" aria-hidden />}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="home-kpi-grid">
                {kpis.map(kpi => (
                  <button
                    type="button"
                    key={kpi.code}
                    onClick={() => navigate(hrefForKpi(kpi.code, kpi.landingRoute))}
                    data-testid={`home-kpi-${kpi.code}`}
                    className="surface-card surface-card-hover flex flex-col gap-2 p-3.5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BarChart3 className="h-4 w-4" aria-hidden />
                      </span>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{kpi.label}</p>
                    {kpi.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{kpi.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-4">
          <SectionCard title="Jump to" description="Frequent destinations" icon={ArrowRight} bodyClassName="space-y-1.5">
            <JumpLink label="Inbox" Icon={InboxIcon} onClick={() => navigate(canUseInbox ? '/inbox' : '/notifications')} />
            <JumpLink label="Notifications" Icon={Bell} onClick={() => navigate('/notifications')} />
            <JumpLink label="Internal Requests" Icon={HeadphonesIcon} onClick={() => navigate('/portal/tickets/new')} />
            <JumpLink label="Reports & BI" Icon={BarChart3} onClick={() => navigate('/reports')} />
          </SectionCard>

          {!modulesLoading && roadmapModules.length > 0 && (
            <SectionCard title="Roadmap" description="Planned capabilities" icon={Clock} bodyClassName="space-y-2">
              {roadmapModules.map(mod => {
                const Icon = moduleIconMap[mod.icon] ?? Settings;
                return (
                  <div key={mod.id} className="flex items-start gap-3 rounded-lg border border-dashed p-2.5 opacity-80">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{mod.name}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden />
                        {mod.status === 'coming_soon' ? 'Coming soon' : 'Planned'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </SectionCard>
          )}
        </div>
      </div>

      {/* Workspaces / module launcher */}
      {MODULE_SECTIONS.map(section => {
        const items = section.moduleIds
          .map(id => moduleById[id])
          .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod) && mod.status === 'active');

        if (items.length === 0) return null;

        return (
          <section key={section.id} className="space-y-3" aria-label={section.title}>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{section.subtitle}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(mod => {
                const Icon = moduleIconMap[mod.icon] ?? Settings;
                return (
                  <ModuleCard
                    key={mod.id}
                    name={mod.name}
                    description={mod.description}
                    onClick={() => openModule(mod.path)}
                    Icon={Icon}
                    accent={section.accent}
                    iconColor={section.iconColor}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function JumpLink({ label, Icon, onClick }: { label: string; Icon: React.ElementType; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" aria-hidden />
    </button>
  );
}

function ModuleCard({
  name,
  description,
  onClick,
  Icon,
  accent,
  iconColor,
}: {
  name: string;
  description: string;
  onClick: () => void;
  Icon: React.ElementType;
  accent: string;
  iconColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card surface-card-hover group flex flex-col gap-3 p-5 text-left"
    >
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${accent}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
