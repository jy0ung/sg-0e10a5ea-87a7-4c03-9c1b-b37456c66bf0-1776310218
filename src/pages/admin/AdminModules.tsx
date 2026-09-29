import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';
import { ModuleSettings } from './settings/SettingsSections';

export default function AdminModules() {
  const { modules, setModuleActive, canManageModules, loading } = useModuleAccess();
  const [updatingModuleId, setUpdatingModuleId] = useState<string | null>(null);

  const handleModuleToggle = async (moduleId: string, moduleName: string, nextState: boolean) => {
    setUpdatingModuleId(moduleId);
    try {
      await setModuleActive(moduleId, nextState);
      toast.success(`${moduleName} ${nextState ? 'activated' : 'deactivated'}`);
    } catch (error) {
      toast.error(`Failed to update ${moduleName}`, {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    } finally {
      setUpdatingModuleId(null);
    }
  };

  return (
    <div className="space-y-6 motion-safe:animate-fade-in">
      <PageHeader
        title="Modules"
        description="Control which business modules are available to your company."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin' }, { label: 'Modules' }]}
      />
      <ModuleSettings
        modules={modules.filter(module => Boolean(module.path))}
        canManageModules={canManageModules}
        modulesLoading={loading}
        updatingModuleId={updatingModuleId}
        onModuleToggle={handleModuleToggle}
      />
    </div>
  );
}
