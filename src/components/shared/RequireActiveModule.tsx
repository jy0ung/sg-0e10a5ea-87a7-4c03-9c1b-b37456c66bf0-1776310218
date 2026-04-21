import React from 'react';
import { Link } from 'react-router-dom';
import { Clock3, Loader2, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';

interface RequireActiveModuleProps {
  moduleId: string;
  children: React.ReactNode;
}

export function RequireActiveModule({ moduleId, children }: RequireActiveModuleProps) {
  const { loading, isModuleActive, getModule, canManageModules } = useModuleAccess();
  const module = getModule(moduleId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isModuleActive(moduleId)) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={module?.name ?? 'Module Unavailable'}
        description="This module is currently disabled for your company. Existing links still resolve safely, but access is paused until an administrator re-activates it."
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Module Unavailable' }]}
      />

      <div className="glass-panel p-8 flex flex-col items-start gap-5 max-w-2xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
          <Clock3 className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Coming soon</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {module?.name ?? 'This module'} has been deactivated in company settings. The route remains valid so links do not break, but the workspace stays inaccessible until it is turned back on.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/modules">Open Module Directory</Link>
          </Button>
          {canManageModules && (
            <Button asChild variant="outline">
              <Link to="/admin/settings">
                <Settings2 className="h-4 w-4 mr-2" />
                Manage Module Access
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}