import React, { lazy, Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import {
  Building2, Briefcase, Calendar, CalendarDays, RefreshCw,
  Plus, Pencil, Trash2, Shield, GitMerge, Users, Settings2,
  Boxes, Clock, Mail, DollarSign, UserCog, Gauge, ArrowLeft,
} from 'lucide-react';
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listJobTitles, createJobTitle, updateJobTitle, deleteJobTitle,
  listAllLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  listHolidays, createHoliday, updateHoliday, deleteHoliday,
} from '@/services/hrmsAdminService';
import { listEmployeeDirectory } from '@/services/hrmsService';
import type {
  Department, CreateDepartmentInput,
  JobTitle, CreateJobTitleInput, JobTitleLevel,
  LeaveType, CreateLeaveTypeInput,
  PublicHoliday, CreateHolidayInput, HolidayType,
  HrmsRole, CreateHrmsRoleInput, HrmsRoleCategory, HrmsRoleScope,
} from '@/types';

import {
  departmentSchema, jobTitleSchema, leaveTypeAdminSchema, holidaySchema, hrmsRoleSchema,
} from '@/lib/validations';
import {
  createHrmsRole,
  listHrmsRoleAssignments,
  listHrmsRoles,
  replaceHrmsRoleEmployeeAssignments,
  updateHrmsRole,
} from '@/services/hrmsRoleService';

const ApprovalFlowsWorkspace = lazy(() => import('./ApprovalFlows'));
const LeaveQuotaPanel = lazy(() => import('./LeaveQuotaPanel'));

// ─── Types ───────────────────────────────────────────────────────────────────

type Category =
  | 'roles'
  | 'approval-flows'
  | 'departments'
  | 'job-titles'
  | 'leave-types'
  | 'holidays'
  | 'rollover'
  | 'leave-quota'
  | 'attendance-policies'
  | 'employee-categories'
  | 'payroll-defaults'
  | 'notification-templates'
  | 'system';

type ConfigGroup = 'General' | 'HRMS Roles' | 'Approval Flows' | 'Departments' | 'Leave' | 'Attendance' | 'Employees' | 'Payroll' | 'Notifications' | 'System';

interface CategoryDef {
  id: Category;
  label: string;
  icon: React.ElementType;
  description: string;
  summary: string;
  group: ConfigGroup;
  adminOnly?: boolean;
  status?: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'roles',          label: 'HRMS Roles',       icon: Shield,      description: 'Define HRMS organisational roles used by workflows, approval routing, HR visibility, and operational rules.', summary: 'Organisational roles', group: 'HRMS Roles', adminOnly: true },
  { id: 'approval-flows', label: 'Approval Flows',   icon: GitMerge,    description: 'Build reusable HRMS approval sequences using HRMS roles, direct managers, fallback approvers, and workflow rules.', summary: 'Workflow designer', group: 'Approval Flows', adminOnly: true },
  { id: 'departments',    label: 'Departments',      icon: Building2,   description: 'Organise employees into departments and assign department heads.', summary: 'Teams and cost centres', group: 'Departments' },
  { id: 'job-titles',     label: 'Job Titles',       icon: Briefcase,   description: 'Define job titles and optionally link them to departments.', summary: 'Positions and seniority', group: 'Departments' },
  { id: 'leave-types',    label: 'Leave Types',      icon: Calendar,    description: 'Configure leave types, entitlements, carry-forward rules, and paid/unpaid status.', summary: 'Entitlements and rules', group: 'Leave' },
  { id: 'holidays',       label: 'Holiday Calendar', icon: CalendarDays, description: 'Manage public and company holidays used by leave calculations.', summary: 'Company calendar', group: 'Leave' },
  { id: 'rollover',       label: 'Leave Rollover',   icon: RefreshCw,   description: 'Roll over employee leave balances from one year to the next.', summary: 'Year-end operation', group: 'Leave' },
  { id: 'leave-quota',    label: 'Leave Quota',      icon: Gauge,       description: 'Configure maximum simultaneous leave allowances per leave type, branch, department, and time period.', summary: 'Concurrent leave limits', group: 'Leave' },
  { id: 'attendance-policies', label: 'Attendance Policies', icon: Clock, description: 'Review attendance operational rules, correction workflows, and officer responsibilities.', summary: 'Attendance rules', group: 'Attendance', status: 'Planning' },
  { id: 'employee-categories', label: 'Employee Categories', icon: Users, description: 'Prepare HRMS categories for employee grouping, visibility rules, and workforce reporting.', summary: 'Workforce grouping', group: 'Employees', status: 'Planning' },
  { id: 'payroll-defaults', label: 'Payroll Defaults', icon: DollarSign, description: 'Review payroll role ownership and default approval governance for payroll operations.', summary: 'Payroll controls', group: 'Payroll', status: 'Planning' },
  { id: 'notification-templates', label: 'HRMS Email Templates', icon: Mail, description: 'Prepare HRMS-specific notification and email template configuration.', summary: 'HR notifications', group: 'Notifications', status: 'Planning' },
  { id: 'system',         label: 'System Controls',  icon: Boxes,       description: 'Review HRMS configuration standards, access guardrails, and operational readiness notes.', summary: 'Readiness checklist', group: 'System' },
];

const HIDDEN_MODULE_STATUSES = new Set(['Planning']);

const CONFIG_GROUPS: ConfigGroup[] = ['General', 'HRMS Roles', 'Approval Flows', 'Departments', 'Leave', 'Attendance', 'Employees', 'Payroll', 'Notifications', 'System'];

const JOB_LEVELS: { value: JobTitleLevel; label: string }[] = [
  { value: 'junior',    label: 'Junior' },
  { value: 'mid',       label: 'Mid' },
  { value: 'senior',    label: 'Senior' },
  { value: 'lead',      label: 'Lead' },
  { value: 'executive', label: 'Executive' },
];

const NONE_SELECT_VALUE = '__none__';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

function getCategoryDef(category: Category) {
  return CATEGORIES.find(c => c.id === category)!;
}

function getGroupModuleCount(group: ConfigGroup, modules: CategoryDef[]) {
  if (group === 'General') return modules.length;
  return modules.filter(module => module.group === group).length;
}

function isConfigGroup(value: string | null): value is ConfigGroup {
  return CONFIG_GROUPS.includes(value as ConfigGroup);
}

function getModulePattern(module: Category) {
  if (module === 'approval-flows') return 'Full workspace';
  if (['departments', 'job-titles', 'leave-types', 'holidays'].includes(module)) return 'Data drawer';
  if (module === 'roles') return 'Role editor';
  return 'Compact dialog';
}

function _getWorkspaceDialogClass(module: Category | null) {
  if (!module) return 'flex max-h-[86vh] max-w-3xl flex-col overflow-hidden p-0';
  if (module === 'approval-flows') {
    return 'flex h-[92vh] max-w-[1200px] flex-col overflow-hidden p-0';
  }
  if (['departments', 'job-titles', 'leave-types', 'holidays', 'leave-quota'].includes(module)) {
    return 'flex max-h-[88vh] max-w-5xl flex-col overflow-hidden p-0';
  }
  if (module === 'roles') return 'flex max-h-[88vh] max-w-4xl flex-col overflow-hidden p-0';
  return 'flex max-h-[82vh] max-w-3xl flex-col overflow-hidden p-0';
}

interface SettingsSectionHeaderProps {
  category: Category;
  action?: React.ReactNode;
  controls?: React.ReactNode;
}

function SettingsSectionHeader({ category, action, controls }: SettingsSectionHeaderProps) {
  const def = getCategoryDef(category);
  const Icon = def.icon;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-foreground">{def.label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{def.description}</p>
        </div>
      </div>
      {(controls || action) && (
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {controls}
          {action}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface DepartmentPanelProps {
  companyId: string;
  actorId: string;
  canWrite: boolean;
}

function DepartmentsPanel({ companyId, actorId, canWrite }: DepartmentPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: deptData, isPending: loading } = useQuery({
    queryKey: ['departments-panel', companyId],
    queryFn: async () => {
      const [depts, emps] = await Promise.all([
        listDepartments(companyId),
        listEmployeeDirectory(companyId),
      ]);
      return {
        rows: depts.error ? [] : depts.data,
        employees: emps.error ? [] : emps.data.map(e => ({ id: e.id, name: e.name })),
      };
    },
    enabled: !!companyId,
  });
  const rows      = deptData?.rows      ?? [];
  const employees = deptData?.employees ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateDepartmentInput>({
    name: '', description: '', headEmployeeId: '', costCentre: '', isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', description: '', headEmployeeId: '', costCentre: '', isActive: true });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(dept: Department) {
    setEditTarget(dept);
    setForm({
      name:            dept.name,
      description:     dept.description ?? '',
      headEmployeeId:  dept.headEmployeeId ?? '',
      costCentre:      dept.costCentre ?? '',
      isActive:        dept.isActive,
    });
    setErrors({});
    setDialogOpen(true);
  }

  async function handleSave() {
    const parsed = departmentSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const e of parsed.error.errors) errs[e.path[0] as string] = e.message;
      setErrors(errs);
      return;
    }
    setSaving(true);
    const input: CreateDepartmentInput = {
      name:           parsed.data.name,
      description:    parsed.data.description,
      headEmployeeId: form.headEmployeeId || undefined,
      costCentre:     parsed.data.costCentre,
      isActive:       parsed.data.isActive,
    };
    const { error } = editTarget
      ? await updateDepartment(companyId, editTarget.id, actorId, input)
      : await createDepartment(companyId, actorId, input);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: editTarget ? 'Department updated' : 'Department created' });
    setDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['departments-panel', companyId] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteDepartment(companyId, deleteTarget.id, actorId);
    if (error) { toast({ title: 'Cannot delete', description: error, variant: 'destructive' }); }
    else toast({ title: 'Department deleted' });
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['departments-panel', companyId] });
  }

  return (
    <>
      <div className="space-y-4">
        <SettingsSectionHeader
          category="departments"
          action={canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />New Department
            </Button>
          )}
        />
        <div className="glass-panel max-h-[70vh] overflow-auto shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Head</th>
                <th className="px-3 py-2 font-semibold">Cost Centre</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                {canWrite && <th className="w-20 px-3 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite ? 5 : 4} className="py-12 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={canWrite ? 5 : 4} className="py-12 text-center text-muted-foreground text-xs">No departments yet</td></tr>
              ) : rows.map(dept => (
                <tr key={dept.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium">{dept.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dept.headEmployeeName ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dept.costCentre ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge className={dept.isActive
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-secondary text-secondary-foreground'}>
                      {dept.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(dept)} aria-label={`Edit department ${dept.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(dept)} aria-label={`Delete department ${dept.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Department' : 'New Department'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea className="text-sm resize-none" rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Department Head</Label>
              <Select
                value={form.headEmployeeId || NONE_SELECT_VALUE}
                onValueChange={v => setForm(f => ({
                  ...f,
                  headEmployeeId: v === NONE_SELECT_VALUE ? '' : v,
                }))}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select employee (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECT_VALUE}>— None —</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cost Centre</Label>
              <Input className="h-8 text-sm" value={form.costCentre ?? ''} onChange={e => setForm(f => ({ ...f, costCentre: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label className="text-sm">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone. All employees must be reassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB TITLES PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface JobTitlesPanelProps {
  companyId: string;
  actorId: string;
  canWrite: boolean;
}

function JobTitlesPanel({ companyId, actorId, canWrite }: JobTitlesPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: jtData, isPending: loading } = useQuery({
    queryKey: ['job-titles-panel', companyId],
    queryFn: async () => {
      const [titles, depts] = await Promise.all([listJobTitles(companyId), listDepartments(companyId)]);
      return {
        rows: titles.error ? [] : titles.data,
        departments: depts.error ? [] : depts.data.filter(d => d.isActive),
      };
    },
    enabled: !!companyId,
  });
  const rows        = jtData?.rows        ?? [];
  const departments = jtData?.departments ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<JobTitle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobTitle | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateJobTitleInput>({
    name: '', departmentId: '', level: '', description: '', isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', departmentId: '', level: '', description: '', isActive: true });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(jt: JobTitle) {
    setEditTarget(jt);
    setForm({
      name:         jt.name,
      departmentId: jt.departmentId ?? '',
      level:        jt.level ?? '',
      description:  jt.description ?? '',
      isActive:     jt.isActive,
    });
    setErrors({});
    setDialogOpen(true);
  }

  async function handleSave() {
    const parsed = jobTitleSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const e of parsed.error.errors) errs[e.path[0] as string] = e.message;
      setErrors(errs);
      return;
    }
    setSaving(true);
    const input: CreateJobTitleInput = {
      name:         parsed.data.name,
      departmentId: form.departmentId || undefined,
      level:        (parsed.data.level as JobTitleLevel | undefined) || undefined,
      description:  parsed.data.description,
      isActive:     parsed.data.isActive,
    };
    const { error } = editTarget
      ? await updateJobTitle(companyId, editTarget.id, actorId, input)
      : await createJobTitle(companyId, actorId, input);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: editTarget ? 'Job title updated' : 'Job title created' });
    setDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['job-titles-panel', companyId] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteJobTitle(companyId, deleteTarget.id, actorId);
    if (error) { toast({ title: 'Cannot delete', description: error, variant: 'destructive' }); }
    else toast({ title: 'Job title deleted' });
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['job-titles-panel', companyId] });
  }

  return (
    <>
      <div className="space-y-4">
        <SettingsSectionHeader
          category="job-titles"
          action={canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />New Job Title
            </Button>
          )}
        />
        <div className="glass-panel max-h-[70vh] overflow-auto shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Department</th>
                <th className="px-3 py-2 font-semibold">Level</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                {canWrite && <th className="w-20 px-3 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite ? 5 : 4} className="py-12 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={canWrite ? 5 : 4} className="py-12 text-center text-muted-foreground text-xs">No job titles yet</td></tr>
              ) : rows.map(jt => (
                <tr key={jt.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium">{jt.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{jt.departmentName ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{jt.level ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge className={jt.isActive
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-secondary text-secondary-foreground'}>
                      {jt.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(jt)} aria-label={`Edit job title ${jt.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(jt)} aria-label={`Delete job title ${jt.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Job Title' : 'New Job Title'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Title *</Label>
              <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select
                value={form.departmentId || NONE_SELECT_VALUE}
                onValueChange={v => setForm(f => ({
                  ...f,
                  departmentId: v === NONE_SELECT_VALUE ? '' : v,
                }))}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select department (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECT_VALUE}>— None —</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Level</Label>
              <Select
                value={form.level || NONE_SELECT_VALUE}
                onValueChange={v => setForm(f => ({
                  ...f,
                  level: v === NONE_SELECT_VALUE ? '' : v as JobTitleLevel | '',
                }))}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select level (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECT_VALUE}>— None —</SelectItem>
                  {JOB_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea className="text-sm resize-none" rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label className="text-sm">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job Title</AlertDialogTitle>
            <AlertDialogDescription>Delete <strong>{deleteTarget?.name}</strong>? Employees using this title must be reassigned first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE TYPES PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface LeaveTypesPanelProps {
  companyId: string;
  actorId: string;
  canWrite: boolean;
}

function LeaveTypesPanel({ companyId, actorId, canWrite }: LeaveTypesPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['leave-types-panel', companyId],
    queryFn: async () => { const { data } = await listAllLeaveTypes(companyId); return data; },
    enabled: !!companyId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateLeaveTypeInput>({
    name: '', code: '', daysPerYear: 14, defaultDays: 14, carryForward: true, isPaid: true, requiresBalance: true, minAdvanceNoticeDays: null, active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', code: '', daysPerYear: 14, defaultDays: 14, carryForward: true, isPaid: true, requiresBalance: true, minAdvanceNoticeDays: null, active: true });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(lt: LeaveType) {
    setEditTarget(lt);
    setForm({ name: lt.name, code: lt.code, daysPerYear: lt.daysPerYear, defaultDays: lt.defaultDays, carryForward: lt.carryForward, isPaid: lt.isPaid, requiresBalance: lt.requiresBalance, minAdvanceNoticeDays: lt.minAdvanceNoticeDays ?? null, active: lt.active });
    setErrors({});
    setDialogOpen(true);
  }

  async function handleSave() {
    const parsed = leaveTypeAdminSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const e of parsed.error.errors) errs[e.path[0] as string] = e.message;
      setErrors(errs);
      return;
    }
    setSaving(true);
    const input: CreateLeaveTypeInput = {
      name: parsed.data.name, code: parsed.data.code,
      daysPerYear: parsed.data.daysPerYear, isPaid: parsed.data.isPaid, active: parsed.data.active,
      defaultDays: form.defaultDays ?? parsed.data.daysPerYear,
      carryForward: form.carryForward ?? true,
      requiresBalance: form.requiresBalance ?? true,
      minAdvanceNoticeDays: form.minAdvanceNoticeDays ?? null,
    };
    const { error } = editTarget
      ? await updateLeaveType(companyId, editTarget.id, actorId, input)
      : await createLeaveType(companyId, actorId, input);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: editTarget ? 'Leave type updated' : 'Leave type created' });
    setDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['leave-types-panel', companyId] });
  }

  async function handleQuickToggle(lt: LeaveType, active: boolean) {
    await updateLeaveType(companyId, lt.id, actorId, { ...lt, active });
    void queryClient.invalidateQueries({ queryKey: ['leave-types-panel', companyId] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteLeaveType(companyId, deleteTarget.id, actorId);
    if (error) toast({ title: 'Leave type deactivated', description: 'This leave type has existing balances and was deactivated instead of deleted.' });
    else toast({ title: 'Leave type deleted' });
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['leave-types-panel', companyId] });
  }

  return (
    <>
      <div className="space-y-4">
        <SettingsSectionHeader
          category="leave-types"
          action={canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />New Leave Type
            </Button>
          )}
        />
        <div className="glass-panel max-h-[70vh] overflow-auto shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Code</th>
                <th className="px-3 py-2 font-semibold">Days/Year</th>
                <th className="px-3 py-2 font-semibold">Rollover</th>
                <th className="px-3 py-2 font-semibold">Paid</th>
                <th className="px-3 py-2 font-semibold">Balance</th>
                <th className="px-3 py-2 font-semibold">Notice</th>
                <th className="px-3 py-2 font-semibold">Active</th>
                {canWrite && <th className="w-20 px-3 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite ? 8 : 7} className="py-12 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={canWrite ? 8 : 7} className="py-12 text-center text-muted-foreground text-xs">No leave types yet</td></tr>
              ) : rows.map(lt => (
                <tr key={lt.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium">{lt.name}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{lt.code}</Badge></td>
                  <td className="px-3 py-2">{lt.requiresBalance !== false ? lt.daysPerYear : '—'}</td>
                  <td className="px-3 py-2">
                    <Badge className={lt.carryForward
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-secondary text-secondary-foreground'}>
                      {lt.carryForward ? `≤${lt.defaultDays}d` : 'None'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={lt.isPaid
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-secondary text-secondary-foreground'}>
                      {lt.isPaid ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={lt.requiresBalance
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}>
                      {lt.requiresBalance ? 'Required' : 'Not required'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {lt.minAdvanceNoticeDays != null ? `${lt.minAdvanceNoticeDays}d` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {canWrite
                      ? <Switch checked={lt.active} onCheckedChange={v => handleQuickToggle(lt, v)} />
                      : <Badge className={lt.active ? 'bg-emerald-100 text-emerald-800' : 'bg-secondary text-secondary-foreground'}>{lt.active ? 'Active' : 'Inactive'}</Badge>}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(lt)} aria-label={`Edit leave type ${lt.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(lt)} aria-label={`Delete leave type ${lt.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Leave Type' : 'New Leave Type'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Code * (e.g. AL)</Label>
              <Input className="h-8 text-sm uppercase" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Days per year *</Label>
              <Input className="h-8 text-sm" type="number" min={0} max={365} value={form.daysPerYear}
                onChange={e => setForm(f => ({ ...f, daysPerYear: Number(e.target.value) }))} />
              {errors.daysPerYear && <p className="text-xs text-destructive">{errors.daysPerYear}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.isPaid} onCheckedChange={v => setForm(f => ({ ...f, isPaid: v }))} />
                <Label className="text-sm">Paid leave</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                <Label className="text-sm">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.carryForward ?? true} onCheckedChange={v => setForm(f => ({ ...f, carryForward: v }))} />
                <Label className="text-sm">Carry-forward</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.requiresBalance ?? true} onCheckedChange={v => setForm(f => ({ ...f, requiresBalance: v }))} />
                <Label className="text-sm">Requires balance</Label>
              </div>
            </div>
            {(form.carryForward ?? true) && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Default days per year (used for rollover)</Label>
                <Input className="h-8 text-sm" type="number" min={0} max={365} value={form.defaultDays ?? form.daysPerYear}
                  onChange={e => setForm(f => ({ ...f, defaultDays: Number(e.target.value) }))} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Advance notice required (calendar days)</Label>
              <Input
                className="h-8 text-sm"
                type="number"
                min={0}
                max={365}
                placeholder="None"
                value={form.minAdvanceNoticeDays ?? ''}
                onChange={e => setForm(f => ({ ...f, minAdvanceNoticeDays: e.target.value === '' ? null : Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">Leave blank for no advance notice requirement.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave Type</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? If employees have balances for this type it will be deactivated instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete / Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOLIDAYS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface HolidaysPanelProps {
  companyId: string;
  actorId: string;
  canWrite: boolean;
}

function HolidaysPanel({ companyId, actorId, canWrite }: HolidaysPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['holidays-panel', companyId],
    queryFn: async () => { const { data } = await listHolidays(companyId); return data; },
    enabled: !!companyId,
  });
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PublicHoliday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateHolidayInput>({
    name: '', date: '', holidayType: 'public', isRecurring: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const displayRows = rows.filter(h => {
    const year = new Date(h.date).getFullYear();
    return h.isRecurring || year === yearFilter;
  });

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', date: `${yearFilter}-01-01`, holidayType: 'public', isRecurring: false });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(h: PublicHoliday) {
    setEditTarget(h);
    setForm({ name: h.name, date: h.date, holidayType: h.holidayType, isRecurring: h.isRecurring });
    setErrors({});
    setDialogOpen(true);
  }

  async function handleSave() {
    const parsed = holidaySchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const e of parsed.error.errors) errs[e.path[0] as string] = e.message;
      setErrors(errs);
      return;
    }
    setSaving(true);
    const input: CreateHolidayInput = {
      name: parsed.data.name, date: parsed.data.date,
      holidayType: parsed.data.holidayType as HolidayType, isRecurring: parsed.data.isRecurring,
    };
    const { error } = editTarget
      ? await updateHoliday(companyId, editTarget.id, actorId, input)
      : await createHoliday(companyId, actorId, input);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: editTarget ? 'Holiday updated' : 'Holiday created' });
    setDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['holidays-panel', companyId] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteHoliday(companyId, deleteTarget.id, actorId);
    if (error) toast({ title: 'Error', description: error, variant: 'destructive' });
    else toast({ title: 'Holiday deleted' });
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['holidays-panel', companyId] });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <>
      <div className="space-y-4">
        <SettingsSectionHeader
          category="holidays"
          controls={(
            <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Year:</Label>
            <Select value={String(yearFilter)} onValueChange={v => setYearFilter(Number(v))}>
              <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            </div>
          )}
          action={canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />New Holiday
            </Button>
          )}
        />
        <div className="glass-panel max-h-[70vh] overflow-auto shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Recurring</th>
                {canWrite && <th className="w-20 px-3 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite ? 5 : 4} className="py-12 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : displayRows.length === 0 ? (
                <tr><td colSpan={canWrite ? 5 : 4} className="py-12 text-center text-muted-foreground text-xs">No holidays for {yearFilter}</td></tr>
              ) : displayRows.map(h => (
                <tr key={h.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium">{h.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{h.date}</td>
                  <td className="px-3 py-2">
                    <Badge className={h.holidayType === 'public'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'}>
                      {h.holidayType === 'public' ? 'Public' : 'Company'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{h.isRecurring ? 'Yes' : '—'}</td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(h)} aria-label={`Edit holiday ${h.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(h)} aria-label={`Delete holiday ${h.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Holiday' : 'New Holiday'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date *</Label>
              <Input className="h-8 text-sm" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.holidayType} onValueChange={v => setForm(f => ({ ...f, holidayType: v as HolidayType }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public Holiday</SelectItem>
                  <SelectItem value="company">Company Holiday</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isRecurring} onCheckedChange={v => setForm(f => ({ ...f, isRecurring: v }))} />
              <Label className="text-sm">Recurring annually</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Holiday</AlertDialogTitle>
            <AlertDialogDescription>Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLLOVER PANEL
// ═══════════════════════════════════════════════════════════════════════════════

interface RolloverPanelProps { companyId: string; actorId: string; canWrite: boolean }

function RolloverPanel({ companyId, canWrite }: RolloverPanelProps) {
  const { toast } = useToast();
  const thisYear = new Date().getFullYear();
  const [form, setForm] = useState({ fromYear: thisYear - 1, toYear: thisYear, maxCarryDays: 14 });
  const [running, setRunning] = useState(false);

  async function handleRun() {
    if (!canWrite) return;
    setRunning(true);
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = import.meta.env as Record<string, string>;
      const client = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
      const { error } = await client.functions.invoke('rollover-leave-balances', {
        body: { company_id: companyId, from_year: form.fromYear, to_year: form.toYear, max_carry_days: form.maxCarryDays },
      });
      if (error) throw error;
      toast({ title: 'Leave rollover completed', description: `Balances rolled from ${form.fromYear} → ${form.toYear}.` });
    } catch (err) {
      toast({ title: 'Rollover failed', description: String((err as Error).message), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Running a rollover copies unused leave balances (up to the carry-forward cap per leave type)
        into the destination year. Only leave types with <em>Carry-forward</em> enabled are included.
        This operation is safe to re-run — duplicate balance rows are skipped.
      </p>
      <div className="glass-panel space-y-4 p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From year</Label>
            <Input className="h-8 text-sm" type="number" min={2020} max={2100} value={form.fromYear}
              onChange={e => setForm(f => ({ ...f, fromYear: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To year</Label>
            <Input className="h-8 text-sm" type="number" min={2020} max={2100} value={form.toYear}
              onChange={e => setForm(f => ({ ...f, toYear: Number(e.target.value) }))} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Global max carry-over days (overrides per-type cap)</Label>
          <Input className="h-8 text-sm" type="number" min={0} max={365} value={form.maxCarryDays}
            onChange={e => setForm(f => ({ ...f, maxCarryDays: Number(e.target.value) }))} />
        </div>
        {canWrite && (
          <Button onClick={handleRun} disabled={running} className="w-full">
            <RefreshCw className={`h-4 w-4 mr-2 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running rollover…' : 'Run Leave Rollover'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY / WORKSPACE PANELS
// ═══════════════════════════════════════════════════════════════════════════════

interface SecurityPanelProps {
  companyId: string;
  actorId: string;
  canWrite: boolean;
}

const HRMS_ROLE_CATEGORIES: { value: HrmsRoleCategory; label: string }[] = [
  { value: 'executive', label: 'Executive' },
  { value: 'hr', label: 'HR' },
  { value: 'department', label: 'Department' },
  { value: 'line_management', label: 'Line Management' },
  { value: 'staff', label: 'Staff' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'custom', label: 'Custom' },
];

const HRMS_ROLE_SCOPES: { value: HrmsRoleScope; label: string }[] = [
  { value: 'company', label: 'Company' },
  { value: 'branch', label: 'Branch' },
  { value: 'department', label: 'Department' },
  { value: 'self', label: 'Self' },
];

const EMPTY_HRMS_ROLE_FORM: CreateHrmsRoleInput = {
  name: '',
  category: 'custom',
  scope: 'company',
  authorityLevel: 50,
  description: '',
  canApproveRequests: false,
  canManageEmployeeRecords: false,
  canViewHrmsReports: false,
  isActive: true,
};

function RoleManagementPanel({ companyId, actorId, canWrite }: SecurityPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: roles = [], isPending } = useQuery({
    queryKey: ['hrms-roles', companyId],
    queryFn: async () => {
      const { data, error } = await listHrmsRoles(companyId);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!companyId,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['hrms-role-employees', companyId],
    queryFn: async () => {
      const { data, error } = await listEmployeeDirectory(companyId);
      if (error) throw new Error(error);
      return data.filter(employee => employee.status === 'active');
    },
    enabled: !!companyId,
  });

  const [editingRole, setEditingRole] = useState<HrmsRole | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateHrmsRoleInput>(EMPTY_HRMS_ROLE_FORM);
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<HrmsRole | null>(null);

  function openCreate() {
    setEditingRole(null);
    setForm(EMPTY_HRMS_ROLE_FORM);
    setAssignedEmployeeIds([]);
    setErrors({});
    setDialogOpen(true);
  }

  async function openEdit(role: HrmsRole) {
    setEditingRole(role);
    setForm({
      name: role.name,
      category: role.category,
      scope: role.scope,
      authorityLevel: role.authorityLevel,
      description: role.description ?? '',
      canApproveRequests: role.canApproveRequests,
      canManageEmployeeRecords: role.canManageEmployeeRecords,
      canViewHrmsReports: role.canViewHrmsReports,
      isActive: role.isActive,
    });
    setErrors({});
    const { data, error } = await listHrmsRoleAssignments(companyId, role.id);
    if (error) toast({ title: 'Failed to load assignments', description: error, variant: 'destructive' });
    setAssignedEmployeeIds(data.map(assignment => assignment.employeeId).filter((id): id is string => !!id));
    setDialogOpen(true);
  }

  async function saveRole() {
    if (!canWrite) return;
    const parsed = hrmsRoleSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const error of parsed.error.errors) nextErrors[String(error.path[0])] = error.message;
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    const result = editingRole
      ? await updateHrmsRole(companyId, editingRole.id, actorId, parsed.data)
      : await createHrmsRole(companyId, actorId, parsed.data);
    const roleId = editingRole?.id ?? result.data?.id;
    const assignmentResult = roleId
      ? await replaceHrmsRoleEmployeeAssignments(companyId, roleId, actorId, assignedEmployeeIds)
      : { error: result.error };
    setSaving(false);
    if (result.error || assignmentResult.error) {
      toast({ title: 'Failed to save HRMS role', description: result.error ?? assignmentResult.error ?? undefined, variant: 'destructive' });
      return;
    }
    toast({ title: editingRole ? 'HRMS role updated' : 'HRMS role created' });
    setDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['hrms-roles', companyId] });
  }

  function toggleEmployee(employeeId: string) {
    setAssignedEmployeeIds(prev => prev.includes(employeeId)
      ? prev.filter(id => id !== employeeId)
      : [...prev, employeeId]);
  }

  async function deactivateRole() {
    if (!deactivateTarget || !canWrite) return;
    const { error } = await updateHrmsRole(companyId, deactivateTarget.id, actorId, {
      name: deactivateTarget.name,
      category: deactivateTarget.category,
      scope: deactivateTarget.scope,
      authorityLevel: deactivateTarget.authorityLevel,
      description: deactivateTarget.description ?? '',
      canApproveRequests: deactivateTarget.canApproveRequests,
      canManageEmployeeRecords: deactivateTarget.canManageEmployeeRecords,
      canViewHrmsReports: deactivateTarget.canViewHrmsReports,
      isActive: false,
    });
    if (error) toast({ title: 'Failed to deactivate role', description: error, variant: 'destructive' });
    else toast({ title: 'HRMS role deactivated' });
    setDeactivateTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['hrms-roles', companyId] });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">HRMS Organisational Roles</h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage HRMS roles used by approval flows, visibility rules, reporting, and operational workflows. Global app permission access stays in the main app Users & Permissions area.
            </p>
          </div>
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />New HRMS Role
            </Button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map(role => (
            <div key={role.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{role.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground capitalize">{role.category.replace(/_/g, ' ')} · {role.scope}</p>
                </div>
                <Badge className={role.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-secondary text-secondary-foreground'}>
                  {role.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="mt-3 line-clamp-2 min-h-[40px] text-sm text-muted-foreground">{role.description ?? 'No description provided.'}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border bg-muted/20 px-2 py-1.5"><span className="block font-semibold">{role.authorityLevel}</span><span className="text-muted-foreground">Level</span></div>
                <div className="rounded-md border bg-muted/20 px-2 py-1.5"><span className="block font-semibold">{role.assignedUserCount}</span><span className="text-muted-foreground">Users</span></div>
                <div className="rounded-md border bg-muted/20 px-2 py-1.5"><span className="block font-semibold">{role.canApproveRequests ? 'Yes' : 'No'}</span><span className="text-muted-foreground">Approves</span></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {role.canManageEmployeeRecords && <Badge variant="outline" className="text-xs">Employee records</Badge>}
                {role.canViewHrmsReports && <Badge variant="outline" className="text-xs">Reports</Badge>}
                {role.isSystemDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
              </div>
              <div className="mt-4 flex justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">Updated {role.updatedAt ? new Date(role.updatedAt).toLocaleDateString() : '—'}</p>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void openEdit(role)} aria-label={`Edit HRMS role ${role.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                    {role.isActive && <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeactivateTarget(role)} aria-label={`Deactivate HRMS role ${role.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {isPending && <p className="text-sm text-muted-foreground">Loading HRMS roles...</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={open => !open && setDialogOpen(false)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{editingRole ? `Edit ${editingRole.name}` : 'New HRMS Role'}</DialogTitle>
            <DialogDescription>
              Configure the HRMS role definition and assign active employees. This does not grant global app module access.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[66vh] space-y-5 overflow-y-auto p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Role name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Authority level *</Label>
                <Input type="number" min={1} max={999} value={form.authorityLevel} onChange={e => setForm(f => ({ ...f, authorityLevel: Number(e.target.value) }))} />
                {errors.authorityLevel && <p className="text-xs text-destructive">{errors.authorityLevel}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={form.category} onValueChange={value => setForm(f => ({ ...f, category: value as HrmsRoleCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HRMS_ROLE_CATEGORIES.map(category => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Scope</Label>
                <Select value={form.scope} onValueChange={value => setForm(f => ({ ...f, scope: value as HrmsRoleScope }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HRMS_ROLE_SCOPES.map(scope => <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Textarea rows={3} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['canApproveRequests', 'Can approve HRMS requests'],
                ['canManageEmployeeRecords', 'Can manage employee records'],
                ['canViewHrmsReports', 'Can view HRMS reports'],
                ['isActive', 'Role is active'],
              ].map(([key, label]) => {
                const fieldId = `hrms-role-${key}`;
                return (
                  <label key={key} htmlFor={fieldId} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                    <span className="text-sm font-medium">{label}</span>
                    <Switch id={fieldId} checked={Boolean(form[key as keyof CreateHrmsRoleInput])} onCheckedChange={value => setForm(f => ({ ...f, [key]: value }))} />
                  </label>
                );
              })}
            </div>
            <div className="rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Assigned Employees</h3>
                <p className="text-xs text-muted-foreground">Assignments are used by HRMS approval flows and workflow visibility rules.</p>
              </div>
              <div className="grid max-h-56 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
                {employees.map(employee => (
                  <label key={employee.id} htmlFor={`hrms-role-employee-${employee.id}`} className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2">
                    <Checkbox id={`hrms-role-employee-${employee.id}`} checked={assignedEmployeeIds.includes(employee.id)} onCheckedChange={() => toggleEmployee(employee.id)} />
                    <span>
                      <span className="block text-sm font-medium">{employee.name}</span>
                      <span className="block text-xs text-muted-foreground">{employee.departmentName ?? 'No department'} · {employee.jobTitleName ?? 'No position'}</span>
                    </span>
                  </label>
                ))}
                {employees.length === 0 && <p className="text-sm text-muted-foreground">No active employees available.</p>}
              </div>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveRole} disabled={saving || !canWrite}>{saving ? 'Saving...' : 'Save Role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={open => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate HRMS Role</AlertDialogTitle>
            <AlertDialogDescription>
              Deactivate <strong>{deactivateTarget?.name}</strong>? Existing assignments are retained, but inactive roles should not be used for new workflow routing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deactivateRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SystemReadinessPanel() {
  const checks = [
    'HRMS Settings manages HRMS-specific roles, policies, workflows, and operational defaults only.',
    'Global application module permissions stay in the main app Users & Permissions area.',
    'Approval flows use HRMS organisational roles instead of global app navigation roles.',
    'Destructive HRMS configuration changes require confirmation dialogs.',
    'Large HRMS workspaces use scrollable dialogs to avoid page overflow.',
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">System Controls</h2>
        </div>
        <div className="mt-4 grid gap-2">
          {checks.map(check => (
            <div key={check} className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {check}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface AdminConsoleOverviewProps {
  modules: CategoryDef[];
  canManageSecurity: boolean;
  onOpenModule: (module: Category) => void;
  onOpenGroup: (group: ConfigGroup) => void;
}

function AdminConsoleOverview({
  modules,
  canManageSecurity,
  onOpenModule,
  onOpenGroup,
}: AdminConsoleOverviewProps) {
  const recommendedIds: Category[] = ['roles', 'approval-flows', 'departments', 'leave-types', 'holidays'];
  const recommended = recommendedIds
    .map(id => modules.find(module => module.id === id))
    .filter((module): module is CategoryDef => !!module);
  const groupedAreas = [
    {
      title: 'HRMS Roles',
      description: 'Organisational roles for approvals, visibility, reporting, and HR operations.',
      group: 'HRMS Roles' as ConfigGroup,
      ids: ['roles'] as Category[],
      icon: Shield,
    },
    {
      title: 'Workflow Governance',
      description: 'Reusable approval routes with levels, conditions, and fallback handling.',
      group: 'Approval Flows' as ConfigGroup,
      ids: ['approval-flows'] as Category[],
      icon: GitMerge,
    },
    {
      title: 'Workforce Foundation',
      description: 'Department structure, position catalogues, and reporting ownership.',
      group: 'Departments' as ConfigGroup,
      ids: ['departments', 'job-titles'] as Category[],
      icon: Building2,
    },
    {
      title: 'Leave Operations',
      description: 'Entitlements, public holidays, rollover operations, and readiness controls.',
      group: 'Leave' as ConfigGroup,
      ids: ['leave-types', 'holidays', 'rollover'] as Category[],
      icon: Settings2,
    },
    {
      title: 'Operational Defaults',
      description: 'System readiness checks and HRMS guardrails that are ready for administrator review.',
      group: 'System' as ConfigGroup,
      ids: ['system'] as Category[],
      icon: UserCog,
    },
  ];
  const statCards = [
    { label: 'Configuration Modules', value: modules.length, detail: 'available workspaces' },
    { label: 'Admin-Gated Modules', value: modules.filter(module => module.adminOnly).length, detail: canManageSecurity ? 'editable by you' : 'hidden for your role' },
    { label: 'Workflow Modules', value: modules.filter(module => module.group === 'Approval Flows').length, detail: 'HRMS role routing' },
    { label: 'Operational Modules', value: modules.filter(module => !module.adminOnly).length, detail: 'HRMS controls' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(card => (
          <div key={card.label} className="rounded-lg border bg-background/80 p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="text-2xl font-semibold tracking-tight">{card.value}</span>
              <span className="text-xs text-muted-foreground">{card.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <div className="rounded-lg border bg-background/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Recommended Setup Path</h3>
              <p className="mt-1 text-xs text-muted-foreground">Open the core configuration workspaces in the usual implementation order.</p>
            </div>
            <Badge variant="outline">Guided</Badge>
          </div>
          <div className="mt-4 divide-y rounded-md border">
            {recommended.map((module, index) => {
              const Icon = module.icon;
              return (
                <div key={module.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <p className="truncate text-sm font-medium">{module.label}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{module.summary}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => onOpenModule(module.id)}>
                    Open
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {groupedAreas.map(area => {
            const Icon = area.icon;
            const areaModules = area.ids
              .map(id => modules.find(module => module.id === id))
              .filter((module): module is CategoryDef => !!module);
            if (areaModules.length === 0) return null;
            return (
              <div key={area.title} className="rounded-lg border bg-background/80 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{area.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{area.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {areaModules.map(module => (
                    <Button
                      key={module.id}
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => onOpenModule(module.id)}
                    >
                      {module.label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 h-8 px-2 text-xs"
                  onClick={() => onOpenGroup(area.group)}
                >
                  View {area.group}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HrmsSettingsPlaceholderPanel({ category }: { category: Category }) {
  const def = getCategoryDef(category);
  const Icon = def.icon;
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{def.label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{def.description}</p>
          <div className="mt-4 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            This HRMS-specific workspace is reserved for operational configuration. It intentionally does not expose global app/module permissions.
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function HrmsAdmin() {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const companyId = useCompanyId();
  const navigate = useNavigate();
  const { module: routeModule } = useParams<{ module?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const canWrite = hrmsAccess.canAccessSettings;
  const canManageSecurity = hrmsAccess.canAccessSettings;

  if (!user || !hrmsAccess.canAccessSettings) {
    return <UnauthorizedAccess />;
  }

  const visibleModules = CATEGORIES.filter(module =>
    !HIDDEN_MODULE_STATUSES.has(module.status ?? '') && (!module.adminOnly || canManageSecurity),
  );
  const activeGroup: ConfigGroup = isConfigGroup(searchParams.get('group')) ? searchParams.get('group') as ConfigGroup : 'General';
  const activeModuleDef = routeModule
    ? visibleModules.find(module => module.id === routeModule)
    : null;
  const activeModule = activeModuleDef?.id ?? null;
  const modulesForActiveGroup = activeGroup === 'General'
    ? []
    : visibleModules.filter(module => module.group === activeGroup);

  function openGroup(group: ConfigGroup) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (group === 'General') next.delete('group');
      else next.set('group', group);
      return next;
    });
  }

  function openModule(module: Category) {
    navigate(`/settings/${module}`);
  }

  function renderModuleContent(module: Category) {
    if (module === 'roles') return <RoleManagementPanel companyId={companyId} actorId={user.id} canWrite={canManageSecurity} />;
    if (module === 'approval-flows') {
      return (
        <Suspense fallback={<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading approval flow designer...</div>}>
          <ApprovalFlowsWorkspace embedded />
        </Suspense>
      );
    }
    if (module === 'departments') return <DepartmentsPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />;
    if (module === 'job-titles') return <JobTitlesPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />;
    if (module === 'leave-types') return <LeaveTypesPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />;
    if (module === 'holidays') return <HolidaysPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />;
    if (module === 'rollover') return <RolloverPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />;
    if (module === 'leave-quota') {
      return (
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading quota rules…</div>}>
          <LeaveQuotaPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />
        </Suspense>
      );
    }
    if (module === 'system') return <SystemReadinessPanel />;
    return <HrmsSettingsPlaceholderPanel category={module} />;
  }

  if (routeModule && !activeModuleDef) {
    return <UnauthorizedAccess />;
  }

  if (activeModule && activeModuleDef) {
    return (
      <div className="w-full space-y-4">
        <PageHeader
          title={activeModuleDef.label}
          description={activeModuleDef.description}
          breadcrumbs={[{ label: 'HRMS' }, { label: 'HRMS Settings' }, { label: activeModuleDef.label }]}
          actions={
            <Button size="sm" variant="outline" onClick={() => navigate('/settings')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Settings
            </Button>
          }
        />
        <div className="space-y-4">
          {renderModuleContent(activeModule)}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="HRMS Settings"
        description="Enterprise configuration workspace for HRMS structure, access, approvals, and operational controls."
        breadcrumbs={[{ label: 'HRMS' }, { label: 'HRMS Settings' }]}
      />

      <div className="rounded-lg border bg-card p-2 shadow-sm">
        <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Settings categories">
          {CONFIG_GROUPS.map(group => {
            const count = getGroupModuleCount(group, visibleModules);
            const active = group === activeGroup;
            if (count === 0) return null;
            return (
              <button
                key={group}
                type="button"
                onClick={() => openGroup(group)}
                className={cn(
                  'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {group}
              </button>
            );
          })}
        </nav>
      </div>

      <section className="rounded-xl border bg-card/80 p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {activeGroup === 'General' ? 'Settings Command Center' : `${activeGroup} Configuration`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {activeGroup === 'General'
                ? 'Review the configuration landscape and jump into the right workspace.'
                : 'Select a module to open its configuration workspace.'}
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            {getGroupModuleCount(activeGroup, visibleModules)} modules
          </Badge>
        </div>

        {activeGroup === 'General' ? (
          <AdminConsoleOverview
            modules={visibleModules}
            canManageSecurity={canManageSecurity}
            onOpenModule={openModule}
            onOpenGroup={openGroup}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modulesForActiveGroup.map(module => {
              const Icon = module.icon;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => openModule(module.id)}
                  className="group flex min-h-[142px] flex-col rounded-lg border bg-background/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {module.adminOnly && <Badge variant="outline" className="text-xs">Admin</Badge>}
                      <Badge variant="secondary" className="text-xs">{getModulePattern(module.id)}</Badge>
                      {module.status && <Badge variant="secondary" className="text-xs">{module.status}</Badge>}
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-foreground">{module.label}</h3>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{module.description}</p>
                  </div>
                  <span className="mt-auto pt-4 text-xs font-medium text-primary">Open {getModulePattern(module.id).toLowerCase()}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
