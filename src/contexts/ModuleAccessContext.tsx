import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  resolvePlatformModules,
  type ModuleSettingRecord,
  type ResolvedPlatformModule,
} from '@/lib/moduleAccess';

type ModuleSettingRow = Database['public']['Tables']['module_settings']['Row'];

interface ModuleAccessContextValue {
  modules: ResolvedPlatformModule[];
  loading: boolean;
  canManageModules: boolean;
  getModule: (moduleId: string) => ResolvedPlatformModule | undefined;
  isModuleActive: (moduleId: string) => boolean;
  setModuleActive: (moduleId: string, isActive: boolean) => Promise<void>;
  reloadModules: () => Promise<void>;
}

const ModuleAccessContext = createContext<ModuleAccessContextValue | undefined>(undefined);

function getModuleSettingsQueryKey(companyId: string) {
  return ['module-settings', companyId] as const;
}

async function fetchModuleSettings(companyId: string): Promise<ModuleSettingRow[]> {
  const { data, error } = await supabase
    .from('module_settings')
    .select('*')
    .eq('company_id', companyId);

  if (error) throw error;
  return data ?? [];
}

export function ModuleAccessProvider({ children }: { children: React.ReactNode }) {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const companyId = user?.company_id ?? '';
  const queryKey = getModuleSettingsQueryKey(companyId);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchModuleSettings(companyId),
    enabled: Boolean(companyId),
  });

  const modules = useMemo(
    () => resolvePlatformModules(data as ModuleSettingRecord[]),
    [data],
  );

  const moduleMap = useMemo(
    () => new Map(modules.map(module => [module.id, module])),
    [modules],
  );

  const canManageModules = hasRole(['super_admin', 'company_admin']);

  const getModule = useCallback(
    (moduleId: string) => moduleMap.get(moduleId),
    [moduleMap],
  );

  const isModuleActive = useCallback(
    (moduleId: string) => moduleMap.get(moduleId)?.isActive ?? true,
    [moduleMap],
  );

  const reloadModules = useCallback(async () => {
    if (!companyId) return;
    await queryClient.invalidateQueries({ queryKey });
  }, [companyId, queryClient, queryKey]);

  const setModuleActive = useCallback(async (moduleId: string, isActive: boolean) => {
    if (!companyId) throw new Error('Missing company context');

    const module = moduleMap.get(moduleId);
    if (!module) throw new Error('Unknown module');
    if (!module.isToggleable) throw new Error(`${module.name} cannot be deactivated.`);

    const payload: Database['public']['Tables']['module_settings']['Insert'] = {
      company_id: companyId,
      module_id: moduleId,
      is_active: isActive,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    };

    const { error } = await supabase
      .from('module_settings')
      .upsert(payload, { onConflict: 'company_id,module_id' });

    if (error) throw error;

    queryClient.setQueryData<ModuleSettingRow[]>(queryKey, (current = []) => {
      const existing = current.find(row => row.module_id === moduleId);
      const nextRow: ModuleSettingRow = {
        id: existing?.id ?? `module-setting-${moduleId}`,
        company_id: companyId,
        module_id: moduleId,
        is_active: isActive,
        updated_at: payload.updated_at ?? null,
        updated_by: payload.updated_by ?? null,
      };

      return [
        ...current.filter(row => row.module_id !== moduleId),
        nextRow,
      ];
    });
  }, [companyId, moduleMap, queryClient, queryKey, user?.id]);

  const value = useMemo<ModuleAccessContextValue>(() => ({
    modules,
    loading: Boolean(companyId) && (isLoading || isFetching),
    canManageModules,
    getModule,
    isModuleActive,
    setModuleActive,
    reloadModules,
  }), [canManageModules, companyId, getModule, isFetching, isLoading, isModuleActive, modules, reloadModules, setModuleActive]);

  return (
    <ModuleAccessContext.Provider value={value}>
      {children}
    </ModuleAccessContext.Provider>
  );
}

export function useModuleAccess() {
  const context = useContext(ModuleAccessContext);
  if (!context) {
    throw new Error('useModuleAccess must be used within a ModuleAccessProvider');
  }
  return context;
}