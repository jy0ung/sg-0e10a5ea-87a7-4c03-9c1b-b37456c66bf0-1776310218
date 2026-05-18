import { Link } from 'react-router-dom';
import { Archive, ClipboardList, PlusCircle, Settings2 } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { PORTAL_QUEUE_ROLES, PORTAL_SETUP_ROLES } from '@/config/routeRoles';

const QUEUE_ROLES = new Set<string>(PORTAL_QUEUE_ROLES);
const SETUP_ROLES = new Set<string>(PORTAL_SETUP_ROLES);

interface QuickLinkCardProps {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

function QuickLinkCard({ to, icon: Icon, title, description }: QuickLinkCardProps) {
  return (
    <Link to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      <Card className="h-full transition-shadow hover:shadow-md group-focus-visible:shadow-md">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PortalLanding() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canManageQueue = QUEUE_ROLES.has(role);
  const canManageSetup = SETUP_ROLES.has(role);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the shortcuts below to get started, or navigate using the sidebar.
        </p>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Requests
        </p>
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
            title="My Requests"
            description="View and follow up on your submitted requests"
          />
          {canManageQueue && (
            <>
              <QuickLinkCard
                to="/portal/queue"
                icon={ClipboardList}
                title="Request Queue"
                description="Triage, assign, and resolve open requests"
              />
              <QuickLinkCard
                to="/portal/history"
                icon={Archive}
                title="Request History"
                description="Browse resolved and closed requests"
              />
            </>
          )}
        </div>
      </div>

      {canManageSetup && (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickLinkCard
              to="/portal/setup"
              icon={Settings2}
              title="Request Setup"
              description="Configure categories, routing rules, and form fields"
            />
          </div>
        </div>
      )}
    </div>
  );
}
