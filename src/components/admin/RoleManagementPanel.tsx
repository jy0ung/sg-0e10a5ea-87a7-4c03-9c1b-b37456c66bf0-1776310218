import React, { useMemo, useState } from 'react';
import { CheckSquare, LockKeyhole, Pencil, Plus, RotateCcw, Save, Shield, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ALL_SECTIONS,
  DEFAULT_ROLE_SECTIONS,
  ROLE_LABELS,
  type SectionName,
} from '@/config/rolePermissions';
import { APP_ROLES, ROLE_DEFAULT_SCOPE, type AppRole } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRoleSections, saveRoleSections } from '@flc/auth';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { useQuery, useMutation } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';

const ALL_ROLES: readonly AppRole[] = APP_ROLES;

const ROLE_DESCRIPTIONS: Partial<Record<AppRole, string>> = {
  super_admin: 'Global owner role with unrestricted app and tenant administration.',
  company_admin: 'Company administrator for user, branch, setup, and permission management.',
  director: 'Executive role for company-wide operational oversight.',
  general_manager: 'Senior manager role for company-wide operational workflows.',
  manager: 'Branch-oriented manager role for team workflows and operational review.',
  sales: 'Sales execution role with customer, vehicle, and order access.',
  accounts: 'Finance role for accounting, reporting, and purchasing workflows.',
  analyst: 'Legacy reporting and analysis role retained for existing users.',
  creator_updater: 'Operational role for creating and maintaining day-to-day records.',
  portal_admin: 'Internal Requests portal administrator role.',
  portal_staff: 'Internal Requests portal staff/resolver role.',
};

function scopeLabel(role: AppRole) {
  const scope = ROLE_DEFAULT_SCOPE[role] ?? 'company';
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

type RoleManagementPanelProps = {
  embedded?: boolean;
};

export function RoleManagementPanel({ embedded = false }: RoleManagementPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = !!user && ['super_admin', 'company_admin'].includes(user.role);
  const [permissions, setPermissions] = useState<Record<AppRole, SectionName[]>>(
    () => ({ ...DEFAULT_ROLE_SECTIONS })
  );
  const [dirty, setDirty] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole | null>(null);

  const roleRows = useMemo(
    () => ALL_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      scope: scopeLabel(role),
      description: ROLE_DESCRIPTIONS[role] ?? 'System application role.',
      grantedCount: permissions[role]?.length ?? 0,
    })),
    [permissions],
  );

  useQuery({
    queryKey: ['role-sections', user?.company_id],
    queryFn: async () => {
      const { data } = await fetchRoleSections(user!.company_id);
      if (data) {
        const merged: Record<AppRole, SectionName[]> = { ...DEFAULT_ROLE_SECTIONS };
        for (const role of Object.keys(data) as AppRole[]) {
          merged[role] = data[role] as SectionName[];
        }
        setPermissions(merged);
      }
      return data;
    },
    enabled: !!user?.company_id,
    staleTime: STALE.reference,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.company_id) throw new Error('No company');
      const results = await Promise.all(
        (Object.keys(permissions) as AppRole[]).map((role) =>
          saveRoleSections(user.company_id, role, permissions[role] ?? []),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      setDirty(false);
      toast({ title: 'Permissions saved', description: 'Role permissions updated. Changes apply on next navigation.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save permissions', description: error.message, variant: 'destructive' });
    },
  });

  const toggle = (role: AppRole, section: SectionName) => {
    setPermissions((prev) => {
      const current = prev[role] ?? [];
      const updated = current.includes(section)
        ? current.filter((s) => s !== section)
        : [...current, section];
      return { ...prev, [role]: updated };
    });
    setDirty(true);
  };

  const isAllowed = (role: AppRole, section: SectionName) =>
    (permissions[role] ?? []).includes(section);

  const handleSave = () => saveMutation.mutate();

  const handleReset = () => {
    setPermissions({ ...DEFAULT_ROLE_SECTIONS });
    setDirty(true);
    toast({ title: 'Reset to defaults', description: 'Review and save to apply the default matrix.' });
  };

  const resetRole = (role: AppRole) => {
    setPermissions((prev) => ({
      ...prev,
      [role]: [...(DEFAULT_ROLE_SECTIONS[role] ?? [])],
    }));
    setDirty(true);
    toast({ title: 'Role reset', description: `${ROLE_LABELS[role]} restored to default permissions. Save to apply.` });
  };

  // Toggle all sections for a role
  const toggleAll = (role: AppRole) => {
    const current = permissions[role] ?? [];
    const allGranted = ALL_SECTIONS.every((s) => current.includes(s));
    setPermissions((prev) => ({
      ...prev,
      [role]: allGranted ? [] : [...ALL_SECTIONS],
    }));
    setDirty(true);
  };

  // Toggle a section across all roles
  const toggleSection = (section: SectionName) => {
    const allGranted = ALL_ROLES.every((r) => (permissions[r] ?? []).includes(section));
    setPermissions((prev) => {
      const updated = { ...prev };
      for (const role of ALL_ROLES) {
        const current = updated[role] ?? [];
        updated[role] = allGranted
          ? current.filter((s) => s !== section)
          : current.includes(section)
          ? current
          : [...current, section];
      }
      return updated;
    });
    setDirty(true);
  };

  if (!canManage) return <UnauthorizedAccess />;

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className={cn('font-bold text-foreground', embedded ? 'text-xl' : 'text-2xl')}>
              Role Management
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage system roles and the section permissions attached to each role.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled title="App roles are system-defined by the current schema and RLS policies.">
            <Plus className="h-4 w-4 mr-1.5" />
            New role
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1.5" />
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Role directory</p>
          <p className="text-xs text-muted-foreground">
            These are system app roles. Permission grants below are editable per company.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[180px]">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[260px]">Purpose</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Default scope</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Sections</th>
                <th className="px-4 py-3 font-semibold text-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map((row) => (
                <tr key={row.role} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.role}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.description}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded border border-border bg-muted/40 px-2 py-1 text-xs text-foreground">
                      {row.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.grantedCount} of {ALL_SECTIONS.length}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedRole(row.role)}>
                        <Pencil className="h-4 w-4 mr-1.5" />
                        Permissions
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetRole(row.role)} aria-label={`Reset ${row.label}`}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled title="System roles cannot be deleted from this screen." aria-label={`Delete ${row.label}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matrix table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[140px] sticky left-0 bg-muted/40 z-10">
                Section
              </th>
              {ALL_ROLES.map((role) => (
                <th key={role} className="px-3 py-3 text-center font-medium text-muted-foreground min-w-[110px]">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wide leading-tight">
                      {ROLE_LABELS[role]}
                    </span>
                    <button
                      onClick={() => toggleAll(role)}
                      className="text-[10px] text-primary hover:underline"
                      title={`Toggle all for ${ROLE_LABELS[role]}`}
                    >
                      toggle all
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_SECTIONS.map((section, idx) => (
              <tr
                key={section}
                className={cn(
                  'border-b border-border/60 transition-colors hover:bg-muted/20',
                  idx % 2 === 0 ? '' : 'bg-muted/10'
                )}
              >
                <td className="px-4 py-3 sticky left-0 bg-card z-10">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSection(section)}
                      className="text-[10px] text-primary hover:underline mr-1"
                      title={`Toggle all roles for ${section}`}
                    >
                      all
                    </button>
                    <span className="font-medium text-foreground">{section}</span>
                  </div>
                </td>
                {ALL_ROLES.map((role) => {
                  const allowed = isAllowed(role, section);
                  return (
                    <td key={role} className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggle(role, section)}
                        className={cn(
                          'inline-flex items-center justify-center rounded transition-colors p-0.5',
                          allowed
                            ? 'text-primary hover:text-primary/80'
                            : 'text-muted-foreground/40 hover:text-muted-foreground'
                        )}
                        title={`${allowed ? 'Revoke' : 'Grant'} ${section} access for ${ROLE_LABELS[role]}`}
                        aria-label={`${ROLE_LABELS[role]} - ${section}: ${allowed ? 'allowed' : 'denied'}`}
                        aria-pressed={allowed}
                      >
                        {allowed ? (
                          <CheckSquare className="h-5 w-5" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dirty && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          You have unsaved changes. Click "Save changes" to apply them.
        </p>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span>Section visible to role</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Square className="h-4 w-4 text-muted-foreground/40" />
          <span>Section hidden from role</span>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground flex items-center gap-1.5">
          <LockKeyhole className="h-3.5 w-3.5" />
          Role model notes
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Top-level app roles are system roles because <strong>profiles.role</strong>, route guards, and RLS policies all depend on the same role names.</li>
          <li>Permissions are stored in the company role matrix and apply to users after navigation refreshes.</li>
          <li>Individual nav items within a section may have additional role restrictions enforced in code.</li>
          <li>The <strong>Admin</strong> section's sensitive items (Users & Roles, Audit Log, etc.) are always restricted to admin roles regardless of this matrix.</li>
        </ul>
      </div>

      <Dialog open={!!selectedRole} onOpenChange={(open) => !open && setSelectedRole(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedRole && (
            <>
              <DialogHeader>
                <DialogTitle>Permissions: {ROLE_LABELS[selectedRole]}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Grant or revoke section access for this role. Save changes after closing the dialog to apply the company matrix.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_SECTIONS.map((section) => {
                    const allowed = isAllowed(selectedRole, section);
                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => toggle(selectedRole, section)}
                        className={cn(
                          'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                          allowed ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                        )}
                        aria-pressed={allowed}
                      >
                        <span>{section}</span>
                        {allowed ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => resetRole(selectedRole)}>
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Reset role
                  </Button>
                  <Button size="sm" onClick={() => setSelectedRole(null)}>
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
