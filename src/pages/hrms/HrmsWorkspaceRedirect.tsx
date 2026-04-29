import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Briefcase, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { getDedicatedHrmsWorkspacePath } from '@/lib/hrmsWorkspace';

const REDIRECT_SESSION_KEY_PREFIX = 'flc.hrms.workspace.redirect.';
const REDIRECT_LOOP_WINDOW_MS = 1500;

export default function HrmsWorkspaceRedirect() {
  const location = useLocation();
  const destination = getDedicatedHrmsWorkspacePath(location.pathname, location.search, location.hash);

  useEffect(() => {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const currentTarget = destination.startsWith('http') ? window.location.href : currentPath;
    if (currentTarget === destination) return;

    const key = `${REDIRECT_SESSION_KEY_PREFIX}${destination}`;
    const now = Date.now();
    const previousRedirectAt = Number(sessionStorage.getItem(key) ?? '0');

    if (now - previousRedirectAt < REDIRECT_LOOP_WINDOW_MS) return;

    sessionStorage.setItem(key, String(now));
    window.location.assign(destination);
  }, [destination]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Opening HRMS Workspace"
        description="FLC HRMS now runs in its dedicated workspace."
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'HRMS' }]}
      />

      <div className="glass-panel p-6 max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-4 min-w-0">
            <div>
              <h2 className="text-base font-semibold text-foreground">FLC HRMS</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Continue to the HRMS workspace with your current account session.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={destination} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open HRMS
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link to="/modules" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Modules
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}