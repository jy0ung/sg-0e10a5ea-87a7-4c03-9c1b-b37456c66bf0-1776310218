import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { listProfiles, updateProfile, inviteUser, type ProfileRow } from '@/services/profileService';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Loader2, Save, Settings, UserPlus, Copy, Check, CheckCircle, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AppRole, AccessScope, ROLE_DEFAULT_SCOPE } from '@/types';
import type { Employee } from '@/types';
import { getBranches } from '@/services/masterDataService';
import type { BranchRecord } from '@/types';
import { PermissionEditor } from '@/components/admin/PermissionEditor';
import { userUpdateSchema, inviteUserSchema, type UserUpdateFormData, type InviteUserFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { listEmployeeDirectory } from '@/services/hrmsService';

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
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [activating, setActivating] = useState<string>('');
  const [employeesByCompany, setEmployeesByCompany] = useState<Record<string, Employee[]>>({});
  const [pendingSelections, setPendingSelections] = useState<
    Record<string, { role: AppRole; company_id: string; employee_id: string | null }>
  >({});

  const editForm = useForm<UserUpdateFormData>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      name: '',
      role: 'analyst',
      access_scope: 'company',
      branch_id: null,
      employee_id: null,
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
      employee_id: null,
    },
    mode: 'onChange',
  });

  useEffect(() => {
    async function load() {
      const [profileRes, branchRes, companyRes] = await Promise.all([
        listProfiles(),
        getBranches(user?.company_id || ''),
        supabase.from('companies').select('id, name').order('name', { ascending: true }),
      ]);
      if (profileRes.error) {
        toast.error('Failed to load users: ' + profileRes.error);
      }
      setProfiles(profileRes.data);
      setBranches(branchRes.data);
      setCompanies((companyRes.data as { id: string; name: string }[] | null) ?? []);

      const companyIds = [...new Set(
        profileRes.data
          .map(profile => profile.company_id)
          .concat(user?.company_id ?? null)
          .filter((companyId): companyId is string => Boolean(companyId)),
      )];

      const employeeResults = await Promise.all(companyIds.map(async (companyId) => ({
        companyId,
        result: await listEmployeeDirectory(companyId),
      })));

      const nextEmployeesByCompany: Record<string, Employee[]> = {};
      for (const { companyId, result } of employeeResults) {
        if (!result.error) nextEmployeesByCompany[companyId] = result.data;
      }
      setEmployeesByCompany(nextEmployeesByCompany);

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
      employee_id: p.employee_id ?? null,
    });
  };

  const linkedEmployeeProfileIdByEmployeeId = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.employee_id) linkedEmployeeProfileIdByEmployeeId.set(profile.employee_id, profile.id);
  }

  function getEmployeeOptions(companyId: string | null | undefined, currentProfileId?: string) {
    if (!companyId) return [];
    return (employeesByCompany[companyId] ?? []).filter(employee => {
      const linkedProfileId = linkedEmployeeProfileIdByEmployeeId.get(employee.id);
      return !linkedProfileId || linkedProfileId === currentProfileId;
    });
  }

  function getEmployeeLabel(profile: ProfileRow) {
    if (!profile.employee_id || !profile.company_id) return 'Unlinked';
    const employee = (employeesByCompany[profile.company_id] ?? []).find(row => row.id === profile.employee_id);
    if (!employee) return profile.employee_id;
    return employee.staffCode ? `${employee.name} (${employee.staffCode})` : employee.name;
  }

  const openPermissions = (p: ProfileRow) => {
    setPermissionUserId(p.id);
    setPermissionUserName(p.name);
    setPermissionUserRole(p.role);
  };

  const handleSave = async () => {
    if (!editUser) return;
    const data = editForm.getValues();
    setSaving(true);
    const { error } = await updateProfile({
      id: editUser.id,
      name: data.name,
      role: data.role,
      access_scope: data.access_scope,
      branch_id: data.branch_id,
      employee_id: data.employee_id,
    });
    if (error) {
      toast.error('Failed to update user: ' + error);
    } else {
      toast.success('User updated successfully');
      setProfiles(prev => prev.map(p => p.id === editUser.id ? {
        ...p,
        name: data.name,
        role: data.role,
        access_scope: data.access_scope,
        branch_id: data.branch_id,
        employee_id: data.employee_id ?? null,
      } : p));
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
    const { error } = await inviteUser({
      email: data.email,
      name: data.name,
      role: data.role,
      companyId: user?.company_id || '',
      employeeId: data.employee_id,
    });
    setInviting(false);
    if (error) {
      toast.error('Failed to send invitation: ' + error);
      return;
    }
    toast.success(`Invitation sent to ${data.email}`);
    setSignupUrl(getSignupUrl());
    inviteForm.reset();
    const refreshed = await listProfiles();
    if (!refreshed.error) setProfiles(refreshed.data);
  };

  // Pending users: created without a company assignment (e.g. via the
  // Supabase Dashboard invite flow) or still flagged status='pending' by the
  // handle_new_user trigger. Admins activate them by assigning role + company.
  const pendingUsers = profiles.filter(p => !p.company_id || p.status === 'pending');
  const activeUsers = profiles.filter(p => p.company_id && p.status !== 'pending');

  const getPendingSelection = (p: ProfileRow) => {
    const current = pendingSelections[p.id];
    return {
      role: current?.role ?? (p.role || 'analyst'),
      company_id:
        current?.company_id
        ?? (p.company_id || (hasRole(['super_admin']) ? (companies[0]?.id ?? '') : (user?.company_id ?? ''))),
      employee_id: current?.employee_id ?? (p.employee_id ?? null),
    };
  };

  const setPendingRole = (id: string, role: AppRole) => {
    setPendingSelections(prev => ({ ...prev, [id]: { ...getPendingSelection({ id } as ProfileRow), ...prev[id], role } }));
  };
  const setPendingCompany = (id: string, company_id: string) => {
    setPendingSelections(prev => ({ ...prev, [id]: { ...getPendingSelection({ id } as ProfileRow), ...prev[id], company_id } }));
  };
  const setPendingEmployee = (id: string, employee_id: string | null) => {
    setPendingSelections(prev => ({ ...prev, [id]: { ...getPendingSelection({ id } as ProfileRow), ...prev[id], employee_id } }));
  };

  const handleActivate = async (p: ProfileRow) => {
    const sel = getPendingSelection(p);
    if (!sel.company_id) {
      toast.error('Select a company before activating.');
      return;
    }
    setActivating(p.id);
    const { error } = await updateProfile({
      id: p.id,
      role: sel.role,
      company_id: sel.company_id,
      access_scope: (ROLE_DEFAULT_SCOPE[sel.role] || 'company') as AccessScope,
      employee_id: sel.employee_id,
      status: 'active',
    });
    setActivating('');
    if (error) {
      toast.error('Failed to activate user: ' + error);
      return;
    }
    toast.success(`${p.email} activated`);
    const refreshed = await listProfiles();
    if (!refreshed.error) setProfiles(refreshed.data);
    setPendingSelections(prev => {
      const { [p.id]: _removed, ...rest } = prev;
      return rest;
    });
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
      {pendingUsers.length > 0 && canManage && (
        <div className="glass-panel overflow-hidden border border-primary/30">
          <div className="px-4 py-3 bg-primary/10 border-b border-primary/30 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {pendingUsers.length} user{pendingUsers.length === 1 ? '' : 's'} awaiting activation
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              Users created via the Supabase Dashboard or that haven't been assigned a company appear here.
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Email</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Name</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Role</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Company</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Employee</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium w-32"></th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map(p => {
                const sel = getPendingSelection(p);
                return (
                  <tr key={p.id} className="data-table-row">
                    <td className="px-4 py-2 text-foreground text-xs">{p.email}</td>
                    <td className="px-4 py-2 text-foreground">{p.name || '—'}</td>
                    <td className="px-4 py-2">
                      <Select value={sel.role} onValueChange={(v) => setPendingRole(p.id, v as AppRole)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Select value={sel.company_id} onValueChange={(v) => setPendingCompany(p.id, v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Select company" /></SelectTrigger>
                        <SelectContent>
                          {companies.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Select value={sel.employee_id ?? 'none'} onValueChange={(v) => setPendingEmployee(p.id, v === 'none' ? null : v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Link employee" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No employee link</SelectItem>
                          {getEmployeeOptions(sel.company_id, p.id).map(employee => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.staffCode ? `${employee.name} (${employee.staffCode})` : employee.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        onClick={() => handleActivate(p)}
                        disabled={activating === p.id || !sel.company_id}
                      >
                        {activating === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Name</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Email</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Employee</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Role</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Access Scope</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Branch</th>
              {canManage && <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {activeUsers.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
            {activeUsers.map(p => (
              <tr key={p.id} className="data-table-row">
                <td className="px-4 py-3 text-foreground font-medium flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <span className="text-primary text-xs font-semibold">{p.name.charAt(0)}</span>
                  </div>
                  {p.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{p.email}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{getEmployeeLabel(p)}</td>
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

            <div className="space-y-2">
              <Label>Linked Employee</Label>
              <Select
                value={editForm.watch('employee_id') ?? 'none'}
                onValueChange={(v) => editForm.setValue('employee_id', v === 'none' ? null : v, { shouldDirty: true, shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No employee link</SelectItem>
                  {getEmployeeOptions(editUser?.company_id, editUser?.id).map(employee => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.staffCode ? `${employee.name} (${employee.staffCode})` : employee.name}
                    </SelectItem>
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

                <div className="space-y-2">
                  <Label>Linked Employee</Label>
                  <Select
                    value={inviteForm.watch('employee_id') ?? 'none'}
                    onValueChange={(v) => inviteForm.setValue('employee_id', v === 'none' ? null : v, { shouldDirty: true, shouldValidate: true })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No employee link</SelectItem>
                      {getEmployeeOptions(user?.company_id).map(employee => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.staffCode ? `${employee.name} (${employee.staffCode})` : employee.name}
                        </SelectItem>
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
