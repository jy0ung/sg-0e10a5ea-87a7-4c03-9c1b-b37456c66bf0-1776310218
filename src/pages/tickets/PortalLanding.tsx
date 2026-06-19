import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  FolderOpen,
  Inbox,
  Megaphone,
  MessageSquare,
  PlusCircle,
  Settings2,
} from 'lucide-react';

import { STALE } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { canManagePortalQueue, canManagePortalSetup } from '@/lib/portalAccess';
import { isOpenStatus } from '@/lib/requestFormatters';
import { listMyTickets, getCompanyTicketStatusCounts } from '@/services/ticketService';
import { MetricCard } from '@/components/shared/MetricCard';
import { SectionCard } from '@/components/shared/SectionCard';

interface QuickLinkCardProps {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

function QuickLinkCard({ to, icon: Icon, title, description }: QuickLinkCardProps) {
  return (
    <Link
      to={to}
      className="surface-card surface-card-hover group flex items-start gap-3 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}

export default function PortalLanding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManageQueue = canManagePortalQueue(user);
  const canManageSetup = canManagePortalSetup(user);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const { data: myTickets } = useQuery({
    queryKey: ['portal-landing:my-tickets', user?.id, user?.company_id],
    queryFn: async () => {
      const { data, error } = await listMyTickets(user!.id, user!.company_id);
      if (error) throw new Error(error.message || 'Unable to load requests.');
      return data ?? [];
    },
    enabled: !!user,
    staleTime: STALE.transactional,
  });

  const { data: queueCounts } = useQuery({
    queryKey: ['portal-landing:queue-counts', user?.company_id],
    queryFn: async () => {
      const { data, error } = await getCompanyTicketStatusCounts(user!.company_id);
      if (error) throw new Error(error.message || 'Unable to load queue counts.');
      return data;
    },
    enabled: !!user && canManageQueue,
    staleTime: STALE.transactional,
  });

  const myOpen = myTickets?.filter((t) => isOpenStatus(t.status)).length ?? 0;
  const myAwaiting = myTickets?.filter((t) => t.status === 'pending_requester' || t.status === 'completed_by_owner').length ?? 0;
  const myCompleted = myTickets?.filter((t) => t.status === 'closed').length ?? 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      {/* Hero */}
      <header className="surface-card hero-gradient flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit a request, track your tickets, or browse shared resources.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <Link
            to="/portal/tickets/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PlusCircle className="h-4 w-4" aria-hidden />
            New request
          </Link>
          <Link
            to="/portal/tickets"
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            Pending requests
          </Link>
        </div>
      </header>

      {/* Personal metric strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="My open requests"
          value={myOpen}
          icon={Inbox}
          tone="blue"
          hint="In progress or awaiting action"
          onClick={() => navigate('/portal/tickets')}
          data-testid="portal-metric-open"
        />
        <MetricCard
          label="Awaiting your reply"
          value={myAwaiting}
          icon={MessageSquare}
          tone="amber"
          hint="Needs information from you"
          onClick={() => navigate('/portal/tickets')}
          data-testid="portal-metric-awaiting"
        />
        <MetricCard
          label="Completed"
          value={myCompleted}
          icon={CheckCircle2}
          tone="emerald"
          hint="Closed by requester"
          onClick={() => navigate('/portal/tickets/completed')}
          data-testid="portal-metric-resolved"
        />
      </div>

      {/* Queue snapshot for staff */}
      {canManageQueue && (
        <SectionCard
          title="Queue at a glance"
          description="Company-wide request load"
          icon={ClipboardList}
          action={{ label: 'Open queue', to: '/portal/queue' }}
        >
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold leading-none tracking-tight text-foreground">
                {queueCounts?.open ?? '—'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Needs triage</p>
            </div>
            <div>
              <p className="text-2xl font-bold leading-none tracking-tight text-foreground">
                {queueCounts?.in_progress ?? '—'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">In progress</p>
            </div>
            <div>
              <p className="text-2xl font-bold leading-none tracking-tight text-foreground">
                {queueCounts?.pending_requester ?? '—'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Pending requester</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Requests */}
      <SectionCard title="Requests" icon={ClipboardList}>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLinkCard
            to="/portal/tickets/new"
            icon={PlusCircle}
            title="New Request"
            description="Submit a new internal support request"
          />
          <QuickLinkCard
            to="/portal/tickets"
            icon={ClipboardList}
            title="Pending Requests"
            description="View and follow up on your submitted requests"
          />
          <QuickLinkCard
            to="/portal/tickets/completed"
            icon={Archive}
            title="Completed Requests"
            description="Browse requester-confirmed closed requests"
          />
          {canManageQueue && (
            <>
              <QuickLinkCard
                to="/portal/queue"
                icon={ClipboardList}
                title="Pending / Active Requests"
                description="Triage, assign, and resolve open requests"
              />
              <QuickLinkCard
                to="/portal/history"
                icon={Archive}
                title="Completed Requests"
                description="Browse requester-confirmed closed requests"
              />
            </>
          )}
        </div>
      </SectionCard>

      {/* Resources */}
      <SectionCard title="Resources" icon={FolderOpen}>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLinkCard
            to="/portal/announcements"
            icon={Megaphone}
            title="Announcements"
            description="Notices, process updates, and memos for this workspace"
          />
          <QuickLinkCard
            to="/portal/documents"
            icon={FolderOpen}
            title="Documents & Forms"
            description="Download forms, templates, SOPs, and reference documents"
          />
        </div>
      </SectionCard>

      {/* Administration */}
      {canManageSetup && (
        <SectionCard title="Administration" icon={Settings2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickLinkCard
              to="/portal/setup"
              icon={Settings2}
              title="Request Setup"
              description="Configure categories, routing rules, and form fields"
            />
          </div>
        </SectionCard>
      )}
    </div>
  );
}
