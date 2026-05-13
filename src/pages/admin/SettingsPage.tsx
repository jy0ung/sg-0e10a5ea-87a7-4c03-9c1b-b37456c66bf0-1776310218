import React, { useState, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { changePassword, listProfiles, updateProfile, type ProfileRow } from '@/services/profileService';
import { saveBranding, uploadBrandingAsset } from '@/services/brandingService';
import { ROLE_LABELS } from '@/config/rolePermissions';
import { useBranding } from '@/contexts/BrandingContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Save, KeyRound, Power, Building2, Upload, Users, Search } from 'lucide-react';
import { getBranches } from '@/services/masterDataService';
import type { AppRole, BranchRecord } from '@/types';
import { profileUpdateSchema, type ProfileUpdateFormData, changePasswordSchema, type ChangePasswordFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';
import { useBeforeUnloadWarning } from '@/hooks/useBeforeUnloadWarning';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function formatRole(role?: string) {
  return role ? role.replace(/_/g, ' ') : 'Unassigned';
}

export default function SettingsPage() {
  const { user, refreshProfile } = useAuth();
  const { branding, refresh: refreshBranding } = useBranding();
  const { modules, setModuleActive, canManageModules, loading: modulesLoading } = useModuleAccess();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin';
  const [branchId, setBranchId] = useState<string>('none');
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [changingPassword, setChangingPassword] = useState(false);
  const [updatingModuleId, setUpdatingModuleId] = useState<string | null>(null);

  // Branding state
  const [brandingFields, setBrandingFields] = useState({
    company_name: '',
    legal_name: '',
    company_reg_no: '',
    app_name: '',
    app_short_name: '',
    address: '',
    support_email: '',
    support_phone: '',
    website: '',
    copyright_text: '',
  });
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Users / Roles state
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [pendingRoles, setPendingRoles] = useState<Record<string, AppRole>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const loginLogoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

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

  // Sync form with server profile data, but NEVER when the user is actively
  // editing (isDirty). This prevents auth token refreshes or background
  // profile updates from destroying unsaved form edits.
  useEffect(() => {
    if (user && !form.formState.isDirty) {
      form.reset({
        name: user.name || '',
        role: user.role || 'analyst',
        branch_id: user.branch_id || null,
      });
      setBranchId(user.branch_id || 'none');
    }
  }, [user, form]);

  // Warn on browser tab close / hard navigation when form is dirty.
  useBeforeUnloadWarning(form.formState.isDirty);

  // Block in-app React Router navigation when the profile form has unsaved changes.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      form.formState.isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    getBranches(user?.company_id || '').then(res => setBranches(res.data));
  }, [user?.company_id]);

  // Load company users when admin tab is available
  useEffect(() => {
    if (!isAdmin || !user?.company_id) return;
    setProfilesLoading(true);
    listProfiles(user.role === 'super_admin' ? undefined : user.company_id)
      .then(({ data }) => setProfiles(data))
      .finally(() => setProfilesLoading(false));
  }, [isAdmin, user?.company_id, user?.role]);

  // Sync branding DB values into local form state when branding loads
  useEffect(() => {
    setBrandingFields({
      company_name: branding.companyName,
      legal_name: branding.legalName ?? '',
      company_reg_no: branding.companyRegNo ?? '',
      app_name: branding.appName,
      app_short_name: branding.appShortName ?? '',
      address: branding.address ?? '',
      support_email: branding.supportEmail ?? '',
      support_phone: branding.supportPhone ?? '',
      website: branding.website ?? '',
      copyright_text: branding.copyrightText,
    });
  }, [branding]);

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
      // Reset to submitted values BEFORE refreshProfile() so the isDirty guard
      // in the useEffect below does not block the subsequent server-data sync.
      form.reset(data);
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleRoleSave = async (profileId: string) => {
    const newRole = pendingRoles[profileId];
    if (!newRole || !user) return;
    setSavingRoleId(profileId);
    const { error } = await updateProfile(
      { id: profileId, role: newRole },
      { actorId: user.id, companyId: user.company_id },
    );
    if (error) {
      toast.error('Failed to update role', { description: error });
    } else {
      toast.success('Role updated');
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
      setPendingRoles(prev => { const next = { ...prev }; delete next[profileId]; return next; });
    }
    setSavingRoleId(null);
  };

  const handleSaveBranding = async () => {
    if (!user?.company_id) return;
    setSavingBranding(true);
    const { error } = await saveBranding(user.company_id, {
      company_name: brandingFields.company_name || null,
      legal_name: brandingFields.legal_name || null,
      company_reg_no: brandingFields.company_reg_no || null,
      app_name: brandingFields.app_name || null,
      app_short_name: brandingFields.app_short_name || null,
      address: brandingFields.address || null,
      support_email: brandingFields.support_email || null,
      support_phone: brandingFields.support_phone || null,
      website: brandingFields.website || null,
      copyright_text: brandingFields.copyright_text || null,
    });
    if (error) {
      toast.error('Failed to save branding', { description: error });
    } else {
      toast.success('Branding saved');
      await refreshBranding();
    }
    setSavingBranding(false);
  };

  const handleAssetUpload = async (slot: 'logo' | 'login_logo' | 'favicon', file: File) => {
    if (!user?.company_id) return;
    setUploadingSlot(slot);
    const { error } = await uploadBrandingAsset(user.company_id, slot, file);
    if (error) {
      toast.error(`Failed to upload ${slot.replace('_', ' ')}`, { description: error });
    } else {
      toast.success('Asset uploaded');
      await refreshBranding();
    }
    setUploadingSlot(null);
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
      {/* Unsaved-changes navigation guard */}
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your profile. If you leave now, your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay and save</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blocker.proceed?.()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageHeader title="Settings" description="Manage your profile and preferences" breadcrumbs={[{ label: branding.appShortName || branding.appName, path: '/' }, { label: 'Settings' }]} />

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {canManageModules && <TabsTrigger value="modules">Modules</TabsTrigger>}
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="organization">Organization</TabsTrigger>}
        </TabsList>

        {/* ── Profile Tab ── */}
        <TabsContent value="profile">
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
                <div><p className="text-xs text-muted-foreground">Company</p><p className="text-foreground font-medium">{branding.companyName}</p></div>
                <div><p className="text-xs text-muted-foreground">App</p><p className="text-foreground font-medium">{branding.appName}</p></div>
                <div><p className="text-xs text-muted-foreground">Company ID</p><p className="text-foreground font-medium">{user?.company_id || ''}</p></div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Security Tab ── */}
        <TabsContent value="security">
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
        </TabsContent>

        {/* ── Modules Tab (admin only) ── */}
        {canManageModules && (
          <TabsContent value="modules">
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
          </TabsContent>
        )}

        {/* ── Users / Roles Tab (admin only) ── */}
        {isAdmin && (
          <TabsContent value="users">
            <div className="glass-panel p-6 space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">User Roles</h3>
                </div>
                <div className="relative max-w-xs w-full">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {profilesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading users...
                </div>
              ) : (
                <div className="space-y-2">
                  {profiles
                    .filter(p => {
                      const q = userSearch.toLowerCase();
                      return !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
                    })
                    .map(p => {
                      const isSelf = p.id === user?.id;
                      const isTargetSuperAdmin = p.role === 'super_admin';
                      const canEdit = !isSelf && !(isTargetSuperAdmin && user?.role !== 'super_admin');
                      const pending = pendingRoles[p.id];
                      const displayRole = pending ?? p.role;
                      const isDirty = Boolean(pending && pending !== p.role);

                      return (
                        <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                              {isSelf && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">You</span>}
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                                p.status === 'active' ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                : p.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                : 'bg-muted text-muted-foreground'
                              }`}>{p.status}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{p.email}</p>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <Select
                              value={displayRole}
                              disabled={!canEdit || savingRoleId === p.id}
                              onValueChange={v => setPendingRoles(prev => ({ ...prev, [p.id]: v as AppRole }))}
                            >
                              <SelectTrigger className="w-44 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([value, label]) => (
                                  // Only super_admin can grant/see super_admin option
                                  (value !== 'super_admin' || user?.role === 'super_admin') && (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  )
                                ))}
                              </SelectContent>
                            </Select>
                            {canEdit && isDirty && (
                              <Button
                                size="sm"
                                disabled={savingRoleId === p.id}
                                onClick={() => handleRoleSave(p.id)}
                              >
                                {savingRoleId === p.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Save className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {profiles.filter(p => {
                    const q = userSearch.toLowerCase();
                    return !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
                  }).length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* ── Organization Branding Tab (admin only) ── */}
        {isAdmin && (
          <TabsContent value="organization">
            <div className="space-y-6">
              <div className="glass-panel p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Organization &amp; Branding</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  These values are shown throughout the application. Changes take effect after the next page refresh.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input value={brandingFields.company_name} onChange={e => setBrandingFields(f => ({ ...f, company_name: e.target.value }))} placeholder="e.g. Fook Loi Group" />
                  </div>
                  <div className="space-y-2">
                    <Label>Legal Name</Label>
                    <Input value={brandingFields.legal_name} onChange={e => setBrandingFields(f => ({ ...f, legal_name: e.target.value }))} placeholder="Registered legal name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Company Registration No.</Label>
                    <Input value={brandingFields.company_reg_no} onChange={e => setBrandingFields(f => ({ ...f, company_reg_no: e.target.value }))} placeholder="e.g. 123456-A" />
                  </div>
                  <div className="space-y-2">
                    <Label>App Name</Label>
                    <Input value={brandingFields.app_name} onChange={e => setBrandingFields(f => ({ ...f, app_name: e.target.value }))} placeholder="e.g. Fook Loi Group UBS" />
                  </div>
                  <div className="space-y-2">
                    <Label>App Short Name</Label>
                    <Input value={brandingFields.app_short_name} onChange={e => setBrandingFields(f => ({ ...f, app_short_name: e.target.value }))} placeholder="e.g. FLC" />
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={brandingFields.website} onChange={e => setBrandingFields(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Support Email</Label>
                    <Input type="email" value={brandingFields.support_email} onChange={e => setBrandingFields(f => ({ ...f, support_email: e.target.value }))} placeholder="support@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Support Phone</Label>
                    <Input value={brandingFields.support_phone} onChange={e => setBrandingFields(f => ({ ...f, support_phone: e.target.value }))} placeholder="+60 3-XXXX XXXX" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Address</Label>
                    <Input value={brandingFields.address} onChange={e => setBrandingFields(f => ({ ...f, address: e.target.value }))} placeholder="Full business address" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Copyright Text</Label>
                    <Input value={brandingFields.copyright_text} onChange={e => setBrandingFields(f => ({ ...f, copyright_text: e.target.value }))} placeholder={`© ${new Date().getFullYear()} Company Name. All rights reserved.`} />
                  </div>
                </div>

                <Button onClick={handleSaveBranding} disabled={savingBranding} className="mt-2">
                  {savingBranding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Branding
                </Button>
              </div>

              {/* Logo uploads */}
              <div className="glass-panel p-6 space-y-5">
                <h3 className="text-sm font-semibold text-foreground">Brand Assets</h3>
                <p className="text-xs text-muted-foreground">Max 2 MB per file. Supported: PNG, JPG, SVG, WEBP.</p>

                <div className="grid sm:grid-cols-3 gap-6">
                  {/* Logo */}
                  <div className="space-y-3">
                    <Label>App Logo</Label>
                    {branding.logoUrl && (
                      <img src={branding.logoUrl} alt="Current logo" className="h-14 w-14 rounded-md object-contain border border-border" />
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleAssetUpload('logo', file);
                      }}
                    />
                    <Button variant="outline" size="sm" disabled={uploadingSlot === 'logo'} onClick={() => logoInputRef.current?.click()}>
                      {uploadingSlot === 'logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Upload Logo
                    </Button>
                  </div>

                  {/* Login Logo */}
                  <div className="space-y-3">
                    <Label>Login Page Logo</Label>
                    {branding.loginLogoUrl && (
                      <img src={branding.loginLogoUrl} alt="Current login logo" className="h-14 w-14 rounded-md object-contain border border-border" />
                    )}
                    <input
                      ref={loginLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleAssetUpload('login_logo', file);
                      }}
                    />
                    <Button variant="outline" size="sm" disabled={uploadingSlot === 'login_logo'} onClick={() => loginLogoInputRef.current?.click()}>
                      {uploadingSlot === 'login_logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Upload Login Logo
                    </Button>
                  </div>

                  {/* Favicon */}
                  <div className="space-y-3">
                    <Label>Favicon</Label>
                    {branding.faviconUrl && (
                      <img src={branding.faviconUrl} alt="Current favicon" className="h-14 w-14 rounded-md object-contain border border-border" />
                    )}
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleAssetUpload('favicon', file);
                      }}
                    />
                    <Button variant="outline" size="sm" disabled={uploadingSlot === 'favicon'} onClick={() => faviconInputRef.current?.click()}>
                      {uploadingSlot === 'favicon' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Upload Favicon
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

