import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';
import { getRoleHomeKpis, type RoleHomeKpi } from '@/services/kpiHomeService';
import { hrefForKpi } from './home/hrefForKpi';
import { isHrmsWorkspacePath, openDedicatedHrmsWorkspace } from '@/lib/hrmsWorkspace';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Brain,
  Briefcase,
  ChevronRight,
  Clock,
  DollarSign,
  HeadphonesIcon,
  Inbox as InboxIcon,
  Package,
  Settings,
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

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { modules, loading: modulesLoading } = useModuleAccess();

  const companyId = user?.companyId ?? '';
  const role = user?.role ?? 'creator_updater';

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

  const moduleById = useMemo(
    () => Object.fromEntries(modules.map(m => [m.id, m])),
    [modules],
  );
  const roadmapModules = useMemo(
    () => modules.filter(m => m.status !== 'active'),
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

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title={`Welcome${firstName ? `, ${firstName}` : ''}`}
        description={`Your ${formatRoleLabel(role)} workspace — KPIs, modules, and shortcuts in one place.`}
        breadcrumbs={[{ label: 'FLC BI', path: '/home' }, { label: 'Home' }]}
      />

      {/* Quick access */}
      <section className="space-y-3" aria-label="Quick access">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Access</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink
            label="Inbox"
            description="Approvals, reconciliation, requests, alerts"
            Icon={InboxIcon}
            onClick={() => navigate('/inbox')}
          />
          <QuickLink
            label="Notifications"
            description="Operational alerts and recent updates"
            Icon={Bell}
            onClick={() => navigate('/notifications')}
          />
          <QuickLink
            label="Internal Requests"
            description="Submit and track service tickets"
            Icon={HeadphonesIcon}
            onClick={() => navigate('/portal/tickets/new')}
          />
        </div>
      </section>

      {/* KPIs */}
      <section className="space-y-3" aria-label="KPIs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">KPIs for your role</h2>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="home-kpi-grid">
            {kpis.map(kpi => (
              <button
                type="button"
                key={kpi.code}
                onClick={() => navigate(hrefForKpi(kpi.code, kpi.landingRoute))}
                data-testid={`home-kpi-${kpi.code}`}
                className="glass-panel text-left p-4 flex flex-col gap-2 transition-colors hover:bg-secondary/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <BarChart3 className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" aria-hidden />
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                </div>
                <p className="text-sm font-semibold text-foreground">{kpi.label}</p>
                {kpi.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3">{kpi.description}</p>
                )}
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-auto pt-1">{kpi.code}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Module sections */}
      {MODULE_SECTIONS.map(section => {
        const items = section.moduleIds
          .map(id => moduleById[id])
          .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod) && mod.status === 'active');

        if (items.length === 0) return null;

        return (
          <section key={section.id} className="space-y-3" aria-label={section.title}>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">{section.subtitle}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

      {/* Roadmap */}
      {!modulesLoading && roadmapModules.length > 0 && (
        <section className="space-y-3" aria-label="Roadmap">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roadmap</h2>
            <p className="text-xs text-muted-foreground mt-1">Capabilities planned for future releases.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roadmapModules.map(mod => {
              const Icon = moduleIconMap[mod.icon] ?? Settings;
              return (
                <RoadmapCard
                  key={mod.id}
                  name={mod.name}
                  description={mod.description}
                  status={mod.status}
                  Icon={Icon}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function QuickLink({
  label,
  description,
  Icon,
  onClick,
}: {
  label: string;
  description: string;
  Icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-panel p-4 flex items-center gap-4 text-left cursor-pointer hover:border-primary/30 hover:shadow-md hover:-translate-y-px transition-all duration-150"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-snug">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" aria-hidden />
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
      className="glass-panel p-5 flex flex-col gap-3 text-left cursor-pointer hover:border-primary/30 hover:shadow-md hover:-translate-y-px transition-all duration-150"
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-sm text-foreground">{name}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

function RoadmapCard({
  name,
  description,
  status,
  Icon,
}: {
  name: string;
  description: string;
  status: 'active' | 'coming_soon' | 'planned';
  Icon: React.ElementType;
}) {
  return (
    <div className="glass-panel p-5 flex flex-col gap-3 opacity-60 cursor-default">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          <Clock className="h-3 w-3" aria-hidden />
          {status === 'coming_soon' ? 'Coming soon' : 'Planned'}
        </span>
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-sm text-foreground">{name}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
