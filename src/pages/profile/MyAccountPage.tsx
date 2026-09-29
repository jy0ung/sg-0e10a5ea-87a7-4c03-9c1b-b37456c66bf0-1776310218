import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { NavLink, useBlocker } from 'react-router-dom';
import { toast } from 'sonner';
import { changePassword, updateOwnProfile } from '@flc/auth';
import { PageHeader } from '@/components/shared/PageHeader';
import { NotificationSettings } from '@/components/shared/NotificationSettings';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useBeforeUnloadWarning } from '@/hooks/useBeforeUnloadWarning';
import { STALE } from '@/lib/queryClient';
import {
  changePasswordSchema,
  profileUpdateSchema,
  type ChangePasswordFormData,
  type ProfileUpdateFormData,
} from '@/lib/validations';
import { getBranches } from '@/services/masterDataService';
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
import { ProfileSettings, SecuritySettings } from '@/pages/admin/settings/SettingsSections';

export type AccountSection = 'profile' | 'security' | 'notifications';

const ACCOUNT_LINKS: { section: AccountSection; label: string; path: string }[] = [
  { section: 'profile', label: 'Profile', path: '/profile' },
  { section: 'security', label: 'Security', path: '/profile/security' },
  { section: 'notifications', label: 'Notifications', path: '/profile/notifications' },
];

function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  useBeforeUnloadWarning(dirty);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  return (
    <AlertDialog open={blocker.state === 'blocked'}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>Your account changes will be lost if you leave this page.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay and save</AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.proceed?.()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Leave without saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PersonalProfile() {
  const { user, refreshProfile } = useAuth();
  const { branding } = useBranding();
  const [saving, setSaving] = useState(false);
  const form = useForm<ProfileUpdateFormData>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { name: user?.name || '' },
    mode: 'onChange',
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches', user?.company_id],
    queryFn: () => getBranches(user!.company_id || '').then(result => result.data),
    enabled: !!user?.company_id,
    staleTime: STALE.reference,
  });

  useEffect(() => {
    if (user && !form.formState.isDirty) form.reset({ name: user.name || '' });
  }, [user, form]);

  const handleSave = async (data: ProfileUpdateFormData) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await updateOwnProfile(data.name);
      if (error) {
        toast.error('Failed to update profile: ' + error);
        return;
      }
      form.reset(data);
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile', { description: error instanceof Error ? error.message : 'An unexpected error occurred.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <UnsavedChangesGuard dirty={form.formState.isDirty} />
      <ProfileSettings form={form} user={user} branches={branches} branding={branding} saving={saving} onSave={handleSave} />
    </>
  );
}

function PersonalSecurity() {
  const { user } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const form = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onChange',
  });

  const handleChangePassword = async (data: ChangePasswordFormData) => {
    if (!user) return;
    setChangingPassword(true);
    try {
      const { error, code } = await changePassword(user.email, data.currentPassword, data.newPassword);
      if (code === 'wrong_current') {
        form.setError('currentPassword', { message: 'Current password is incorrect' });
        return;
      }
      if (error) throw new Error(error);
      form.reset();
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error('Failed to update password', { description: error instanceof Error ? error.message : 'An unexpected error occurred.' });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <>
      <UnsavedChangesGuard dirty={form.formState.isDirty} />
      <SecuritySettings form={form} changingPassword={changingPassword} onChangePassword={handleChangePassword} />
    </>
  );
}

export default function MyAccountPage({ section }: { section: AccountSection }) {
  const current = ACCOUNT_LINKS.find(link => link.section === section)!;
  return (
    <div className="space-y-6 motion-safe:animate-fade-in">
      <PageHeader
        title={section === 'profile' ? 'My Profile' : current.label}
        description="Manage your personal account and preferences."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'My Account', path: '/profile' }, ...(section === 'profile' ? [] : [{ label: current.label }])]}
      />
      <nav aria-label="My Account" className="flex flex-wrap gap-2 border-b border-border pb-3">
        {ACCOUNT_LINKS.map(link => (
          <NavLink
            key={link.section}
            to={link.path}
            end={link.section === 'profile'}
            className={({ isActive }) => `rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      {section === 'profile' && <PersonalProfile />}
      {section === 'security' && <PersonalSecurity />}
      {section === 'notifications' && <NotificationSettings />}
    </div>
  );
}
