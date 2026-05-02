import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { HRMS_ADMIN_ROLES } from '@/config/hrmsConfig';
import {
  Building2, Briefcase, Calendar, CalendarDays, RefreshCw,
  Plus, Pencil, Trash2,
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
} from '@/types';
import {
  departmentSchema, jobTitleSchema, leaveTypeAdminSchema, holidaySchema,
} from '@/lib/validations';

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = 'departments' | 'job-titles' | 'leave-types' | 'holidays' | 'rollover';

interface CategoryDef {
  id: Category;
  label: string;
  icon: React.ElementType;
  description: string;
  summary: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'departments',  label: 'Departments',     icon: Building2,    description: 'Organise employees into departments and assign department heads.', summary: 'Teams and cost centres' },
  { id: 'job-titles',   label: 'Job Titles',       icon: Briefcase,    description: 'Define job titles and optionally link them to departments.', summary: 'Roles and seniority' },
  { id: 'leave-types',  label: 'Leave Types',      icon: Calendar,     description: 'Configure leave types, entitlements, carry-forward rules, and paid/unpaid status.', summary: 'Entitlements and rules' },
  { id: 'holidays',     label: 'Holiday Calendar', icon: CalendarDays, description: 'Manage public and company holidays.', summary: 'Company calendar' },
  { id: 'rollover',     label: 'Leave Rollover',   icon: RefreshCw,    description: 'Roll over employee leave balances from one year to the next.', summary: 'Year-end rollover' },
];

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

interface SettingsSectionHeaderProps {
  category: Category;
  action?: React.ReactNode;
  controls?: React.ReactNode;
}

function SettingsSectionHeader({ category, action, controls }: SettingsSectionHeaderProps) {
  const def = getCategoryDef(category);
  const Icon = def.icon;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card/40 p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
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
  const [rows, setRows] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateDepartmentInput>({
    name: '', description: '', headEmployeeId: '', costCentre: '', isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [depts, emps] = await Promise.all([
      listDepartments(companyId),
      listEmployeeDirectory(companyId),
    ]);
    if (!depts.error) setRows(depts.data);
    if (!emps.error) setEmployees(emps.data.map(e => ({ id: e.id, name: e.name })));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

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
    void load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteDepartment(companyId, deleteTarget.id, actorId);
    if (error) { toast({ title: 'Cannot delete', description: error, variant: 'destructive' }); }
    else toast({ title: 'Department deleted' });
    setDeleteTarget(null);
    void load();
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
        <div className="glass-panel overflow-auto rounded-lg">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Head</th>
                <th className="px-3 py-2 font-medium">Cost Centre</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {canWrite && <th className="px-3 py-2 font-medium w-20">Actions</th>}
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
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(dept)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(dept)}>
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
  const [rows, setRows] = useState<JobTitle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<JobTitle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobTitle | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateJobTitleInput>({
    name: '', departmentId: '', level: '', description: '', isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [titles, depts] = await Promise.all([listJobTitles(companyId), listDepartments(companyId)]);
    if (!titles.error) setRows(titles.data);
    if (!depts.error) setDepartments(depts.data.filter(d => d.isActive));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

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
    void load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteJobTitle(companyId, deleteTarget.id, actorId);
    if (error) { toast({ title: 'Cannot delete', description: error, variant: 'destructive' }); }
    else toast({ title: 'Job title deleted' });
    setDeleteTarget(null);
    void load();
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
        <div className="glass-panel overflow-auto rounded-lg">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {canWrite && <th className="px-3 py-2 font-medium w-20">Actions</th>}
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
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(jt)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(jt)}>
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
  const [rows, setRows] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateLeaveTypeInput>({
    name: '', code: '', daysPerYear: 14, defaultDays: 14, carryForward: true, isPaid: true, active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listAllLeaveTypes(companyId);
    if (!error) setRows(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', code: '', daysPerYear: 14, defaultDays: 14, carryForward: true, isPaid: true, active: true });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(lt: LeaveType) {
    setEditTarget(lt);
    setForm({ name: lt.name, code: lt.code, daysPerYear: lt.daysPerYear, defaultDays: lt.defaultDays, carryForward: lt.carryForward, isPaid: lt.isPaid, active: lt.active });
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
    };
    const { error } = editTarget
      ? await updateLeaveType(companyId, editTarget.id, actorId, input)
      : await createLeaveType(companyId, actorId, input);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: editTarget ? 'Leave type updated' : 'Leave type created' });
    setDialogOpen(false);
    void load();
  }

  async function handleQuickToggle(lt: LeaveType, active: boolean) {
    await updateLeaveType(companyId, lt.id, actorId, { ...lt, active });
    void load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteLeaveType(companyId, deleteTarget.id, actorId);
    if (error) toast({ title: 'Leave type deactivated', description: 'This leave type has existing balances and was deactivated instead of deleted.' });
    else toast({ title: 'Leave type deleted' });
    setDeleteTarget(null);
    void load();
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
        <div className="glass-panel overflow-auto rounded-lg">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Days/Year</th>
                <th className="px-3 py-2 font-medium">Rollover</th>
                <th className="px-3 py-2 font-medium">Paid</th>
                <th className="px-3 py-2 font-medium">Active</th>
                {canWrite && <th className="px-3 py-2 font-medium w-20">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite ? 6 : 5} className="py-12 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={canWrite ? 6 : 5} className="py-12 text-center text-muted-foreground text-xs">No leave types yet</td></tr>
              ) : rows.map(lt => (
                <tr key={lt.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium">{lt.name}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{lt.code}</Badge></td>
                  <td className="px-3 py-2">{lt.daysPerYear}</td>
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
                    {canWrite
                      ? <Switch checked={lt.active} onCheckedChange={v => handleQuickToggle(lt, v)} />
                      : <Badge className={lt.active ? 'bg-emerald-100 text-emerald-800' : 'bg-secondary text-secondary-foreground'}>{lt.active ? 'Active' : 'Inactive'}</Badge>}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(lt)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(lt)}>
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
            <div className="flex items-center gap-4">
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
            </div>
            {(form.carryForward ?? true) && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Default days per year (used for rollover)</Label>
                <Input className="h-8 text-sm" type="number" min={0} max={365} value={form.defaultDays ?? form.daysPerYear}
                  onChange={e => setForm(f => ({ ...f, defaultDays: Number(e.target.value) }))} />
              </div>
            )}
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
  const [rows, setRows] = useState<PublicHoliday[]>([]);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PublicHoliday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateHolidayInput>({
    name: '', date: '', holidayType: 'public', isRecurring: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listHolidays(companyId);
    if (!error) setRows(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

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
    void load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteHoliday(companyId, deleteTarget.id, actorId);
    if (error) toast({ title: 'Error', description: error, variant: 'destructive' });
    else toast({ title: 'Holiday deleted' });
    setDeleteTarget(null);
    void load();
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
        <div className="glass-panel overflow-auto rounded-lg">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Recurring</th>
                {canWrite && <th className="px-3 py-2 font-medium w-20">Actions</th>}
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
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(h)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(h)}>
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
    <div className="space-y-6 max-w-md">
      <p className="text-sm text-muted-foreground">
        Running a rollover copies unused leave balances (up to the carry-forward cap per leave type)
        into the destination year. Only leave types with <em>Carry-forward</em> enabled are included.
        This operation is safe to re-run — duplicate balance rows are skipped.
      </p>
      <div className="glass-panel p-5 space-y-4">
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
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function HrmsAdmin() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const [activeCategory, setActiveCategory] = useState<Category>('departments');

  const canWrite = !!user && (HRMS_ADMIN_ROLES as string[]).includes(user.role);

  if (!user || !(HRMS_ADMIN_ROLES as string[]).includes(user.role)) {
    return <UnauthorizedAccess />;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="HRMS Settings"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'HRMS Settings' }]}
      />

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="rounded-lg border border-border bg-card/40 p-2 shadow-sm lg:sticky lg:top-6 lg:self-start">
          <div className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Configuration
          </div>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const active = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'group w-full rounded-md px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <span className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-5">{cat.label}</span>
                    <span className={cn(
                      'block truncate text-xs leading-4',
                      active ? 'text-primary-foreground/75' : 'text-muted-foreground',
                    )}>
                      {cat.summary}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          {activeCategory === 'departments' && (
            <DepartmentsPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />
          )}
          {activeCategory === 'job-titles' && (
            <JobTitlesPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />
          )}
          {activeCategory === 'leave-types' && (
            <LeaveTypesPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />
          )}
          {activeCategory === 'holidays' && (
            <HolidaysPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />
          )}
          {activeCategory === 'rollover' && (
            <RolloverPanel companyId={companyId} actorId={user.id} canWrite={canWrite} />
          )}
        </div>
      </div>
    </div>
  );
}
