import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PLATFORM_ROUTES, type PlatformRouteDefinition } from '@flc/shell';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

const GROUPS = [
  { key: 'Access', title: 'Access', description: 'Accounts, roles, and user groups.' },
  { key: 'Master Data', title: 'Company data', description: 'Branches and shared business records.' },
  { key: 'Configuration', title: 'Configuration', description: 'Workspace settings and recovery controls.' },
  { key: 'Governance', title: 'Operations and oversight', description: 'Activity, integrations, audit, and system health.' },
] as const;

const ADMIN_ROUTES = PLATFORM_ROUTES.filter(route =>
  route.section === 'Admin'
  && route.shell === 'main'
  && route.id !== 'admin-home'
  && !route.path.includes(':'),
);

export default function AdminHome() {
  const { user } = useAuth();
  const roleHome = useFeatureFlag('phase4.role-home');
  const dmsSync = useFeatureFlag('phase3c.dms-sync-ops-v2');
  const reconciliation = useFeatureFlag('phase3d.reconciliation-review-v2');
  const webhooks = useFeatureFlag('phase6.webhook-outbox');
  const enabledFlags: Record<string, boolean> = {
    'phase4.role-home': roleHome,
    'phase3c.dms-sync-ops-v2': dmsSync,
    'phase3d.reconciliation-review-v2': reconciliation,
    'phase6.webhook-outbox': webhooks,
  };
  const visible = (route: PlatformRouteDefinition) =>
    (!route.roles || (!!user?.role && route.roles.includes(user.role)))
    && (!route.featureFlag || enabledFlags[route.featureFlag] === true);

  return (
    <div className="space-y-8 motion-safe:animate-fade-in">
      <PageHeader
        title="Administration"
        description="Choose the area you need to manage. Each area uses your company permissions."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Administration' }]}
      />
      <div className="rounded-xl border border-border bg-card px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex items-start gap-4 border-b border-border pb-6">
          <div className="rounded-lg bg-primary/10 p-3 text-primary" aria-hidden="true"><ShieldCheck className="h-6 w-6" /></div>
          <div className="space-y-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">FLC UBS · Control centre</p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Manage the working environment</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">Set access, maintain company records, and review operational health from one place.</p>
          </div>
        </div>
        <div className="grid gap-x-10 gap-y-8 pt-7 md:grid-cols-2">
          {GROUPS.map(group => {
            const routes = ADMIN_ROUTES.filter(route => route.group === group.key && visible(route));
            if (routes.length === 0) return null;
            const groupId = `admin-group-${group.key.replace(/ /g, '-').toLowerCase()}`;
            return (
              <section key={group.key} aria-labelledby={groupId}>
                <div className="mb-3">
                  <h3 id={groupId} className="text-base font-semibold text-foreground">{group.title}</h3>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
                <ul className="border-t border-border">
                  {routes.map(route => (
                    <li key={route.id}>
                      <Link
                        to={route.path}
                        className="group flex min-h-12 items-center justify-between gap-3 border-b border-border px-2 py-2 text-sm font-medium text-foreground motion-safe:transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        <span>{route.label}</span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
