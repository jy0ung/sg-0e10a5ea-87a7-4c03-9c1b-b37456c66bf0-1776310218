import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getRoleHomeKpis, type RoleHomeKpi } from '@/services/kpiHomeService';
import { AlertTriangle, ArrowRight, BarChart3, Sparkles } from 'lucide-react';

/**
 * Best-effort deep link per KPI code. Falls back to the executive dashboard
 * when no specific drill-down route is known. Adding a new KPI definition
 * only needs a new entry here if a more specific destination exists.
 */
const KPI_HREF_BY_CODE: Record<string, string> = {
  'vehicles.total_stock':     '/auto-aging/vehicles',
  'vehicles.aged_over_180':   '/auto-aging/vehicles?ageBucket=181%2B',
  'sales.open_orders':        '/sales/orders',
  'sales.weekly_revenue':     '/sales',
  'customers.new_this_month': '/sales/customers',
};

function hrefForKpi(code: string): string {
  return KPI_HREF_BY_CODE[code] ?? '/';
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canUseHome = useFeatureFlag('phase4.role-home', false);

  const companyId = user?.companyId ?? '';
  const role = user?.role ?? 'creator_updater';

  const query = useQuery({
    queryKey: ['role-home-kpis', companyId, role],
    queryFn: async () => {
      const r = await getRoleHomeKpis(companyId, role);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseHome,
    staleTime: 60_000,
  });

  if (!canUseHome) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Home"
          description="Role-aware workspace tailored to your day-to-day"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Home' }]}
        />
        <div className="glass-panel p-12 text-center max-w-md mx-auto" data-testid="home-feature-off">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Feature not available</h3>
          <p className="text-sm text-muted-foreground">The role-aware Home is gated by the <code>phase4.role-home</code> feature flag.</p>
        </div>
      </div>
    );
  }

  if (query.isLoading) return <TableSkeleton />;
  if (query.isError)   return <PageErrorState error={query.error} />;

  const kpis: RoleHomeKpi[] = query.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Welcome${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description={`Curated for the ${role.replace(/_/g, ' ')} role`}
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Home' }]}
      />

      {kpis.length === 0 ? (
        <EmptyState
          title="No KPIs configured for your role"
          description="Ask an administrator to assign KPIs through the KPI Definition Studio."
          icon={<Sparkles className="h-5 w-5" aria-hidden />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="home-kpi-grid">
          {kpis.map(kpi => (
            <button
              type="button"
              key={kpi.code}
              onClick={() => navigate(hrefForKpi(kpi.code))}
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
    </div>
  );
}
