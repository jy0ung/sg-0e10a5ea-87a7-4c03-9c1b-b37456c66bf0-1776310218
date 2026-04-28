import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Plus, Users, UserCheck, UserMinus, Pencil } from 'lucide-react';
import { AppRole, Employee, EmployeeStatus, Department, JobTitle } from '@/types';
import { getBranches } from '@/services/masterDataService';
import type { BranchRecord } from '@/types';
import { listDepartments, listJobTitles } from '@/services/hrmsAdminService';
import {
  listEmployeeDirectory,
  createEmployee,
  updateEmployee,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from '@/services/hrmsService';
import { HRMS_MANAGER_ROLES, PII_VIEW_ROLES } from '@/config/hrmsConfig';
import { createEmployeeSchema } from '@/lib/validations';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_ROLES: AppRole[] = [
  'super_admin', 'company_admin', 'director', 'general_manager',
  'manager', 'sales', 'accounts', 'analyst',
];

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin:     'Super Admin',
  company_admin:   'Company Admin',
  director:        'Director',
  general_manager: 'General Manager',
  manager:         'Manager',
  sales:           'Sales Advisor',
  accounts:        'Accounts',
  analyst:         'Analyst',
};

const ROLE_BADGE: Record<AppRole, string> = {
  super_admin:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  company_admin:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  director:        'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  general_manager: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  manager:         'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  sales:           'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  accounts:        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  analyst:         'bg-secondary text-secondary-foreground',
};

const STATUS_BADGE: Record<EmployeeStatus, string> = {
  active:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  inactive: 'bg-secondary text-secondary-foreground',
  resigned: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

// Roles that can manage employees (add/edit/deactivate) — sourced from hrmsConfig
const MANAGER_ROLES = HRMS_MANAGER_ROLES;
const UNASSIGNED_MANAGER = '__unassigned__';
const NO_DEPARTMENT = '__none_department__';
const NO_JOB_TITLE = '__none_job_title__';

// ─── Form state ───────────────────────────────────────────────────────────────

const EMPTY_CREATE_FORM = {
  staffCode: '', name: '', email: '', ic: '', contact: '',
  branch: '', managerId: '', role: 'sales' as AppRole, joinDate: new Date().toISOString().split('T')[0],
};

type EditForm = {
  name: string;
  role: AppRole;
  branch: string;
  managerId: string;
  staffCode: string;
  ic: string;
  contact: string;
  email: string;
  joinDate: string;
  resignDate: string;
  status: EmployeeStatus;
  departmentId: string;
  jobTitleId: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmployeeDirectory() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [loading, setLoading]       = useState(true);
  const [branches, setBranches]     = useState<BranchRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles]   = useState<JobTitle[]>([]);

  // Filters
  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState<string>('all');
  const [statusFilter, setStatus]     = useState<string>('all');
  const [branchFilter, setBranch]     = useState('all');

  // Add dialog
  const [addOpen, setAddOpen]   = useState(false);
  const [form, setForm]         = useState(EMPTY_CREATE_FORM);
  const [saving, setSaving]     = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [editForm, setEditForm]     = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const canManage = user && MANAGER_ROLES.includes(user.role);
  const canViewPii = user && PII_VIEW_ROLES.includes(user.role);

  /** Mask IC: show only last 4 digits — e.g. "900101-12-1234" → "••••••-••-1234" */
  function maskIc(ic: string | undefined): string {
    if (!ic) return '—';
    return ic.replace(/^(\d{6}-\d{2}-)(\d{4})$/, '••••••-••-$2');
  }

  /** Mask contact: show only last 4 digits — e.g. "012-3456789" → "•••-•••6789" */
  function maskContact(contact: string | undefined): string {
    if (!contact) return '—';
    if (contact.length <= 4) return '••••';
    return contact.slice(0, -4).replace(/[0-9]/g, '•') + contact.slice(-4);
  }

  // ── Load ──
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [empResult, branchResult, deptResult, jtResult] = await Promise.all([
      listEmployeeDirectory(user.companyId),
      getBranches(user.companyId),
      listDepartments(user.companyId),
      listJobTitles(user.companyId),
    ]);
    if (empResult.error) toast({ title: 'Failed to load employees', description: empResult.error, variant: 'destructive' });
    else setEmployees(empResult.data);
    if (!branchResult.error) setBranches(branchResult.data);
    if (!deptResult.error) setDepartments(deptResult.data);
    if (!jtResult.error) setJobTitles(jtResult.data);
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ──
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));
  const managerOptions = employees.filter(employee => employee.status === 'active' && MANAGER_ROLES.includes(employee.role));

  function getManagerOptions(selectedManagerId?: string) {
    const options = [...managerOptions];
    const selectedManager = selectedManagerId ? employeeById.get(selectedManagerId) : undefined;
    if (selectedManager && !options.some(option => option.id === selectedManager.id)) {
      options.push(selectedManager);
    }
    return options.sort((left, right) => left.name.localeCompare(right.name));
  }

  const filtered = employees.filter(e => {
    if (roleFilter   !== 'all' && e.role   !== roleFilter)   return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (branchFilter !== 'all' && e.branchId !== branchFilter) return false;
    const q = search.toLowerCase();
    const managerName = e.managerId ? employeeById.get(e.managerId)?.name ?? '' : '';
    return !q || [e.staffCode, e.name, e.email, e.branchId, managerName].join(' ').toLowerCase().includes(q);
  });

  const activeCount   = employees.filter(e => e.status === 'active').length;
  const inactiveCount = employees.filter(e => e.status === 'inactive').length;
  const resignedCount = employees.filter(e => e.status === 'resigned').length;

  // ── Create ──
  const handleCreate = async () => {
    const result = createEmployeeSchema.safeParse(form);
    if (!result.success) {
      return toast({ title: 'Validation error', description: result.error.errors[0].message, variant: 'destructive' });
    }
    if (!user) return;
    setSaving(true);
    const input: CreateEmployeeInput = {
      id:        crypto.randomUUID(),
      email:     form.email || `${form.staffCode.toLowerCase()}@company.local`,
      name:      form.name,
      role:      form.role,
      companyId: user.companyId,
      branchId:  form.branch || undefined,
      managerId: form.managerId || undefined,
      staffCode: form.staffCode,
      icNo:      form.ic || undefined,
      contactNo: form.contact || undefined,
      joinDate:  form.joinDate || undefined,
    };
    const { error } = await createEmployee(input, user.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to create employee', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Employee created', description: `${form.staffCode.toUpperCase()} — ${form.name}` });
    setForm(EMPTY_CREATE_FORM);
    setAddOpen(false);
    load();
  };

  // ── Open edit ──
  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setEditForm({
      name:         emp.name,
      role:         emp.role,
      branch:       emp.branchId ?? '',
      managerId:    emp.managerId ?? '',
      staffCode:    emp.staffCode ?? '',
      ic:           emp.icNo ?? '',
      contact:      emp.contactNo ?? '',
      email:        emp.email,
      joinDate:     emp.joinDate ?? '',
      resignDate:   emp.resignDate ?? '',
      status:       emp.status,
      departmentId: emp.departmentId ?? '',
      jobTitleId:   emp.jobTitleId ?? '',
    });
  };

  // ── Save edit ──
  const handleEdit = async () => {
    if (!editTarget || !editForm) return;
    setEditSaving(true);
    const input: UpdateEmployeeInput = {
      name:         editForm.name,
      role:         editForm.role,
      branchId:     editForm.branch || null,
      managerId:    editForm.managerId || null,
      staffCode:    editForm.staffCode,
      icNo:         editForm.ic,
      contactNo:    editForm.contact,
      joinDate:     editForm.joinDate || undefined,
      resignDate:   editForm.resignDate || null,
      status:       editForm.status,
      departmentId: editForm.departmentId || null,
      jobTitleId:   editForm.jobTitleId || null,
    };
    const { error } = await updateEmployee(editTarget.id, input, user?.id, user.companyId);
    setEditSaving(false);
    if (error) {
      toast({ title: 'Failed to update employee', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Employee updated', description: editForm.name });
    setEditTarget(null);
    setEditForm(null);
    load();
  };

  // ── Quick status toggle ──
  const toggleStatus = async (emp: Employee) => {
    const next: EmployeeStatus = emp.status === 'active' ? 'inactive' : 'active';
    // Optimistic update
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: next } : e));
    const { error } = await updateEmployee(emp.id, { status: next }, user?.id, user.companyId);
    if (error) {
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: emp.status } : e));
      toast({ title: 'Failed to update status', description: error, variant: 'destructive' });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Employee Directory"
          description="All staff profiles across the company"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'HRMS' }, { label: 'Employee Directory' }]}
        />
        <div className="glass-panel p-12 text-center text-sm text-muted-foreground">Loading employees…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Employee Directory"
        description="All staff profiles across the company"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'HRMS' }, { label: 'Employee Directory' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Employee
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5" /> Active
          </p>
          <p className="text-2xl font-bold text-emerald-500">{activeCount}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <UserMinus className="h-3.5 w-3.5" /> Inactive
          </p>
          <p className="text-2xl font-bold text-foreground">{inactiveCount}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Resigned</p>
          <p className="text-2xl font-bold text-red-500">{resignedCount}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> Total
          </p>
          <p className="text-2xl font-bold text-foreground">{employees.length}</p>
        </div>
      </div>

      {/* Table panel */}
      <div className="glass-panel p-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-44 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Code, name, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All Roles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="resigned">Resigned</SelectItem>
            </SelectContent>
          </Select>

          <Select value={branchFilter} onValueChange={setBranch}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} employees</span>
        </div>

        {/* Table */}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Code</th>
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 pr-4 font-medium">IC</th>
                <th className="pb-2 pr-4 font-medium">Contact</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Department</th>
                <th className="pb-2 pr-4 font-medium">Job Title</th>
                <th className="pb-2 pr-4 font-medium">Manager</th>
                <th className="pb-2 pr-4 font-medium">Branch</th>
                <th className="pb-2 pr-4 font-medium">Join Date</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                {canManage && <th className="pb-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 13 : 12} className="py-8 text-center text-muted-foreground text-sm">
                    No employees found
                  </td>
                </tr>
              ) : (
                filtered.map(emp => {
                  const branchCode = branches.find(b => b.id === emp.branchId)?.code ?? emp.branchId ?? '—';
                  const managerName = emp.managerId ? employeeById.get(emp.managerId)?.name ?? emp.managerId : '—';
                  return (
                    <tr key={emp.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-mono text-xs font-medium">{emp.staffCode ?? '—'}</td>
                      <td className="py-2 pr-4 font-medium text-sm">{emp.name}</td>
                      <td className="py-2 pr-4">
                        <Badge className={`text-[10px] capitalize ${ROLE_BADGE[emp.role]}`}>
                          {ROLE_LABEL[emp.role]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{canViewPii ? (emp.icNo ?? '—') : maskIc(emp.icNo)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{canViewPii ? (emp.contactNo ?? '—') : maskContact(emp.contactNo)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{emp.email}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{emp.departmentName ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{emp.jobTitleName ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{managerName}</td>
                      <td className="py-2 pr-4 text-xs">{branchCode}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{emp.joinDate ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <Badge className={`text-[10px] capitalize ${STATUS_BADGE[emp.status]}`}>
                          {emp.status}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="h-6 w-6 p-0"
                              title="Edit"
                              onClick={() => openEdit(emp)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => toggleStatus(emp)}
                              disabled={emp.status === 'resigned'}
                            >
                              {emp.status === 'active' ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Employee Dialog ────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Employee</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="employee-add-staff-code" className="text-xs font-medium text-muted-foreground">Staff Code *</label>
                <Input
                  id="employee-add-staff-code"
                  className="h-8 text-sm uppercase"
                  placeholder="e.g. SA001"
                  value={form.staffCode}
                  onChange={e => setForm(f => ({ ...f, staffCode: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="employee-add-role" className="text-xs font-medium text-muted-foreground">Role *</label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as AppRole }))}>
                  <SelectTrigger id="employee-add-role" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map(r => (
                      <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="employee-add-name" className="text-xs font-medium text-muted-foreground">Full Name *</label>
              <Input
                id="employee-add-name"
                className="h-8 text-sm"
                placeholder="e.g. Ahmad bin Ibrahim"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="employee-add-branch" className="text-xs font-medium text-muted-foreground">Branch</label>
                <Select value={form.branch} onValueChange={v => setForm(f => ({ ...f, branch: v }))}>
                  <SelectTrigger id="employee-add-branch" className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label htmlFor="employee-add-join-date" className="text-xs font-medium text-muted-foreground">Join Date</label>
                <Input
                  id="employee-add-join-date"
                  type="date"
                  className="h-8 text-sm"
                  value={form.joinDate}
                  onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="employee-add-manager" className="text-xs font-medium text-muted-foreground">Reporting Manager</label>
              <Select
                value={form.managerId || UNASSIGNED_MANAGER}
                onValueChange={value => setForm(f => ({ ...f, managerId: value === UNASSIGNED_MANAGER ? '' : value }))}
              >
                <SelectTrigger id="employee-add-manager" className="h-8 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_MANAGER}>Unassigned</SelectItem>
                  {getManagerOptions().map(manager => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name} ({ROLE_LABEL[manager.role]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="employee-add-ic" className="text-xs font-medium text-muted-foreground">IC Number</label>
                <Input
                  id="employee-add-ic"
                  className="h-8 text-sm"
                  placeholder="e.g. 900101-12-1234"
                  value={form.ic}
                  onChange={e => setForm(f => ({ ...f, ic: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="employee-add-contact" className="text-xs font-medium text-muted-foreground">Contact No</label>
                <Input
                  id="employee-add-contact"
                  className="h-8 text-sm"
                  placeholder="e.g. 012-3456789"
                  value={form.contact}
                  onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="employee-add-email" className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                id="employee-add-email"
                type="email"
                className="h-8 text-sm"
                placeholder="staff@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Employee Dialog ───────────────────────────────────────────── */}
      {editTarget && editForm && (
        <Dialog open={!!editTarget} onOpenChange={() => { setEditTarget(null); setEditForm(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Employee — {editTarget.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="employee-edit-staff-code" className="text-xs font-medium text-muted-foreground">Staff Code</label>
                  <Input
                    id="employee-edit-staff-code"
                    className="h-8 text-sm uppercase"
                    value={editForm.staffCode}
                    onChange={e => setEditForm(f => f ? { ...f, staffCode: e.target.value } : f)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="employee-edit-role" className="text-xs font-medium text-muted-foreground">Role</label>
                  <Select
                    value={editForm.role}
                    onValueChange={v => setEditForm(f => f ? { ...f, role: v as AppRole } : f)}
                  >
                    <SelectTrigger id="employee-edit-role" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.map(r => (
                        <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="employee-edit-name" className="text-xs font-medium text-muted-foreground">Full Name</label>
                <Input
                  id="employee-edit-name"
                  className="h-8 text-sm"
                  value={editForm.name}
                  onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="employee-edit-department" className="text-xs font-medium text-muted-foreground">Department</label>
                  <Select
                    value={editForm.departmentId || NO_DEPARTMENT}
                    onValueChange={v => setEditForm(f => f ? {
                      ...f,
                      departmentId: v === NO_DEPARTMENT ? '' : v,
                      jobTitleId: '',
                    } : f)}
                  >
                    <SelectTrigger id="employee-edit-department" className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DEPARTMENT}>None</SelectItem>
                      {departments.filter(d => d.isActive).map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="employee-edit-job-title" className="text-xs font-medium text-muted-foreground">Job Title</label>
                  <Select
                    value={editForm.jobTitleId || NO_JOB_TITLE}
                    onValueChange={v => setEditForm(f => f ? { ...f, jobTitleId: v === NO_JOB_TITLE ? '' : v } : f)}
                  >
                    <SelectTrigger id="employee-edit-job-title" className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_JOB_TITLE}>None</SelectItem>
                      {jobTitles
                        .filter(jt => jt.isActive && (!editForm.departmentId || jt.departmentId === editForm.departmentId || !jt.departmentId))
                        .map(jt => (
                          <SelectItem key={jt.id} value={jt.id}>{jt.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="employee-edit-branch" className="text-xs font-medium text-muted-foreground">Branch</label>
                  <Select
                    value={editForm.branch}
                    onValueChange={v => setEditForm(f => f ? { ...f, branch: v } : f)}
                  >
                    <SelectTrigger id="employee-edit-branch" className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="employee-edit-status" className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select
                    value={editForm.status}
                    onValueChange={v => setEditForm(f => f ? { ...f, status: v as EmployeeStatus } : f)}
                  >
                    <SelectTrigger id="employee-edit-status" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="resigned">Resigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="employee-edit-manager" className="text-xs font-medium text-muted-foreground">Reporting Manager</label>
                <Select
                  value={editForm.managerId || UNASSIGNED_MANAGER}
                  onValueChange={value => setEditForm(f => f ? { ...f, managerId: value === UNASSIGNED_MANAGER ? '' : value } : f)}
                >
                  <SelectTrigger id="employee-edit-manager" className="h-8 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_MANAGER}>Unassigned</SelectItem>
                    {getManagerOptions(editForm.managerId)
                      .filter(manager => manager.id !== editTarget.id)
                      .map(manager => (
                        <SelectItem key={manager.id} value={manager.id}>
                          {manager.name} ({ROLE_LABEL[manager.role]})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="employee-edit-ic" className="text-xs font-medium text-muted-foreground">IC Number</label>
                  <Input
                    id="employee-edit-ic"
                    className="h-8 text-sm"
                    value={editForm.ic}
                    onChange={e => setEditForm(f => f ? { ...f, ic: e.target.value } : f)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="employee-edit-contact" className="text-xs font-medium text-muted-foreground">Contact No</label>
                  <Input
                    id="employee-edit-contact"
                    className="h-8 text-sm"
                    value={editForm.contact}
                    onChange={e => setEditForm(f => f ? { ...f, contact: e.target.value } : f)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="employee-edit-email" className="text-xs font-medium text-muted-foreground">Email</label>
                  <Input
                    id="employee-edit-email"
                    type="email"
                    className="h-8 text-sm"
                    value={editForm.email}
                    onChange={e => setEditForm(f => f ? { ...f, email: e.target.value } : f)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="employee-edit-join-date" className="text-xs font-medium text-muted-foreground">Join Date</label>
                  <Input
                    id="employee-edit-join-date"
                    type="date"
                    className="h-8 text-sm"
                    value={editForm.joinDate}
                    onChange={e => setEditForm(f => f ? { ...f, joinDate: e.target.value } : f)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="employee-edit-resign-date" className="text-xs font-medium text-muted-foreground">Resign Date</label>
                  <Input
                    id="employee-edit-resign-date"
                    type="date"
                    className="h-8 text-sm"
                    value={editForm.resignDate}
                    onChange={e => setEditForm(f => f ? { ...f, resignDate: e.target.value } : f)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" size="sm" onClick={() => { setEditTarget(null); setEditForm(null); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
