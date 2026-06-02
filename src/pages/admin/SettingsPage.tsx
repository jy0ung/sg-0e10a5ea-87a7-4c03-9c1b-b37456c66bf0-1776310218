import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { useBlocker } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { changePassword, listProfiles, updateProfile, type ProfileRow } from '@flc/auth';
import { saveBranding, uploadBrandingAsset } from '@flc/platform-services';
import { useBranding } from '@/contexts/BrandingContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { getBranches } from '@/services/masterDataService';
import { DEFAULT_APP_ROLE, type AppRole, type BranchRecord } from '@/types';
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
import {
  ModuleSettings,
  OrganizationBrandingSettings,
  ProfileSettings,
  SecuritySettings,
  UserRoleSettings,
  type BrandingFields,
} from './settings/SettingsSections';

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
  const [brandingFields, setBrandingFields] = useState<BrandingFields>({
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
      role: user?.role || DEFAULT_APP_ROLE,
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
        role: user.role || DEFAULT_APP_ROLE,
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

  const { data: fetchedBranches = [] } = useQuery({
    queryKey: ['branches', user?.company_id],
    queryFn: () => getBranches(user!.company_id || '').then(r => r.data),
    enabled: !!user?.company_id,
    staleTime: STALE.reference,
  });

  useEffect(() => {
    setBranches(fetchedBranches);
  }, [fetchedBranches]);

  const { data: fetchedProfiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['profiles', isAdmin ? (user?.role === 'super_admin' ? 'all' : user?.company_id) : null],
    queryFn: () =>
      listProfiles(user?.role === 'super_admin' ? undefined : user?.company_id ?? undefined)
        .then(r => r.data),
    enabled: isAdmin && !!user?.company_id,
    staleTime: STALE.reference,
  });

  useEffect(() => {
    setProfiles(fetchedProfiles);
  }, [fetchedProfiles]);

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

        <TabsContent value="profile">
          <ProfileSettings
            form={form}
            user={user}
            branches={branches}
            branchId={branchId}
            setBranchId={setBranchId}
            branding={branding}
            saving={saving}
            onSave={handleSave}
          />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings
            form={passwordForm}
            changingPassword={changingPassword}
            onChangePassword={handleChangePassword}
          />
        </TabsContent>

        {canManageModules && (
          <TabsContent value="modules">
            <ModuleSettings
              modules={configurableModules}
              canManageModules={canManageModules}
              modulesLoading={modulesLoading}
              updatingModuleId={updatingModuleId}
              onModuleToggle={handleModuleToggle}
            />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="users">
            <UserRoleSettings
              profiles={profiles}
              profilesLoading={profilesLoading}
              pendingRoles={pendingRoles}
              savingRoleId={savingRoleId}
              userSearch={userSearch}
              user={user}
              setUserSearch={setUserSearch}
              setPendingRoles={setPendingRoles}
              onRoleSave={handleRoleSave}
            />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="organization">
            <OrganizationBrandingSettings
              branding={branding}
              brandingFields={brandingFields}
              savingBranding={savingBranding}
              uploadingSlot={uploadingSlot}
              logoInputRef={logoInputRef}
              loginLogoInputRef={loginLogoInputRef}
              faviconInputRef={faviconInputRef}
              setBrandingFields={setBrandingFields}
              onSaveBranding={handleSaveBranding}
              onAssetUpload={handleAssetUpload}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
