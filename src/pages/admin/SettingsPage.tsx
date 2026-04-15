import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { demoBranches } from '@/data/demo-data';
import { AppRole, AccessScope, ROLE_DEFAULT_SCOPE } from '@/types';
import { profileUpdateSchema, type ProfileUpdateFormData } from '@/lib/validations';
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
  const { user } = useAuth();
  const [branchId, setBranchId] = useState<string>('none');
  const [saving, setSaving] = useState(false);

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

  const handleRoleChange = (newRole: string) => {
    form.setValue('role', newRole as ProfileUpdateFormData['role']);
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
      window.location.reload();
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
                    {demoBranches.map((b) => (
                      <SelectItem key={b.id} value={b.code}>{b.name}</SelectItem>
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
            <div><p className="text-xs text-muted-foreground">Company ID</p><p className="text-foreground font-medium">{user?.company_id || 'c1'}</p></div>
            <div><p className="text-xs text-muted-foreground">Platform</p><p className="text-foreground font-medium">FLC BI v1.0</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
