import React, { useEffect, useState } from 'react';
import { Shield, RotateCcw, Save, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ALL_SECTIONS,
  DEFAULT_ROLE_SECTIONS,
  ROLE_LABELS,
  loadRolePermissions,
  saveRolePermissions,
  resetRolePermissions,
  type SectionName,
} from '@/config/rolePermissions';
import type { AppRole } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRoleSections, saveRoleSections } from '@/services/roleSectionService';

const ALL_ROLES: AppRole[] = [
  'super_admin',
  'company_admin',
  'director',
  'general_manager',
  'manager',
  'sales',
  'accounts',
  'analyst',
  'creator_updater',
];

export default function RolePermissionsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Record<AppRole, SectionName[]>>(
    () => loadRolePermissions()
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate from DB on mount; DB wins over the localStorage snapshot.
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await fetchRoleSections(user.company_id);
      if (cancelled || !data) return;
      // Merge with defaults so newly-added sections show up until persisted.
      const merged: Record<AppRole, SectionName[]> = { ...DEFAULT_ROLE_SECTIONS };
      for (const role of Object.keys(data) as AppRole[]) {
        merged[role] = data[role];
      }
      setPermissions(merged);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);

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

  const handleSave = async () => {
    if (!user?.company_id) return;
    setSaving(true);
    try {
      // Persist every role's allowed sections in parallel.
      const results = await Promise.all(
        (Object.keys(permissions) as AppRole[]).map((role) =>
          saveRoleSections(user.company_id, role, permissions[role] ?? []),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        toast({
          title: 'Failed to save permissions',
          description: failed.error.message,
          variant: 'destructive',
        });
        return;
      }
      saveRolePermissions(permissions);
      setDirty(false);
      toast({ title: 'Permissions saved', description: 'Role permissions updated. Changes apply on next navigation.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    resetRolePermissions();
    setPermissions({ ...DEFAULT_ROLE_SECTIONS });
    setDirty(false);
    toast({ title: 'Reset to defaults', description: 'All role permissions restored to defaults.' });
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

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Role Permissions</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Control which navigation sections each role can access. Changes take effect after navigating.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
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
        <p className="font-medium text-foreground">Notes</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Permissions are stored locally in this browser. They apply to all users on this device.</li>
          <li>Individual nav items within a section may have additional role restrictions enforced in code.</li>
          <li>The <strong>Admin</strong> section's sensitive items (Users & Roles, Audit Log, etc.) are always restricted to admin roles regardless of this matrix.</li>
        </ul>
      </div>
    </div>
  );
}
