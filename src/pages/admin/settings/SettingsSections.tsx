/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Building2, KeyRound, Loader2, Power, Save, Search, Upload, Users } from 'lucide-react';
import { ROLE_LABELS } from '@/config/rolePermissions';
import type { ResolvedPlatformModule } from '@/lib/moduleAccess';
import type { ResolvedBranding } from '@/services/brandingService';
import type { ProfileRow } from '@/services/profileService';
import type { AppRole, BranchRecord } from '@/types';
import type { ChangePasswordFormData, ProfileUpdateFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type SettingsUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: AppRole | string | null;
  branch_id?: string | null;
  company_id?: string | null;
  access_scope?: string | null;
};

export interface BrandingFields {
  company_name: string;
  legal_name: string;
  company_reg_no: string;
  app_name: string;
  app_short_name: string;
  address: string;
  support_email: string;
  support_phone: string;
  website: string;
  copyright_text: string;
}

export function formatRole(role?: string | null) {
  return role ? role.replace(/_/g, ' ') : 'Unassigned';
}

interface ProfileSettingsProps {
  form: UseFormReturn<ProfileUpdateFormData>;
  user: SettingsUser | null | undefined;
  branches: BranchRecord[];
  branchId: string;
  setBranchId: (branchId: string) => void;
  branding: ResolvedBranding;
  saving: boolean;
  onSave: (data: ProfileUpdateFormData) => void | Promise<void>;
}

export function ProfileSettings({
  form,
  user,
  branches,
  branchId,
  setBranchId,
  branding,
  saving,
  onSave,
}: ProfileSettingsProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="glass-panel p-6 space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Your Profile</h3>
        <form onSubmit={form.handleSubmit(onSave)}>
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
              <Select
                value={branchId}
                onValueChange={(value) => {
                  setBranchId(value);
                  form.setValue('branch_id', value === 'none' ? null : value, { shouldDirty: true });
                }}
              >
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch assigned</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
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
  );
}

interface SecuritySettingsProps {
  form: UseFormReturn<ChangePasswordFormData>;
  changingPassword: boolean;
  onChangePassword: (data: ChangePasswordFormData) => void | Promise<void>;
}

export function SecuritySettings({ form, changingPassword, onChangePassword }: SecuritySettingsProps) {
  return (
    <div className="glass-panel p-6 space-y-5 max-w-md">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
      </div>
      <form onSubmit={form.handleSubmit(onChangePassword)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current Password</Label>
          <Input
            id="currentPassword"
            type="password"
            placeholder="Enter current password"
            {...form.register('currentPassword')}
            className={form.formState.errors.currentPassword ? 'border-destructive' : ''}
          />
          {form.formState.errors.currentPassword && (
            <p className="text-destructive text-xs">{form.formState.errors.currentPassword.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            id="newPassword"
            type="password"
            placeholder="At least 8 characters"
            {...form.register('newPassword')}
            className={form.formState.errors.newPassword ? 'border-destructive' : ''}
          />
          {form.formState.errors.newPassword && (
            <p className="text-destructive text-xs">{form.formState.errors.newPassword.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Re-enter new password"
            {...form.register('confirmPassword')}
            className={form.formState.errors.confirmPassword ? 'border-destructive' : ''}
          />
          {form.formState.errors.confirmPassword && (
            <p className="text-destructive text-xs">{form.formState.errors.confirmPassword.message}</p>
          )}
        </div>
        <Button
          type="submit"
          disabled={changingPassword || !form.formState.isValid}
          className="w-full"
        >
          {changingPassword
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating...</>
            : <><KeyRound className="h-4 w-4 mr-2" />Update Password</>
          }
        </Button>
      </form>
    </div>
  );
}

interface ModuleSettingsProps {
  modules: ResolvedPlatformModule[];
  canManageModules: boolean;
  modulesLoading: boolean;
  updatingModuleId: string | null;
  onModuleToggle: (moduleId: string, moduleName: string, nextState: boolean) => void | Promise<void>;
}

export function ModuleSettings({
  modules,
  canManageModules,
  modulesLoading,
  updatingModuleId,
  onModuleToggle,
}: ModuleSettingsProps) {
  return (
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
        {modules.map(module => {
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
                  onCheckedChange={(checked) => onModuleToggle(module.id, module.name, checked)}
                  aria-label={`Toggle ${module.name}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface UserRoleSettingsProps {
  profiles: ProfileRow[];
  profilesLoading: boolean;
  pendingRoles: Record<string, AppRole>;
  savingRoleId: string | null;
  userSearch: string;
  user: SettingsUser | null | undefined;
  setUserSearch: (search: string) => void;
  setPendingRoles: React.Dispatch<React.SetStateAction<Record<string, AppRole>>>;
  onRoleSave: (profileId: string) => void | Promise<void>;
}

export function UserRoleSettings({
  profiles,
  profilesLoading,
  pendingRoles,
  savingRoleId,
  userSearch,
  user,
  setUserSearch,
  setPendingRoles,
  onRoleSave,
}: UserRoleSettingsProps) {
  const visibleProfiles = profiles.filter(profile => {
    const query = userSearch.toLowerCase();
    return !query || profile.name.toLowerCase().includes(query) || profile.email.toLowerCase().includes(query);
  });

  return (
    <div className="glass-panel p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">User Roles</h3>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search users..."
            value={userSearch}
            onChange={event => setUserSearch(event.target.value)}
            aria-label="Search users"
            className="pl-8"
          />
        </div>
      </div>

      {profilesLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />Loading users...
        </div>
      ) : (
        <div className="space-y-2">
          {visibleProfiles.map(profile => {
            const isSelf = profile.id === user?.id;
            const isTargetSuperAdmin = profile.role === 'super_admin';
            const canEdit = !isSelf && !(isTargetSuperAdmin && user?.role !== 'super_admin');
            const pending = pendingRoles[profile.id];
            const displayRole = pending ?? profile.role;
            const isDirty = Boolean(pending && pending !== profile.role);

            return (
              <div key={profile.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{profile.name}</p>
                    {isSelf && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">You</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      profile.status === 'active' ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : profile.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                      : 'bg-muted text-muted-foreground'
                    }`}>{profile.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{profile.email}</p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Select
                    value={displayRole}
                    disabled={!canEdit || savingRoleId === profile.id}
                    onValueChange={value => setPendingRoles(prev => ({ ...prev, [profile.id]: value as AppRole }))}
                  >
                    <SelectTrigger className="w-44 text-sm" aria-label={`Role for ${profile.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([value, label]) => (
                        (value !== 'super_admin' || user?.role === 'super_admin') && (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        )
                      ))}
                    </SelectContent>
                  </Select>
                  {canEdit && isDirty && (
                    <Button
                      size="sm"
                      disabled={savingRoleId === profile.id}
                      onClick={() => onRoleSave(profile.id)}
                      aria-label={`Save role for ${profile.name}`}
                    >
                      {savingRoleId === profile.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Save className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {visibleProfiles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
          )}
        </div>
      )}
    </div>
  );
}

interface OrganizationBrandingSettingsProps {
  branding: ResolvedBranding;
  brandingFields: BrandingFields;
  savingBranding: boolean;
  uploadingSlot: string | null;
  logoInputRef: React.RefObject<HTMLInputElement | null>;
  loginLogoInputRef: React.RefObject<HTMLInputElement | null>;
  faviconInputRef: React.RefObject<HTMLInputElement | null>;
  setBrandingFields: React.Dispatch<React.SetStateAction<BrandingFields>>;
  onSaveBranding: () => void | Promise<void>;
  onAssetUpload: (slot: 'logo' | 'login_logo' | 'favicon', file: File) => void | Promise<void>;
}

export function OrganizationBrandingSettings({
  branding,
  brandingFields,
  savingBranding,
  uploadingSlot,
  logoInputRef,
  loginLogoInputRef,
  faviconInputRef,
  setBrandingFields,
  onSaveBranding,
  onAssetUpload,
}: OrganizationBrandingSettingsProps) {
  return (
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
            <Label htmlFor="branding-company-name">Company Name</Label>
            <Input id="branding-company-name" value={brandingFields.company_name} onChange={event => setBrandingFields(fields => ({ ...fields, company_name: event.target.value }))} placeholder="e.g. Fook Loi Group" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branding-legal-name">Legal Name</Label>
            <Input id="branding-legal-name" value={brandingFields.legal_name} onChange={event => setBrandingFields(fields => ({ ...fields, legal_name: event.target.value }))} placeholder="Registered legal name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branding-company-reg-no">Company Registration No.</Label>
            <Input id="branding-company-reg-no" value={brandingFields.company_reg_no} onChange={event => setBrandingFields(fields => ({ ...fields, company_reg_no: event.target.value }))} placeholder="e.g. 123456-A" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branding-app-name">App Name</Label>
            <Input id="branding-app-name" value={brandingFields.app_name} onChange={event => setBrandingFields(fields => ({ ...fields, app_name: event.target.value }))} placeholder="e.g. Fook Loi Group UBS" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branding-app-short-name">App Short Name</Label>
            <Input id="branding-app-short-name" value={brandingFields.app_short_name} onChange={event => setBrandingFields(fields => ({ ...fields, app_short_name: event.target.value }))} placeholder="e.g. FLC" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branding-website">Website</Label>
            <Input id="branding-website" value={brandingFields.website} onChange={event => setBrandingFields(fields => ({ ...fields, website: event.target.value }))} placeholder="https://example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branding-support-email">Support Email</Label>
            <Input id="branding-support-email" type="email" value={brandingFields.support_email} onChange={event => setBrandingFields(fields => ({ ...fields, support_email: event.target.value }))} placeholder="support@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branding-support-phone">Support Phone</Label>
            <Input id="branding-support-phone" value={brandingFields.support_phone} onChange={event => setBrandingFields(fields => ({ ...fields, support_phone: event.target.value }))} placeholder="+60 3-XXXX XXXX" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="branding-address">Address</Label>
            <Input id="branding-address" value={brandingFields.address} onChange={event => setBrandingFields(fields => ({ ...fields, address: event.target.value }))} placeholder="Full business address" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="branding-copyright-text">Copyright Text</Label>
            <Input id="branding-copyright-text" value={brandingFields.copyright_text} onChange={event => setBrandingFields(fields => ({ ...fields, copyright_text: event.target.value }))} placeholder={`© ${new Date().getFullYear()} Company Name. All rights reserved.`} />
          </div>
        </div>

        <Button onClick={onSaveBranding} disabled={savingBranding} className="mt-2">
          {savingBranding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Branding
        </Button>
      </div>

      <div className="glass-panel p-6 space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Brand Assets</h3>
        <p className="text-xs text-muted-foreground">Max 2 MB per file. Supported: PNG, JPG, SVG, WEBP.</p>

        <div className="grid sm:grid-cols-3 gap-6">
          <div className="space-y-3">
            <Label>App Logo</Label>
            {branding.logoUrl && (
              <img src={branding.logoUrl} alt="Current logo" className="h-14 w-14 rounded-md object-contain border border-border" />
            )}
            <input
              ref={logoInputRef}
              type="file"
              aria-label="Upload app logo"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void onAssetUpload('logo', file);
              }}
            />
            <Button variant="outline" size="sm" disabled={uploadingSlot === 'logo'} onClick={() => logoInputRef.current?.click()}>
              {uploadingSlot === 'logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Upload Logo
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Login Page Logo</Label>
            {branding.loginLogoUrl && (
              <img src={branding.loginLogoUrl} alt="Current login logo" className="h-14 w-14 rounded-md object-contain border border-border" />
            )}
            <input
              ref={loginLogoInputRef}
              type="file"
              aria-label="Upload login page logo"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void onAssetUpload('login_logo', file);
              }}
            />
            <Button variant="outline" size="sm" disabled={uploadingSlot === 'login_logo'} onClick={() => loginLogoInputRef.current?.click()}>
              {uploadingSlot === 'login_logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Upload Login Logo
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Favicon</Label>
            {branding.faviconUrl && (
              <img src={branding.faviconUrl} alt="Current favicon" className="h-14 w-14 rounded-md object-contain border border-border" />
            )}
            <input
              ref={faviconInputRef}
              type="file"
              aria-label="Upload favicon"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void onAssetUpload('favicon', file);
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
  );
}
