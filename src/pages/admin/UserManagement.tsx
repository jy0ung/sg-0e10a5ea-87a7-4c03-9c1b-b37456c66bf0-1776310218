import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Loader2, Save, Settings, UserPlus, Copy, Check, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AppRole, AccessScope, ROLE_DEFAULT_SCOPE } from '@/types';
import { getBranches } from '@/services/masterDataService';
import type { BranchRecord } from '@/types';
import { PermissionEditor } from '@/components/admin/PermissionEditor';
import { userUpdateSchema, inviteUserSchema, type UserUpdateFormData, type InviteUserFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string;
  branch_id: string | null;
  access_scope: string;
  created_at: string;
}

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

const SCOPES: { value: AccessScope; label: string }[] = [
  { value: 'self', label: 'Self — own records only' },
  { value: 'branch', label: 'Branch — assigned branch' },
  { value: 'company', label: 'Company — full company' },
  { value: 'global', label: 'Global — all companies' },
];

function scopeLabel(scope: string): string {
  return SCOPES.find(s => s.value === scope)?.label || scope;
}

export default function UserManagement() {
  const { user, hasRole } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<ProfileRow | null>(null);
  const [editBranch, setEditBranch] = useState<string>('none');
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [permissionUserId, setPermissionUserId] = useState<string>('');
  const [permissionUserName, setPermissionUserName] = useState<string>('');
  const [permissionUserRole, setPermissionUserRole] = useState<string>('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [signupUrl, setSignupUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const editForm = useForm<UserUpdateFormData>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      name: '',
      role: 'analyst',
      access_scope: 'company',
      branch_id: null,
    },
    mode: 'onChange',
  });

  const canManage = hasRole(['super_admin', 'company_admin']);

  const inviteForm = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      name: '',
      role: 'analyst',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    async function load() {
      const [profileRes, branchRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, name, role, company_id, branch_id, access_scope, created_at')
          .order('created_at', { ascending: true }),
        getBranches(user?.company_id || ''),
      ]);
      if (profileRes.error) {
        toast.error('Failed to load users: ' + profileRes.error.message);
      }
      setProfiles((profileRes.data || []) as unknown as ProfileRow[]);
      setBranches(branchRes.data);
      setLoading(false);
    }
    load();
  }, [user?.company_id]);

  if (!canManage) return <UnauthorizedAccess />;

  const openEdit = (p: ProfileRow) => {
    setEditUser(p);
    setEditBranch(p.branch_id || 'none');
    editForm.reset({
      name: p.name,
      role: p.role as UserUpdateFormData['role'],
      access_scope: p.access_scope as UserUpdateFormData['access_scope'],
      branch_id: p.branch_id,
    });
  };

  const openPermissions = (p: ProfileRow) => {
    setPermissionUserId(p.id);
    setPermissionUserName(p.name);
    setPermissionUserRole(p.role);
  };

  const handleSave = async () => {
    if (!editUser) return;
    const data = editForm.getValues();
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: data.name,
        role: data.role,
        access_scope: data.access_scope,
        branch_id: data.branch_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editUser.id);
    if (error) {
      toast.error('Failed to update user: ' + error.message);
    } else {
      toast.success('User updated successfully');
      setProfiles(prev => prev.map(p => p.id === editUser.id ? { ...p, role: data.role, access_scope: data.access_scope, branch_id: data.branch_id } : p));
      setEditUser(null);
    }
    setSaving(false);
  };

  const getSignupUrl = () => {
    const origin = window.location.origin;
    return `${origin}/signup`;
  };

  const handleCopySignupLink = async () => {
    const url = getSignupUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Sign-up link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleInvite = async (data: InviteUserFormData) => {
    setInviting(true);

    const { data: result, error } = await supabase.functions.invoke('invite-user', {
      body: {
        email: data.email,
        name: data.name,
        role: data.role,
        company_id: user?.company_id || '',
      },
    });

    setInviting(false);

    if (error) {
      toast.error('Failed to send invitation: ' + error.message);
      return;
    }

    if (result?.error) {
      toast.error('Failed to send invitation: ' + result.error);
      return;
    }

    toast.success(`Invitation sent to ${data.email}`);
    setSignupUrl(getSignupUrl());
    inviteForm.reset();

    // Reload profiles to show the new user
    const { data: refreshed } = await supabase
      .from('profiles')
      .select('id, email, name, role, company_id, branch_id, access_scope, created_at')
      .order('created_at', { ascending: true });
    if (refreshed) {
      setProfiles(refreshed as unknown as ProfileRow[]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Users & Roles" description="Manage platform users, roles, and access scope" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Users & Roles' }]} />
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopySignupLink}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied' : 'Copy Sign-Up Link'}
            </Button>
            <Button size="sm" onClick={() => { setInviteOpen(true); setSignupUrl(''); }}>
              <UserPlus className="h-4 w-4 mr-1" />
              Invite User
            </Button>
          </div>
        )}
      </div>
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Name</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Email</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Role</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Access Scope</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Branch</th>
              {canManage && <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
            {profiles.map(p => (
              <tr key={p.id} className="data-table-row">
                <td className="px-4 py-3 text-foreground font-medium flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <span className="text-primary text-xs font-semibold">{p.name.charAt(0)}</span>
                  </div>
                  {p.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{p.email}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-foreground capitalize">
                    <Shield className="h-3 w-3 text-primary" />
                    {p.role.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.access_scope} />
                </td>
                <td className="px-4 py-3 text-foreground">{p.branch_id || '—'}</td>
                {canManage && (
                  <td className="px-4 py-3 flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => openPermissions(p)}>
                      <Settings className="h-3.5 w-3.5 mr-1" />Permissions
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User: {editUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...editForm.register('name')} className={editForm.formState.errors.name ? 'border-destructive' : ''} />
              {editForm.formState.errors.name && (
                <p className="text-destructive text-xs">{editForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.watch('role')} onValueChange={(v) => {
                editForm.setValue('role', v as UserUpdateFormData['role']);
                const defaultScope = ROLE_DEFAULT_SCOPE[v as AppRole] || 'company';
                editForm.setValue('access_scope', defaultScope as UserUpdateFormData['access_scope']);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Access Scope</Label>
              <Select value={editForm.watch('access_scope')} onValueChange={(v) => {
                editForm.setValue('access_scope', v as UserUpdateFormData['access_scope']);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This user can access: <strong className="text-foreground capitalize">{editForm.watch('access_scope')}</strong>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Branch Assignment</Label>
              <Select value={editBranch} onValueChange={(v) => {
                setEditBranch(v);
                editForm.setValue('branch_id', v === 'none' ? null : v);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch assigned</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
              <p className="font-medium text-foreground">Access Summary</p>
              <p className="text-muted-foreground">
                {editForm.watch('access_scope') === 'global' && 'Can see all companies and all data.'}
                {editForm.watch('access_scope') === 'company' && `Can see all data within company ${editUser?.company_id}.`}
                {editForm.watch('access_scope') === 'branch' && `Can see all data in branch ${editBranch === 'none' ? '(unassigned)' : editBranch} within company ${editUser?.company_id}.`}
                {editForm.watch('access_scope') === 'self' && `Can only see records assigned to this user within company ${editUser?.company_id}.`}
              </p>
            </div>

            <Button onClick={editForm.handleSubmit(handleSave)} disabled={saving || !editForm.formState.isValid} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permission Editor Dialog */}
      <Dialog open={!!permissionUserId} onOpenChange={(open) => !open && setPermissionUserId('')}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          {permissionUserId && (
            <PermissionEditor
              userId={permissionUserId}
              userName={permissionUserName}
              userRole={permissionUserRole}
              onSave={() => {
                setPermissionUserId('');
                toast.success('Permissions saved successfully');
              }}
              onCancel={() => setPermissionUserId('')}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { if (!open) { setInviteOpen(false); setSignupUrl(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {signupUrl ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center space-y-2">
                  <CheckCircle className="h-8 w-8 text-primary mx-auto" />
                  <p className="text-sm font-medium text-foreground">Invitation sent!</p>
                  <p className="text-xs text-muted-foreground">
                    The user will receive an email with a link to set up their account.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Sign-Up Page Link</Label>
                  <p className="text-xs text-muted-foreground">
                    You can also share this link directly with the user:
                  </p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={signupUrl} className="bg-secondary text-xs" />
                    <Button variant="outline" size="sm" onClick={handleCopySignupLink}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <Button className="w-full" variant="outline" onClick={() => { setInviteOpen(false); setSignupUrl(''); }}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={inviteForm.handleSubmit(handleInvite)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    {...inviteForm.register('email')}
                    className={inviteForm.formState.errors.email ? 'border-destructive' : ''}
                    placeholder="user@company.com"
                  />
                  {inviteForm.formState.errors.email && (
                    <p className="text-destructive text-xs">{inviteForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    type="text"
                    {...inviteForm.register('name')}
                    className={inviteForm.formState.errors.name ? 'border-destructive' : ''}
                    placeholder="John Doe"
                  />
                  {inviteForm.formState.errors.name && (
                    <p className="text-destructive text-xs">{inviteForm.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteForm.watch('role')} onValueChange={(v) => inviteForm.setValue('role', v as InviteUserFormData['role'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
                  <p className="font-medium text-foreground">What happens next?</p>
                  <p className="text-muted-foreground">
                    An invitation email will be sent to the user with a link to set up their account and password on the sign-up page.
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={inviting || !inviteForm.formState.isValid}>
                  {inviting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending invitation...</>
                  ) : (
                    <><UserPlus className="h-4 w-4 mr-2" />Send Invitation</>
                  )}
                </Button>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
