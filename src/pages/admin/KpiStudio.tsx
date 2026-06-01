import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getRoleHomeKpis, listKpiDefinitions, upsertRoleKpiDefaults } from '@/services/kpiHomeService';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import type { AppRole } from '@/types';

const APP_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'director', 'general_manager',
  'manager', 'sales', 'accounts', 'analyst', 'creator_updater',
];

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin:     'Super Admin',
  company_admin:   'Company Admin',
  director:        'Director',
  general_manager: 'General Manager',
  manager:         'Manager',
  sales:           'Sales',
  accounts:        'Accounts',
  analyst:         'Analyst',
  creator_updater: 'Creator / Updater',
};

export default function KpiStudio() {
  const queryClient = useQueryClient();
  const companyId = useCompanyId();
  const canUseStudio = useFeatureFlag('phase4.role-home', false);

  const [role, setRole] = useState<AppRole>('manager');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const definitionsQuery = useQuery({
    queryKey: ['kpi_definitions', companyId],
    queryFn: async () => {
      const r = await listKpiDefinitions(companyId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseStudio,
    staleTime: 60_000,
  });

  const currentRoleKpis = useQuery({
    queryKey: ['kpi_role_current', companyId, role],
    queryFn: async () => {
      const r = await getRoleHomeKpis(companyId, role);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseStudio,
    staleTime: 30_000,
  });

  // Hydrate selection from the current role's curated set whenever role/data changes.
  useEffect(() => {
    if (currentRoleKpis.data) {
      setSelectedCodes(currentRoleKpis.data.map(k => k.code));
    }
  }, [currentRoleKpis.data, role]);

  const allDefinitions = useMemo(() => definitionsQuery.data ?? [], [definitionsQuery.data]);

  const toggleCode = (code: string) => {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await upsertRoleKpiDefaults(companyId, role, selectedCodes);
    setSaving(false);
    if (result.error) {
      toast.error('Save failed', { description: result.error.message });
      return;
    }
    toast.success(`Saved KPI defaults for ${ROLE_LABELS[role]}`);
    void queryClient.invalidateQueries({ queryKey: ['kpi_role_current', companyId, role] });
    void queryClient.invalidateQueries({ queryKey: ['role-home-kpis'] });
  };

  if (!canUseStudio) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="KPI Definition Studio"
          description="Curate which KPIs each role sees on Home"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin' }, { label: 'KPI Studio' }]}
        />
        <FeatureUnavailableState featureName="KPI Studio" flagName="phase4.role-home" data-testid="studio-feature-off" />
      </div>
    );
  }

  if (definitionsQuery.isLoading) return <TableSkeleton />;
  if (definitionsQuery.isError)   return <PageErrorState error={definitionsQuery.error} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="KPI Definition Studio"
        description="Curate which KPIs surface on Home for each role"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin' }, { label: 'KPI Studio' }]}
        actions={
          <Button onClick={() => void handleSave()} size="sm" disabled={saving} data-testid="studio-save-button">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        }
      />

      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <label htmlFor="studio-role-select" className="text-sm font-medium text-foreground">Role</label>
        <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
          <SelectTrigger className="w-56" data-testid="studio-role-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_ROLES.map(r => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{selectedCodes.length} of {allDefinitions.length} KPIs selected</span>
      </div>

      <div className="glass-panel p-2" data-testid="studio-kpi-list">
        <div className="grid gap-2">
          {allDefinitions.map(def => {
            const checked = selectedCodes.includes(def.code);
            return (
              <label
                key={def.id}
                className={`flex items-start gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                  checked ? 'bg-primary/10' : 'hover:bg-secondary/30'
                }`}
                data-testid={`studio-kpi-${def.code}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCode(def.code)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{def.label}</p>
                  {def.description && <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>}
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{def.code}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
