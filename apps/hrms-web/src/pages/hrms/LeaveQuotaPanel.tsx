/**
 * LeaveQuotaPanel — GM/Admin Settings Component
 *
 * Manages leave quota rules that control how many employees may be on leave
 * simultaneously for a given leave type, branch, department, and period.
 *
 * Lazy-loaded by HrmsAdmin.tsx via React.lazy().
 */

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Pencil, PowerOff, Trash2, AlertTriangle, Gauge, Info,
} from 'lucide-react';
import {
  listLeaveQuotaRules,
  createLeaveQuotaRule,
  updateLeaveQuotaRule,
  toggleLeaveQuotaRule,
  deleteLeaveQuotaRule,
  type LeaveQuotaRule,
  type CreateLeaveQuotaRuleInput,
  type LeaveQuotaRulePeriodType,
} from '@/services/leaveQuotaService';
import { listAllLeaveTypes, listDepartments } from '@/services/hrmsAdminService';
import { getBranches } from '@/services/masterDataService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveQuotaPanelProps {
  companyId: string;
  actorId: string;
  canWrite: boolean;
}

type RuleStatus = 'active' | 'inactive' | 'expired';

type FormState = {
  ruleName: string;
  leaveTypeId: string;
  branchId: string;
  departmentId: string;
  periodType: LeaveQuotaRulePeriodType | '';
  effectiveFrom: string;
  effectiveTo: string;
  maxRequests: string;
  countPending: boolean;
  halfDayWeight: '0.5' | '1.0';
  isActive: boolean;
  remarks: string;
};

const EMPTY_FORM: FormState = {
  ruleName: '',
  leaveTypeId: '',
  branchId: '',
  departmentId: '',
  periodType: 'daily',
  effectiveFrom: '',
  effectiveTo: '',
  maxRequests: '3',
  countPending: true,
  halfDayWeight: '0.5',
  isActive: true,
  remarks: '',
};

const NONE = '__none__';

const PERIOD_LABELS: Record<LeaveQuotaRulePeriodType, string> = {
  daily:      'Daily',
  weekly:     'Weekly',
  monthly:    'Monthly',
  date_range: 'Date Range',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getRuleStatus(rule: LeaveQuotaRule): RuleStatus {
  if (!rule.isActive) return 'inactive';
  if (rule.effectiveTo && rule.effectiveTo < todayIso()) return 'expired';
  return 'active';
}

function statusBadge(status: RuleStatus) {
  if (status === 'active') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        Active
      </Badge>
    );
  }
  if (status === 'expired') {
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        Expired
      </Badge>
    );
  }
  return <Badge variant="secondary">Inactive</Badge>;
}

function formatScopeLabel(rule: LeaveQuotaRule): string {
  const parts: string[] = [];
  if (rule.branchName ?? rule.branchId) parts.push(rule.branchName ?? rule.branchId ?? '');
  if (rule.departmentName) parts.push(rule.departmentName);
  return parts.length ? parts.join(' / ') : 'Company-wide';
}

function formatDateRange(from: string, to: string | null): string {
  return to ? `${from} – ${to}` : `${from} onwards`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeaveQuotaPanel({ companyId, actorId, canWrite }: LeaveQuotaPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: panelData, isPending: loading } = useQuery({
    queryKey: ['leave-quota-panel', companyId],
    queryFn: async () => {
      const [rulesRes, typesRes, deptsRes, branchesRes] = await Promise.all([
        listLeaveQuotaRules(companyId),
        listAllLeaveTypes(companyId),
        listDepartments(companyId),
        getBranches(companyId),
      ]);
      return {
        rules:       rulesRes.error   ? [] : rulesRes.data,
        leaveTypes:  typesRes.error   ? [] : typesRes.data,
        departments: deptsRes.error   ? [] : (deptsRes.data as { id: string; name: string }[]).filter(d => (d as unknown as { isActive?: boolean }).isActive !== false),
        branches:    branchesRes.error ? [] : branchesRes.data,
      };
    },
    enabled: !!companyId,
  });

  const rules      = panelData?.rules       ?? [];
  const leaveTypes = panelData?.leaveTypes  ?? [];
  const departments = panelData?.departments ?? [];
  const branches   = panelData?.branches    ?? [];

  // ── UI state ────────────────────────────────────────────────────────────────
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterLeaveType, setFilterLeaveType] = useState<string>('');

  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<LeaveQuotaRule | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<LeaveQuotaRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveQuotaRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Filtered rules ──────────────────────────────────────────────────────────
  const filteredRules = rules.filter(r => {
    const status = getRuleStatus(r);
    if (filterActive === 'active'   && status !== 'active')   return false;
    if (filterActive === 'inactive' && status === 'active')   return false;
    if (filterLeaveType && r.leaveTypeId !== filterLeaveType) return false;
    return true;
  });

  // ── Dialog helpers ──────────────────────────────────────────────────────────
  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, effectiveFrom: todayIso() });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(rule: LeaveQuotaRule) {
    setEditTarget(rule);
    setForm({
      ruleName:     rule.ruleName,
      leaveTypeId:  rule.leaveTypeId,
      branchId:     rule.branchId     ?? '',
      departmentId: rule.departmentId ?? '',
      periodType:   rule.periodType,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo:  rule.effectiveTo  ?? '',
      maxRequests:  String(rule.maxRequests),
      countPending: rule.countPending,
      halfDayWeight: String(rule.halfDayWeight) as '0.5' | '1.0',
      isActive:     rule.isActive,
      remarks:      rule.remarks ?? '',
    });
    setErrors({});
    setDialogOpen(true);
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!form.ruleName.trim())
      errs.ruleName = 'Rule name is required.';
    else if (form.ruleName.trim().length > 100)
      errs.ruleName = 'Rule name must be 100 characters or fewer.';

    if (!form.leaveTypeId)
      errs.leaveTypeId = 'Leave type is required.';

    if (!form.periodType)
      errs.periodType = 'Period type is required.';

    if (!form.effectiveFrom)
      errs.effectiveFrom = 'Effective from date is required.';

    if (form.periodType === 'date_range' && !form.effectiveTo)
      errs.effectiveTo = 'End date is required for Date Range period.';

    if (form.effectiveTo && form.effectiveFrom && form.effectiveTo < form.effectiveFrom)
      errs.effectiveTo = 'End date must be on or after the start date.';

    const maxReq = parseInt(form.maxRequests, 10);
    if (!form.maxRequests || isNaN(maxReq) || maxReq < 1)
      errs.maxRequests = 'Max requests must be at least 1.';

    // Duplicate scope check (same leave type + branch + department, active status)
    if (!editTarget) {
      const dup = rules.find(r =>
        r.isActive &&
        r.leaveTypeId   === form.leaveTypeId &&
        (r.branchId     ?? '') === form.branchId &&
        (r.departmentId ?? '') === form.departmentId &&
        r.periodType === form.periodType,
      );
      if (dup) {
        errs._warn = `An active "${dup.periodType}" quota rule already exists for this leave type and scope (${dup.ruleName}). Adding another may create conflicting limits.`;
      }
    }

    setErrors(errs);
    // Warnings (_warn) don't block; only hard errors do.
    const hardErrors = Object.entries(errs).filter(([k]) => k !== '_warn');
    return hardErrors.length === 0;
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    const input: CreateLeaveQuotaRuleInput = {
      ruleName:      form.ruleName.trim(),
      leaveTypeId:   form.leaveTypeId,
      branchId:      form.branchId     || null,
      departmentId:  form.departmentId  || null,
      periodType:    form.periodType as LeaveQuotaRulePeriodType,
      effectiveFrom: form.effectiveFrom,
      effectiveTo:   form.effectiveTo   || null,
      maxRequests:   parseInt(form.maxRequests, 10),
      countPending:  form.countPending,
      halfDayWeight: parseFloat(form.halfDayWeight),
      isActive:      form.isActive,
      remarks:       form.remarks.trim() || null,
    };

    const { error } = editTarget
      ? await updateLeaveQuotaRule(companyId, editTarget.id, actorId, input)
      : await createLeaveQuotaRule(companyId, actorId, input);

    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: editTarget ? 'Quota rule updated' : 'Quota rule created' });
    setDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['leave-quota-panel', companyId] });
  }

  // ── Toggle active ────────────────────────────────────────────────────────────
  async function handleToggleActive() {
    if (!deactivateTarget) return;
    const newState = !deactivateTarget.isActive;
    const { error } = await toggleLeaveQuotaRule(companyId, deactivateTarget.id, actorId, newState);
    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
    } else {
      toast({ title: newState ? 'Quota rule activated' : 'Quota rule deactivated' });
      void queryClient.invalidateQueries({ queryKey: ['leave-quota-panel', companyId] });
    }
    setDeactivateTarget(null);
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteLeaveQuotaRule(companyId, deleteTarget.id);
    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Quota rule deleted' });
      void queryClient.invalidateQueries({ queryKey: ['leave-quota-panel', companyId] });
    }
    setDeleteTarget(null);
  }

  const colCount = canWrite ? 9 : 8;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-4">
        {/* Section header with action + filters */}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Leave Quota Rules</h2>
              <p className="text-sm text-muted-foreground">
                Control how many employees can be on the same leave type simultaneously.
              </p>
            </div>
          </div>
          {canWrite && (
            <Button size="sm" onClick={openCreate} className="shrink-0">
              <Plus className="h-4 w-4 mr-1" />Add Quota Rule
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterLeaveType || NONE} onValueChange={v => setFilterLeaveType(v === NONE ? '' : v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All leave types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All leave types</SelectItem>
              {leaveTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterActive} onValueChange={v => setFilterActive(v as typeof filterActive)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto text-xs text-muted-foreground self-center">
            {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table */}
        <div className="glass-panel max-h-[60vh] overflow-auto shadow-sm">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Rule Name</th>
                <th className="px-3 py-2 font-semibold">Leave Type</th>
                <th className="px-3 py-2 font-semibold">Scope</th>
                <th className="px-3 py-2 font-semibold">Period</th>
                <th className="px-3 py-2 font-semibold">Effective Dates</th>
                <th className="px-3 py-2 font-semibold text-right">Max</th>
                <th className="px-3 py-2 font-semibold">Pending Counts</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                {canWrite && <th className="w-24 px-3 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="py-14 text-center text-xs text-muted-foreground">
                    Loading quota rules…
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Gauge className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">No quota rules configured</p>
                      <p className="text-xs">
                        {canWrite
                          ? 'Add a quota rule to limit how many employees can take leave on the same day.'
                          : 'Contact your GM or Admin to configure quota rules.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredRules.map(rule => {
                const status = getRuleStatus(rule);
                return (
                  <tr
                    key={rule.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/20"
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{rule.ruleName}</span>
                      {rule.remarks && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{rule.remarks}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {rule.leaveTypeName ?? rule.leaveTypeId}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={rule.branchId || rule.departmentId ? 'text-foreground' : 'text-muted-foreground text-xs italic'}>
                        {formatScopeLabel(rule)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-xs">
                        {PERIOD_LABELS[rule.periodType]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDateRange(rule.effectiveFrom, rule.effectiveTo)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {rule.maxRequests}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={rule.countPending ? 'text-amber-600 dark:text-amber-400 text-xs font-medium' : 'text-muted-foreground text-xs'}>
                        {rule.countPending ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(status)}</td>
                    {canWrite && (
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2"
                            onClick={() => openEdit(rule)}
                            title="Edit rule"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2"
                            onClick={() => setDeactivateTarget(rule)}
                            title={rule.isActive ? 'Deactivate rule' : 'Activate rule'}
                          >
                            <PowerOff className={`h-3.5 w-3.5 ${rule.isActive ? 'text-muted-foreground' : 'text-emerald-600'}`} />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(rule)}
                            title="Delete rule"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            When multiple rules match an employee, the most specific rule applies (branch + department {`>`} department {`>`} branch {`>`} company-wide).
            Employees will see quota availability before submitting a leave request.
          </span>
        </div>
      </div>

      {/* ── Create / Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Quota Rule' : 'New Quota Rule'}</DialogTitle>
            <DialogDescription>
              Define the maximum number of employees that may be on leave simultaneously.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-4 py-2">

              {/* Conflict warning */}
              {errors._warn && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{errors._warn}</span>
                </div>
              )}

              {/* Rule Name */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Rule Name <span className="text-destructive">*</span></Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="e.g. KK Branch Annual Leave Daily Limit"
                  value={form.ruleName}
                  onChange={e => setForm(f => ({ ...f, ruleName: e.target.value }))}
                  maxLength={100}
                />
                {errors.ruleName && <p className="text-xs text-destructive">{errors.ruleName}</p>}
              </div>

              {/* Leave Type */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Leave Type <span className="text-destructive">*</span></Label>
                <Select value={form.leaveTypeId || NONE} onValueChange={v => setForm(f => ({ ...f, leaveTypeId: v === NONE ? '' : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select leave type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} disabled>Select leave type</SelectItem>
                    {leaveTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name} ({lt.code})</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.leaveTypeId && <p className="text-xs text-destructive">{errors.leaveTypeId}</p>}
              </div>

              {/* Scope: Branch + Department */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Branch <span className="text-muted-foreground">(optional)</span></Label>
                  <Select value={form.branchId || NONE} onValueChange={v => setForm(f => ({ ...f, branchId: v === NONE ? '' : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All branches" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>All branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Department <span className="text-muted-foreground">(optional)</span></Label>
                  <Select value={form.departmentId || NONE} onValueChange={v => setForm(f => ({ ...f, departmentId: v === NONE ? '' : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All departments" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>All departments</SelectItem>
                      {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Period Type */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Quota Period <span className="text-destructive">*</span></Label>
                <Select value={form.periodType || NONE} onValueChange={v => setForm(f => ({ ...f, periodType: v === NONE ? '' : v as LeaveQuotaRulePeriodType }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select period type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily — max per calendar day</SelectItem>
                    <SelectItem value="weekly">Weekly — max per ISO week</SelectItem>
                    <SelectItem value="monthly">Monthly — max per calendar month</SelectItem>
                    <SelectItem value="date_range">Date Range — max over a fixed period</SelectItem>
                  </SelectContent>
                </Select>
                {errors.periodType && <p className="text-xs text-destructive">{errors.periodType}</p>}
              </div>

              {/* Effective Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Effective From <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={form.effectiveFrom}
                    onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  />
                  {errors.effectiveFrom && <p className="text-xs text-destructive">{errors.effectiveFrom}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    Effective To
                    {form.periodType === 'date_range'
                      ? <span className="text-destructive"> *</span>
                      : <span className="text-muted-foreground"> (optional)</span>}
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={form.effectiveTo}
                    min={form.effectiveFrom || undefined}
                    onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))}
                  />
                  {errors.effectiveTo && <p className="text-xs text-destructive">{errors.effectiveTo}</p>}
                </div>
              </div>

              {/* Max Requests */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  Maximum Concurrent Leave Slots <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  className="h-8 w-28 text-sm"
                  min={1}
                  value={form.maxRequests}
                  onChange={e => setForm(f => ({ ...f, maxRequests: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Max employees on this leave type at the same time within the quota window.
                </p>
                {errors.maxRequests && <p className="text-xs text-destructive">{errors.maxRequests}</p>}
              </div>

              {/* Half-day weight */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Half-Day Counts As</Label>
                <Select value={form.halfDayWeight} onValueChange={v => setForm(f => ({ ...f, halfDayWeight: v as '0.5' | '1.0' }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5 slots (half)</SelectItem>
                    <SelectItem value="1.0">1.0 slot (full)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How much a half-day leave deducts from the quota.
                </p>
              </div>

              {/* Count Pending + Active */}
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-medium">Count pending requests toward quota</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When enabled, pending (unapproved) requests reserve quota slots.
                    </p>
                  </div>
                  <Switch
                    checked={form.countPending}
                    onCheckedChange={v => setForm(f => ({ ...f, countPending: v }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Rule is active</Label>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Remarks <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  className="text-sm resize-none"
                  rows={2}
                  placeholder="e.g. Applies during peak festive season"
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                  maxLength={500}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : (editTarget ? 'Save Changes' : 'Create Rule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Toggle Active Confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={v => !v && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deactivateTarget?.isActive ? 'Deactivate Quota Rule' : 'Activate Quota Rule'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.isActive
                ? <>Deactivate <strong>{deactivateTarget?.ruleName}</strong>? Leave requests will no longer be validated against this rule until it is reactivated.</>
                : <>Activate <strong>{deactivateTarget?.ruleName}</strong>? It will immediately begin enforcing quota limits on new leave requests.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActive}>
              {deactivateTarget?.isActive ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Confirmation ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quota Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.ruleName}</strong>?
              {' '}Consider deactivating instead to preserve the audit trail.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
