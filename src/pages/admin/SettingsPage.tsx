import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { changePassword, updateProfile } from '@/services/profileService';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Save, KeyRound, Power } from 'lucide-react';
import { getBranches } from '@/services/masterDataService';
import type { BranchRecord } from '@/types';
import { profileUpdateSchema, type ProfileUpdateFormData, changePasswordSchema, type ChangePasswordFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';

function formatRole(role?: string) {
  return role ? role.replace(/_/g, ' ') : 'Unassigned';
}

export default function SettingsPage() {
  const { user, refreshProfile } = useAuth();
  const { modules, setModuleActive, canManageModules, loading: modulesLoading } = useModuleAccess();
  const [branchId, setBranchId] = useState<string>('none');
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [changingPassword, setChangingPassword] = useState(false);
  const [updatingModuleId, setUpdatingModuleId] = useState<string | null>(null);

  const passwordForm = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onChange',
  });

  const form = useForm<ProfileUpdateFormData>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      name: user?.name || '',
      role: user?.role || 'analyst',
      branch_id: user?.branch_id || null,
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name || '',
        role: user.role || 'analyst',
        branch_id: user.branch_id || null,
      });
      setBranchId(user.branch_id || 'none');
    }
  }, [user, form]);

  useEffect(() => {
    getBranches(user?.company_id || '').then(res => setBranches(res.data));
  }, [user?.company_id]);

  const handleChangePassword = async (data: ChangePasswordFormData) => {
    if (!user) return;
    setChangingPassword(true);
    try {
      const { error, code } = await changePassword(
        user.email,
        data.currentPassword,
        data.newPassword,
      );
      if (code === 'wrong_current') {
        passwordForm.setError('currentPassword', { message: 'Current password is incorrect' });
        setChangingPassword(false);
        return;
      }
      if (error) throw new Error(error);
      toast.success('Password updated successfully');
      passwordForm.reset();
    } catch (err) {
      toast.error('Failed to update password', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSave = async (data: ProfileUpdateFormData) => {
    if (!user) return;
    setSaving(true);
    const { error } = await updateProfile({
      id: user.id,
      name: data.name,
      branch_id: data.branch_id,
    }, {
      actorId: user.id,
      companyId: user.company_id,
    });

    if (error) {
      toast.error('Failed to update profile: ' + error);
    } else {
      toast.success('Profile updated successfully');
      await refreshProfile();
    }
    setSaving(false);
  };

  const configurableModules = modules.filter(module => Boolean(module.path));

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
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Settings" description="Manage your profile and preferences" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Settings' }]} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Your Profile</h3>

          <form onSubmit={form.handleSubmit(handleSave)}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email || ''} disabled className="bg-muted/50" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input id="name" {...form.register('name')} placeholder="Your name" />
                {form.formState.errors.name && (
                  <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={formatRole(user?.role)} disabled className="bg-muted/50 capitalize" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch">Branch Assignment</Label>
                <Select value={branchId} onValueChange={(v) => {
                  setBranchId(v);
                  form.setValue('branch_id', v === 'none' ? null : v);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No branch assigned</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
                <p className="font-medium text-foreground">Your Access Level</p>
                <p className="text-muted-foreground">
                  Scope: <strong className="text-foreground capitalize">{user?.access_scope || 'company'}</strong>
                  {' • '}Role: <strong className="text-foreground capitalize">{formatRole(user?.role)}</strong>
                  {branchId !== 'none' && <> • Branch: <strong className="text-foreground">{branchId}</strong></>}
                </p>
              </div>

              <Button type="submit" disabled={saving || !form.formState.isValid} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </form>
        </div>

        <div className="glass-panel p-6 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Company Information</h3>
          <div className="space-y-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Company</p><p className="text-foreground font-medium">FLC Auto Group</p></div>
            <div><p className="text-xs text-muted-foreground">Company Code</p><p className="text-foreground font-medium">FLC</p></div>
            <div><p className="text-xs text-muted-foreground">Company ID</p><p className="text-foreground font-medium">{user?.company_id || ''}</p></div>
            <div><p className="text-xs text-muted-foreground">Platform</p><p className="text-foreground font-medium">FLC BI v1.0</p></div>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6 space-y-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Module Availability</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-2 max-w-2xl">
              Disable a module to move it into Coming Soon, hide it from the working navigation, and block direct access without breaking existing links.
            </p>
          </div>
          {!canManageModules && (
            <p className="text-xs text-muted-foreground">Read-only. Only company admins can change module access.</p>
          )}
        </div>

        <div className="space-y-3">
          {configurableModules.map(module => {
            const statusLabel = !module.isToggleable
              ? 'Core module'
              : module.isActive
                ? 'Active'
                : 'Coming soon';

            return (
              <div key={module.id} className="rounded-xl border border-border/60 bg-secondary/30 p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{module.name}</p>
                    <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-2xl">{module.description}</p>
                </div>

                <div className="flex items-center gap-3 self-end md:self-auto">
                  {updatingModuleId === module.id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  <Switch
                    checked={module.isActive}
                    disabled={!canManageModules || !module.isToggleable || modulesLoading || updatingModuleId === module.id}
                    onCheckedChange={(checked) => handleModuleToggle(module.id, module.name, checked)}
                    aria-label={`Toggle ${module.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Change Password */}
      <div className="glass-panel p-6 space-y-5 max-w-md">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
        </div>
        <form onSubmit={passwordForm.handleSubmit(handleChangePassword)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="Enter current password"
              {...passwordForm.register('currentPassword')}
              className={passwordForm.formState.errors.currentPassword ? 'border-destructive' : ''}
            />
            {passwordForm.formState.errors.currentPassword && (
              <p className="text-destructive text-xs">{passwordForm.formState.errors.currentPassword.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="At least 8 characters"
              {...passwordForm.register('newPassword')}
              className={passwordForm.formState.errors.newPassword ? 'border-destructive' : ''}
            />
            {passwordForm.formState.errors.newPassword && (
              <p className="text-destructive text-xs">{passwordForm.formState.errors.newPassword.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter new password"
              {...passwordForm.register('confirmPassword')}
              className={passwordForm.formState.errors.confirmPassword ? 'border-destructive' : ''}
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="text-destructive text-xs">{passwordForm.formState.errors.confirmPassword.message}</p>
            )}
          </div>
          <Button
            type="submit"
            disabled={changingPassword || !passwordForm.formState.isValid}
            className="w-full"
          >
            {changingPassword
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating...</>
              : <><KeyRound className="h-4 w-4 mr-2" />Update Password</>
            }
          </Button>
        </form>
      </div>
    </div>
  );
}
