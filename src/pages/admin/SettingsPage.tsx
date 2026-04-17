import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Save, KeyRound } from 'lucide-react';
import { getBranches } from '@/services/masterDataService';
import type { BranchRecord } from '@/types';
import { AppRole, AccessScope, ROLE_DEFAULT_SCOPE } from '@/types';
import { profileUpdateSchema, type ProfileUpdateFormData, changePasswordSchema, type ChangePasswordFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const ROLES: { value: AppRole; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'company_admin', label: 'Company Admin' },
  { value: 'director', label: 'Director' },
  { value: 'general_manager', label: 'General Manager' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales', label: 'Sales' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'analyst', label: 'Analyst' },
];

export default function SettingsPage() {
  const { user, refreshProfile } = useAuth();
  const [branchId, setBranchId] = useState<string>('none');
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [changingPassword, setChangingPassword] = useState(false);

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

  const handleRoleChange = (newRole: string) => {
    form.setValue('role', newRole as ProfileUpdateFormData['role']);
  };

  const handleChangePassword = async (data: ChangePasswordFormData) => {
    if (!user) return;
    setChangingPassword(true);
    try {
      // Re-authenticate with current password first
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: data.currentPassword,
      });
      if (authError) {
        passwordForm.setError('currentPassword', { message: 'Current password is incorrect' });
        setChangingPassword(false);
        return;
      }
      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password: data.newPassword });
      if (updateError) throw updateError;
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
    const newScope = ROLE_DEFAULT_SCOPE[data.role] || 'company';
    const { error } = await supabase
      .from('profiles')
      .update({
        name: data.name,
        role: data.role,
        branch_id: data.branch_id,
        access_scope: newScope,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update profile: ' + error.message);
    } else {
      toast.success('Profile updated successfully');
      await refreshProfile();
    }
    setSaving(false);
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
                <Select value={form.watch('role')} onValueChange={handleRoleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  Scope: <strong className="text-foreground capitalize">{ROLE_DEFAULT_SCOPE[form.watch('role')] || 'company'}</strong>
                  {' • '}Role: <strong className="text-foreground capitalize">{form.watch('role').replace(/_/g, ' ')}</strong>
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
