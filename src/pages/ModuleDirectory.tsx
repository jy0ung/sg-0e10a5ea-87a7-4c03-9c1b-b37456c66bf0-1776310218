import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';
import { isHrmsWorkspacePath, openDedicatedHrmsWorkspace } from '@/lib/hrmsWorkspace';
import {
  Timer, DollarSign, TrendingUp, Settings, Package, Users, UserCheck, Brain,
  LayoutDashboard, Bell, HeadphonesIcon, Briefcase, BarChart3, Truck,
  ChevronRight, Clock,
} from 'lucide-react';

// ── Icon registry ─────────────────────────────────────────────────────────────

const iconMap: Record<string, React.ElementType> = {
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

// ── Section definitions ───────────────────────────────────────────────────────

interface SectionConfig {
  id: string;
  title: string;
  subtitle: string;
  moduleIds: string[];
  accent: string;       // Tailwind bg class for icon backdrop
  iconColor: string;    // Tailwind text class for icon
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'operations',
    title: 'Operations',
    subtitle: 'Core day-to-day workflows — vehicle lifecycle, inventory, and procurement.',
    moduleIds: ['auto-aging', 'inventory', 'purchasing'],
    accent: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
  },
  {
    id: 'commercial',
    title: 'Commercial',
    subtitle: 'Sales performance, financial intelligence, and business reporting.',
    moduleIds: ['sales', 'reports'],
    accent: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
  },
  {
    id: 'people',
    title: 'People & Administration',
    subtitle: 'Employee management, user access, configuration, and customer support.',
    moduleIds: ['hrms', 'admin', 'support'],
    accent: 'bg-violet-500/15',
    iconColor: 'text-violet-500',
  },
];

// ── Module card ───────────────────────────────────────────────────────────────

function ModuleCard({
  name,
  description,
  status,
  onClick,
  Icon,
  accent,
  iconColor,
}: {
  name: string;
  description: string;
  status: 'active' | 'coming_soon' | 'planned';
  onClick?: () => void;
  Icon: React.ElementType;
  accent: string;
  iconColor: string;
}) {
  const isActive = status === 'active';
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {!isActive && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            <Clock className="h-3 w-3" />
            {status === 'coming_soon' ? 'Coming soon' : 'Planned'}
          </span>
        )}
        {isActive && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        )}
      </div>
      <div className="space-y-1 text-left">
        <h3 className="font-semibold text-sm text-foreground">{name}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </>
  );

  if (isActive) {
    return (
      <button
        type="button"
        className="glass-panel p-5 flex flex-col gap-3 transition-all duration-150 cursor-pointer hover:border-primary/30 hover:shadow-md hover:-translate-y-px"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="glass-panel p-5 flex flex-col gap-3 transition-all duration-150 opacity-50 cursor-default">
      {content}
    </div>
  );
}

// ── Workspace shortcut card (always-visible, neutral style) ───────────────────

function WorkspaceCard({
  name,
  description,
  onClick,
  Icon,
}: {
  name: string;
  description: string;
  onClick: () => void;
  Icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      className="glass-panel p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 hover:shadow-md hover:-translate-y-px transition-all duration-150"
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 ml-auto" />
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ModuleDirectory() {
  const navigate = useNavigate();
  const { modules } = useModuleAccess();

  const moduleById = Object.fromEntries(modules.map(m => [m.id, m]));

  const roadmapModules = modules.filter(m => m.status !== 'active');

  function openModule(path?: string) {
    if (!path) return;
    if (isHrmsWorkspacePath(path)) {
      openDedicatedHrmsWorkspace(path);
      return;
    }
    navigate(path);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Module Directory"
        description="All operational areas, tools, and workspaces available in this platform."
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Module Directory' }]}
      />

      {/* Quick access */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Access</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <WorkspaceCard
            name="My Dashboard"
            description="Executive dashboard — KPIs and operating summary"
            onClick={() => navigate('/')}
            Icon={LayoutDashboard}
          />
          <WorkspaceCard
            name="Notifications"
            description="Alerts, approvals, and recent operational updates"
            onClick={() => navigate('/notifications')}
            Icon={Bell}
          />
          <WorkspaceCard
            name="Module Directory"
            description="You are here — browse all available modules"
            onClick={() => {}}
            Icon={Settings}
          />
        </div>
      </section>

      {/* Business sections */}
      {SECTIONS.map(section => {
        const mods = section.moduleIds
          .map(id => moduleById[id])
          .filter(Boolean)
          .filter(m => m.status === 'active');

        if (!mods.length) return null;

        return (
          <section key={section.id} className="space-y-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">{section.subtitle}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mods.map(mod => {
                const Icon = iconMap[mod.icon] ?? Settings;
                return (
                  <ModuleCard
                    key={mod.id}
                    name={mod.name}
                    description={mod.description}
                    status={mod.status}
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
      {roadmapModules.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roadmap</h2>
            <p className="text-xs text-muted-foreground mt-1">Capabilities planned for future releases.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roadmapModules.map(mod => {
              const Icon = iconMap[mod.icon] ?? Settings;
              return (
                <ModuleCard
                  key={mod.id}
                  name={mod.name}
                  description={mod.description}
                  status={mod.status}
                  Icon={Icon}
                  accent="bg-muted"
                  iconColor="text-muted-foreground"
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
