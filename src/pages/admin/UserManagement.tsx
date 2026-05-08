import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import {
  deactivateUser,
  deleteInvitedUser,
  inviteUser,
  listCompanyOptions,
  listProfiles,
  reactivateUser,
  setPortalAccess,
  updateProfile,
  type CompanyOption,
  type ProfileRow,
} from '@/services/profileService';
import {
  Ban,
  Check,
  CheckCircle,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AppRole, AccessScope, ROLE_DEFAULT_SCOPE, type Employee, type BranchRecord } from '@/types';
import { getBranches } from '@/services/masterDataService';
import { PermissionEditor } from '@/components/admin/PermissionEditor';
import { userUpdateSchema, inviteUserSchema, type UserUpdateFormData, type InviteUserFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { listEmployeeDirectory } from '@/services/hrmsService';
import { authService } from '@/services/authService';
import { cn } from '@/lib/utils';

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
  { value: 'self', label: 'Self - own records only' },
  { value: 'branch', label: 'Branch - assigned branch' },
  { value: 'company', label: 'Company - full company' },
  { value: 'global', label: 'Global - all companies' },
];

type AccountFilter = 'active' | 'pending' | 'inactive' | 'all';
type AccountStatusAction = 'deactivate' | 'reactivate';

function scopeLabel(scope: string): string {
  return SCOPES.find(s => s.value === scope)?.label || scope;
}

function roleLabel(role: AppRole): string {
  return ROLES.find(r => r.value === role)?.label ?? role.replace(/_/g, ' ');
}

function getInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase() || 'U';
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
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
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [activating, setActivating] = useState<string>('');
  const [grantingAccess, setGrantingAccess] = useState<string>('');
  const [resettingPassword, setResettingPassword] = useState<string>('');
  const [deletingUser, setDeletingUser] = useState<string>('');
  const [updatingAccountStatus, setUpdatingAccountStatus] = useState<string>('');
  const [employeesByCompany, setEmployeesByCompany] = useState<Record<string, Employee[]>>({});
  const [pendingSelections, setPendingSelections] = useState<
    Record<string, { role: AppRole; company_id: string; employee_id: string | null }>
  >({});
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('active');
  const [search, setSearch] = useState('');
  const [statusActionUser, setStatusActionUser] = useState<ProfileRow | null>(null);
  const [statusAction, setStatusAction] = useState<AccountStatusAction>('deactivate');
  const [statusReason, setStatusReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProfileRow | null>(null);

  const editForm = useForm<UserUpdateFormData>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      name: '',
      role: 'analyst',
      access_scope: 'company',
      branch_id: null,
      employee_id: null,
      portal_access_only: false,
    },
    mode: 'onChange',
  });

  const canManage = hasRole(['super_admin', 'company_admin']);
  const isSuperAdmin = user?.role === 'super_admin';

  const inviteForm = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      name: '',
      role: 'analyst',
      employee_id: null,
      portal_access_only: false,
    },
    mode: 'onChange',
  });

  useEffect(() => {
    async function load() {
      const [profileRes, branchRes, companyRes] = await Promise.all([
        listProfiles(),
        getBranches(user?.company_id || ''),
        listCompanyOptions(),
      ]);
      if (profileRes.error) {
        toast.error('Failed to load users: ' + profileRes.error);
      }
      setProfiles(profileRes.data);
      setBranches(branchRes.data);
      setCompanies(companyRes.data);

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

  const linkedEmployeeProfileIdByEmployeeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      if (profile.employee_id) map.set(profile.employee_id, profile.id);
    }
    return map;
  }, [profiles]);

  const pendingUsers = useMemo(
    () => profiles.filter(p => !p.company_id || p.status === 'pending'),
    [profiles],
  );

  const managedUsers = useMemo(
    () => profiles.filter(p => p.company_id && p.status !== 'pending'),
    [profiles],
  );

  const summary = useMemo(() => ({
    active: managedUsers.filter(p => p.status === 'active').length,
    pending: pendingUsers.length,
    inactive: managedUsers.filter(p => p.status === 'inactive' || p.status === 'resigned').length,
    portalOnly: managedUsers.filter(p => p.portal_access_only).length,
    total: profiles.length,
  }), [managedUsers, pendingUsers.length, profiles.length]);

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

  function getBranchLabel(profile: ProfileRow) {
    if (!profile.branch_id) return 'All branches';
    const branch = branches.find(row => row.id === profile.branch_id || row.name === profile.branch_id);
    return branch?.name ?? profile.branch_id;
  }

  const displayedUsers = (() => {
    const query = search.trim().toLowerCase();
    const source = accountFilter === 'pending'
      ? pendingUsers
      : managedUsers.filter(profile => {
        if (accountFilter === 'active') return profile.status === 'active';
        if (accountFilter === 'inactive') return profile.status === 'inactive' || profile.status === 'resigned';
        return true;
      });

    if (!query) return source;

    return source.filter(profile => {
      const haystack = [
        profile.name,
        profile.email,
        roleLabel(profile.role),
        scopeLabel(profile.access_scope),
        profile.status,
        getEmployeeLabel(profile),
        getBranchLabel(profile),
      ].map(normalizeText).join(' ');
      return haystack.includes(query);
    });
  })();

  if (!canManage) return <UnauthorizedAccess />;

  const refreshProfiles = async () => {
    const refreshed = await listProfiles();
    if (!refreshed.error) setProfiles(refreshed.data);
  };

  const openEdit = (p: ProfileRow) => {
    setEditUser(p);
    setEditBranch(p.branch_id || 'none');
    editForm.reset({
      name: p.name,
      role: p.role as UserUpdateFormData['role'],
      access_scope: p.access_scope as UserUpdateFormData['access_scope'],
      branch_id: p.branch_id,
      employee_id: p.employee_id ?? null,
      portal_access_only: p.portal_access_only,
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
    const { error } = await updateProfile({
      id: editUser.id,
      name: data.name,
      role: data.role,
      access_scope: data.access_scope,
      branch_id: data.branch_id,
      employee_id: data.employee_id,
      portal_access_only: data.portal_access_only ?? false,
    }, {
      actorId: user?.id,
      companyId: editUser.company_id ?? user?.company_id,
      allowGlobalScope: hasRole(['super_admin']),
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
        portal_access_only: data.portal_access_only ?? false,
      } : p));
      setEditUser(null);
    }
    setSaving(false);
  };

  const getSignupUrl = () => `${window.location.origin}/signup`;

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
      portalAccessOnly: data.portal_access_only ?? false,
    });
    setInviting(false);
    if (error) {
      toast.error('Failed to send invitation: ' + error);
      return;
    }
    toast.success(`Invitation sent to ${data.email}`);
    setSignupUrl(getSignupUrl());
    inviteForm.reset({ email: '', name: '', role: 'analyst', employee_id: null, portal_access_only: false });
    await refreshProfiles();
  };

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

  const setPendingRole = (profile: ProfileRow, role: AppRole) => {
    setPendingSelections(prev => ({ ...prev, [profile.id]: { ...getPendingSelection(profile), ...prev[profile.id], role } }));
  };
  const setPendingCompany = (profile: ProfileRow, company_id: string) => {
    setPendingSelections(prev => ({ ...prev, [profile.id]: { ...getPendingSelection(profile), ...prev[profile.id], company_id, employee_id: null } }));
  };
  const setPendingEmployee = (profile: ProfileRow, employee_id: string | null) => {
    setPendingSelections(prev => ({ ...prev, [profile.id]: { ...getPendingSelection(profile), ...prev[profile.id], employee_id } }));
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
    }, {
      actorId: user?.id,
      companyId: user?.company_id ?? sel.company_id,
      allowCompanyAssignment: true,
      allowGlobalScope: hasRole(['super_admin']),
    });
    setActivating('');
    if (error) {
      toast.error('Failed to activate user: ' + error);
      return;
    }
    toast.success(`${p.email} activated`);
    await refreshProfiles();
    setPendingSelections(prev => {
      const { [p.id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleGrantMainAppAccess = async (p: ProfileRow, grant: boolean) => {
    setGrantingAccess(p.id);
    const { error } = await setPortalAccess(p.id, !grant);
    setGrantingAccess('');
    if (error) {
      toast.error((grant ? 'Failed to grant access: ' : 'Failed to revoke access: ') + error);
      return;
    }
    toast.success(grant ? `Main app access granted to ${p.name || p.email}` : `Main app access revoked for ${p.name || p.email}`);
    await refreshProfiles();
  };

  const handleSendPasswordReset = async (p: ProfileRow) => {
    setResettingPassword(p.id);
    const { error } = await authService.resetPassword(p.email);
    setResettingPassword('');
    if (error) {
      toast.error('Failed to send password reset: ' + error.message);
      return;
    }
    toast.success(`Password reset email sent to ${p.email}`);
  };

  const requestDeleteInvitedUser = (p: ProfileRow) => {
    if (p.id === user?.id) {
      toast.error('You cannot delete your own account.');
      return;
    }
    setDeleteTarget(p);
  };

  const confirmDeleteInvitedUser = async () => {
    if (!deleteTarget) return;
    setDeletingUser(deleteTarget.id);
    const { error } = await deleteInvitedUser(deleteTarget.id);
    setDeletingUser('');
    if (error) {
      toast.error('Failed to delete user: ' + error);
      return;
    }
    toast.success(`${deleteTarget.email} deleted. You can invite the user again.`);
    setDeleteTarget(null);
    await refreshProfiles();
  };

  const canChangeAccountStatus = (p: ProfileRow) => {
    if (p.id === user?.id) return false;
    if (p.role === 'super_admin' && !isSuperAdmin) return false;
    if (p.access_scope === 'global' && !isSuperAdmin) return false;
    return true;
  };

  const requestStatusAction = (p: ProfileRow, action: AccountStatusAction) => {
    if (!canChangeAccountStatus(p)) {
      toast.error('You do not have permission to change this account status.');
      return;
    }
    setStatusActionUser(p);
    setStatusAction(action);
    setStatusReason('');
  };

  const confirmStatusAction = async () => {
    if (!statusActionUser) return;

    setUpdatingAccountStatus(statusActionUser.id);
    const result = statusAction === 'deactivate'
      ? await deactivateUser(statusActionUser.id, statusReason)
      : await reactivateUser(statusActionUser.id, statusReason);
    setUpdatingAccountStatus('');

    if (result.error) {
      toast.error(`${statusAction === 'deactivate' ? 'Failed to deactivate user: ' : 'Failed to reactivate user: '}${result.error}`);
      return;
    }

    toast.success(`${statusActionUser.name || statusActionUser.email} ${statusAction === 'deactivate' ? 'deactivated' : 'reactivated'}`);
    setStatusActionUser(null);
    setStatusReason('');
    await refreshProfiles();
  };

  const renderAccountStatus = (p: ProfileRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={p.status} />
      {p.portal_access_only && <StatusBadge status="portal_only" />}
    </div>
  );

  const renderPrimaryStatusAction = (p: ProfileRow) => {
    if (p.status === 'active') {
      return (
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => requestStatusAction(p, 'deactivate')}
          disabled={updatingAccountStatus === p.id || !canChangeAccountStatus(p)}
        >
          {updatingAccountStatus === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Deactivate</span>
        </Button>
      );
    }

    if (p.status === 'inactive' || p.status === 'resigned') {
      return (
        <Button
          variant="outline"
          size="sm"
          className="border-primary/40 text-primary hover:bg-primary/10"
          onClick={() => requestStatusAction(p, 'reactivate')}
          disabled={updatingAccountStatus === p.id || !canChangeAccountStatus(p)}
        >
          {updatingAccountStatus === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Reactivate</span>
        </Button>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Users & Roles" description="Manage platform users, roles, and account access" breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Users & Roles' }]} />
        <div className="glass-panel p-12 text-center text-sm text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Users & Roles"
        description="Manage account status, roles, employee links, and application access"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Users & Roles' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleCopySignupLink}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied' : 'Copy Sign-Up Link'}
            </Button>
            <Button size="sm" onClick={() => { setInviteOpen(true); setSignupUrl(''); }}>
              <UserPlus className="h-4 w-4 mr-1" />
              Invite User
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Active users</p>
          <p className="text-2xl font-bold text-success">{summary.active}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Pending activation</p>
          <p className="text-2xl font-bold text-warning">{summary.pending}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><UserMinus className="h-3.5 w-3.5" /> Inactive users</p>
          <p className="text-2xl font-bold text-foreground">{summary.inactive}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Portal-only</p>
          <p className="text-2xl font-bold text-primary">{summary.portalOnly}</p>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
            <Tabs value={accountFilter} onValueChange={(value) => setAccountFilter(value as AccountFilter)}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="active">Active ({summary.active})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({summary.pending})</TabsTrigger>
                <TabsTrigger value="inactive">Inactive ({summary.inactive})</TabsTrigger>
                <TabsTrigger value="all">All ({summary.total})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search users, roles, employees..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/30 hover:bg-secondary/30">
              <TableHead className="min-w-56">User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Role & Scope</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="w-56 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No users match the current view.
                </TableCell>
              </TableRow>
            )}

            {displayedUsers.map(p => {
              const isPending = !p.company_id || p.status === 'pending';
              const pendingSelection = isPending ? getPendingSelection(p) : null;

              return (
                <TableRow key={p.id} className={cn('data-table-row', (p.status === 'inactive' || p.status === 'resigned') && 'bg-muted/25 text-muted-foreground')}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-9 w-9 rounded-full flex items-center justify-center border text-xs font-semibold',
                        p.status === 'active' ? 'bg-primary/15 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border',
                      )}>
                        {getInitials(p.name, p.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{p.name || 'Unnamed user'}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>{renderAccountStatus(p)}</TableCell>

                  <TableCell>
                    {isPending && pendingSelection ? (
                      <Select value={pendingSelection.employee_id ?? 'none'} onValueChange={(value) => setPendingEmployee(p, value === 'none' ? null : value)}>
                        <SelectTrigger className="h-8 min-w-44"><SelectValue placeholder="Link employee" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No employee link</SelectItem>
                          {getEmployeeOptions(pendingSelection.company_id, p.id).map(employee => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.staffCode ? `${employee.name} (${employee.staffCode})` : employee.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground">{getEmployeeLabel(p)}</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {isPending && pendingSelection ? (
                      <div className="grid gap-2 min-w-56">
                        <Select value={pendingSelection.role} onValueChange={(value) => setPendingRole(p, value as AppRole)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map(role => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={pendingSelection.company_id} onValueChange={(value) => setPendingCompany(p, value)}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select company" /></SelectTrigger>
                          <SelectContent>
                            {companies.map(company => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="flex items-center gap-1 text-foreground capitalize">
                          <Shield className="h-3.5 w-3.5 text-primary" />
                          {roleLabel(p.role)}
                        </span>
                        <p className="text-xs text-muted-foreground">{scopeLabel(p.access_scope)}</p>
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">{isPending ? 'Set on activation' : getBranchLabel(p)}</TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {isPending && pendingSelection ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleActivate(p)}
                            disabled={activating === p.id || !pendingSelection.company_id}
                          >
                            {activating === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">Activate</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => requestDeleteInvitedUser(p)}
                            disabled={deletingUser === p.id || p.id === user?.id}
                            aria-label="Delete invited user"
                          >
                            {deletingUser === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                          {renderPrimaryStatusAction(p)}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More account actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Account actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => openPermissions(p)}>
                                <Settings className="h-4 w-4 mr-2" /> Permissions
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleSendPasswordReset(p)}
                                disabled={resettingPassword === p.id || p.status !== 'active'}
                              >
                                {resettingPassword === p.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                                Reset password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {p.portal_access_only ? (
                                <DropdownMenuItem onClick={() => handleGrantMainAppAccess(p, true)} disabled={grantingAccess === p.id || p.status !== 'active'}>
                                  {grantingAccess === p.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserCheck className="h-4 w-4 mr-2" />}
                                  Grant full access
                                </DropdownMenuItem>
                              ) : p.role !== 'super_admin' ? (
                                <DropdownMenuItem onClick={() => handleGrantMainAppAccess(p, false)} disabled={grantingAccess === p.id || p.status !== 'active'}>
                                  {grantingAccess === p.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserMinus className="h-4 w-4 mr-2" />}
                                  Revoke full access
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User: {editUser?.name || editUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input {...editForm.register('name')} className={editForm.formState.errors.name ? 'border-destructive' : ''} />
                {editForm.formState.errors.name && (
                  <p className="text-destructive text-xs">{editForm.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editForm.watch('role')} onValueChange={(value) => {
                  editForm.setValue('role', value as UserUpdateFormData['role']);
                  const defaultScope = ROLE_DEFAULT_SCOPE[value as AppRole] || 'company';
                  editForm.setValue('access_scope', defaultScope as UserUpdateFormData['access_scope']);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(role => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Access Scope</Label>
                <Select value={editForm.watch('access_scope')} onValueChange={(value) => {
                  editForm.setValue('access_scope', value as UserUpdateFormData['access_scope']);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCOPES.map(scope => <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Branch Assignment</Label>
                <Select value={editBranch} onValueChange={(value) => {
                  setEditBranch(value);
                  editForm.setValue('branch_id', value === 'none' ? null : value);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No branch assigned</SelectItem>
                    {branches.map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Linked Employee</Label>
              <Select
                value={editForm.watch('employee_id') ?? 'none'}
                onValueChange={(value) => editForm.setValue('employee_id', value === 'none' ? null : value, { shouldDirty: true, shouldValidate: true })}
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

            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="portal-access-only">Internal Requests Only</Label>
                  <p className="text-xs text-muted-foreground">
                    Restrict this user to the Internal Requests portal and block access to the main application shell.
                  </p>
                </div>
                <Switch
                  id="portal-access-only"
                  checked={editForm.watch('portal_access_only') ?? false}
                  onCheckedChange={(checked) => editForm.setValue('portal_access_only', checked, { shouldDirty: true, shouldValidate: true })}
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
              <p className="font-medium text-foreground">Access Summary</p>
              <p className="text-muted-foreground">
                {editForm.watch('access_scope') === 'global' && 'Can see all companies and all data.'}
                {editForm.watch('access_scope') === 'company' && `Can see all data within company ${editUser?.company_id}.`}
                {editForm.watch('access_scope') === 'branch' && `Can see all data in branch ${editBranch === 'none' ? '(unassigned)' : editBranch} within company ${editUser?.company_id}.`}
                {editForm.watch('access_scope') === 'self' && `Can only see records assigned to this user within company ${editUser?.company_id}.`}
              </p>
              {editForm.watch('portal_access_only') && (
                <p className="text-primary">
                  Main app navigation will be hidden and protected routes will redirect this user to the Internal Requests portal.
                </p>
              )}
            </div>

            <Button onClick={editForm.handleSubmit(handleSave)} disabled={saving || !editForm.formState.isValid} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                  <Select value={inviteForm.watch('role')} onValueChange={(value) => inviteForm.setValue('role', value as InviteUserFormData['role'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(role => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Linked Employee</Label>
                  <Select
                    value={inviteForm.watch('employee_id') ?? 'none'}
                    onValueChange={(value) => inviteForm.setValue('employee_id', value === 'none' ? null : value, { shouldDirty: true, shouldValidate: true })}
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

                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="invite-portal-access-only">Internal Requests Only</Label>
                      <p className="text-xs text-muted-foreground">
                        Send this user directly into the Internal Requests portal without main app access.
                      </p>
                    </div>
                    <Switch
                      id="invite-portal-access-only"
                      checked={inviteForm.watch('portal_access_only') ?? false}
                      onCheckedChange={(checked) => inviteForm.setValue('portal_access_only', checked, { shouldDirty: true, shouldValidate: true })}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
                  <p className="font-medium text-foreground">What happens next?</p>
                  <p className="text-muted-foreground">
                    An invitation email will be sent to the user with a link to set up their account and password on the sign-up page.
                  </p>
                  {inviteForm.watch('portal_access_only') && (
                    <p className="text-primary">
                      After sign-in, this user will land in the Internal Requests portal instead of the main app.
                    </p>
                  )}
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

      <AlertDialog open={!!statusActionUser} onOpenChange={(open) => { if (!open) setStatusActionUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusAction === 'deactivate' ? 'Deactivate user account?' : 'Reactivate user account?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {statusAction === 'deactivate'
                ? `${statusActionUser?.email ?? 'This user'} will be blocked from future sign-in and session refresh. Existing access tokens may remain valid until expiry, but the app will reject inactive profiles when it revalidates.`
                : `${statusActionUser?.email ?? 'This user'} will regain sign-in and application access according to their assigned role and scope.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="status-reason">Reason</Label>
            <Textarea
              id="status-reason"
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              placeholder={statusAction === 'deactivate' ? 'Optional reason for deactivation' : 'Optional reason for reactivation'}
              className="min-h-24"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(updatingAccountStatus)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={statusAction === 'deactivate' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
              disabled={Boolean(updatingAccountStatus)}
              onClick={(event) => {
                event.preventDefault();
                void confirmStatusAction();
              }}
            >
              {updatingAccountStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : statusAction === 'deactivate' ? <Ban className="h-4 w-4 mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {statusAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invited user?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deleteTarget?.email ?? 'this invited user'} only if they have never signed in. Existing users should be deactivated instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingUser)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(deletingUser)}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteInvitedUser();
              }}
            >
              {deletingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}