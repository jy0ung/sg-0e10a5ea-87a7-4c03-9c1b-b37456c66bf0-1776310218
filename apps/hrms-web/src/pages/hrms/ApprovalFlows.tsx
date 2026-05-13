import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
import { GitMerge, Plus, Pencil, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, X, SlidersHorizontal } from 'lucide-react';
import {
  listApprovalFlows, createApprovalFlow, updateApprovalFlow,
  toggleApprovalFlowActive, deleteApprovalFlow, listEmployeesForSelect,
} from '@/services/approvalFlowService';
import { listHrmsRoles } from '@/services/hrmsRoleService';
import type { ApprovalFlow, ApprovalStep, CreateApprovalFlowInput, FlowEntityType } from '@/types';
import { approvalFlowWithStepsSchema, type ApprovalFlowFormData } from '@/lib/validations';

// ─── Constants ───────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<FlowEntityType, string> = {
  leave_request: 'Leave Request',
  payroll_run:   'Payroll Run',
  appraisal:     'Appraisal',
  internal_request: 'Internal Request',
  general:       'General',
};

const ENTITY_TYPE_BADGE: Record<FlowEntityType, string> = {
  leave_request: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  payroll_run:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  appraisal:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  internal_request: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  general:       'bg-secondary text-secondary-foreground',
};

const APPROVER_TYPE_LABELS = {
  role:           'By Role',
  specific_user:  'Specific Employee',
  direct_manager: "Requester's Manager",
};

type StepDraft = Omit<ApprovalStep, 'id' | 'flowId' | 'approverUserName' | 'approverRoleName' | 'fallbackApproverUserName'>;

const EMPTY_STEP: StepDraft = {
  stepOrder: 1, name: '', approverType: 'role',
  approverRole: '', approverUserId: '', fallbackApproverUserId: '',
  escalationRule: '', conditionRule: '', isActive: true, allowSelfApproval: false,
};

const EMPTY_FORM: ApprovalFlowFormData = {
  name: '', description: '', entityType: 'general', isActive: true, steps: [],
};

// ─── Main Page ────────────────────────────────────────────────────────────────

interface ApprovalFlowsProps {
  embedded?: boolean;
}

export default function ApprovalFlows({ embedded = false }: ApprovalFlowsProps = {}) {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();

  const [entityFilter, setEntityFilter] = useState<FlowEntityType | 'all'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApprovalFlow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalFlow | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<ApprovalFlowFormData>(EMPTY_FORM);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stepErrors, setStepErrors] = useState<Record<number, Record<string, string>>>({});

  const isAuthorized = !!user && (HRMS_ADMIN_ROLES as string[]).includes(user.role);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-select', companyId],
    queryFn: async () => { const { data } = await listEmployeesForSelect(companyId); return data; },
    enabled: isAuthorized && !!companyId,
  });
  const { data: hrmsRoles = [] } = useQuery({
    queryKey: ['approval-hrms-roles', companyId],
    queryFn: async () => {
      const { data, error } = await listHrmsRoles(companyId);
      if (error) throw new Error(error);
      return data.filter(role => role.isActive && role.canApproveRequests);
    },
    enabled: isAuthorized && !!companyId,
  });

  const queryClient = useQueryClient();
  const { data: flows = [], isPending: loading } = useQuery({
    queryKey: ['approval-flows', companyId],
    queryFn: async () => { const { data } = await listApprovalFlows(companyId); return data; },
    enabled: isAuthorized && !!companyId,
  });

  if (!isAuthorized) {
    return <UnauthorizedAccess />;
  }

  const filtered = entityFilter === 'all' ? flows : flows.filter(f => f.entityType === entityFilter);

  // ── Dialog helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setSteps([{ ...EMPTY_STEP }]);
    setFormErrors({});
    setStepErrors({});
    setDialogOpen(true);
  }

  function openEdit(flow: ApprovalFlow) {
    setEditTarget(flow);
    setForm({
      name:        flow.name,
      description: flow.description ?? '',
      entityType:  flow.entityType,
      isActive:    flow.isActive,
      steps:       [],
    });
    setSteps(flow.steps.map(s => ({
      stepOrder:         s.stepOrder,
      name:              s.name,
      approverType:      s.approverType,
      approverRole:      s.approverRole ?? '',
      approverUserId:    s.approverUserId ?? '',
      fallbackApproverUserId: s.fallbackApproverUserId ?? '',
      escalationRule:    s.escalationRule ?? '',
      conditionRule:     s.conditionRule ?? '',
      isActive:          s.isActive,
      allowSelfApproval: s.allowSelfApproval,
    })));
    setFormErrors({});
    setStepErrors({});
    setDialogOpen(true);
  }

  // ── Step helpers ────────────────────────────────────────────────────────────

  function addStep() {
    setSteps(prev => [...prev, { ...EMPTY_STEP, stepOrder: prev.length + 1 }]);
  }

  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 })));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    setSteps(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, stepOrder: i + 1 }));
    });
  }

  function updateStep(idx: number, patch: Partial<StepDraft>) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const payload: ApprovalFlowFormData = { ...form, steps: steps as ApprovalFlowFormData['steps'] };
    const parsed = approvalFlowWithStepsSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      const se: Record<number, Record<string, string>> = {};
      for (const e of parsed.error.errors) {
        const [top, idxStr, field] = e.path as [string, string?, string?];
        if (top === 'steps' && idxStr !== undefined && field !== undefined) {
          const i = Number(idxStr);
          se[i] = se[i] ?? {};
          se[i][field] = e.message;
        } else {
          fe[top] = e.message;
        }
      }
      setFormErrors(fe);
      setStepErrors(se);
      return;
    }

    setSaving(true);
    const input: CreateApprovalFlowInput = {
      name:        parsed.data.name,
      description: parsed.data.description,
      entityType:  parsed.data.entityType,
      isActive:    parsed.data.isActive,
      steps:       steps.map((s, i) => ({
        stepOrder:         i + 1,
        name:              s.name,
        approverType:      s.approverType,
        approverRole:      s.approverRole || undefined,
        approverUserId:    s.approverUserId || undefined,
        fallbackApproverUserId: s.fallbackApproverUserId || undefined,
        escalationRule:    s.escalationRule || undefined,
        conditionRule:     s.conditionRule || undefined,
        isActive:          s.isActive,
        allowSelfApproval: s.allowSelfApproval,
      })),
    };

    const { error } = editTarget
      ? await updateApprovalFlow(editTarget.id, companyId, user.id, input)
      : await createApprovalFlow(companyId, user.id, input);

    setSaving(false);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: editTarget ? 'Flow updated' : 'Flow created' });
    setDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['approval-flows', companyId] });
  }

  async function handleToggleActive(flow: ApprovalFlow) {
    const { error } = await toggleApprovalFlowActive(companyId, flow.id, !flow.isActive, user.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); }
    void queryClient.invalidateQueries({ queryKey: ['approval-flows', companyId] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteApprovalFlow(companyId, deleteTarget.id, user.id);
    if (error) toast({ title: 'Error', description: error, variant: 'destructive' });
    else toast({ title: 'Flow deleted' });
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['approval-flows', companyId] });
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalActive = flows.filter(f => f.isActive).length;

  if (!isAuthorized) return <UnauthorizedAccess />;

  return (
    <div className="w-full space-y-4">
      {!embedded && (
        <PageHeader
          title="Approval Flows"
          breadcrumbs={[{ label: 'HRMS' }, { label: 'Approval Flows' }]}
          actions={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />New Flow
            </Button>
          }
        />
      )}
      {embedded && (
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Approval Flow Designer</h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Configure reusable approval sequences for leave, internal requests, payroll, appraisals, and future workflows.
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />New Flow
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Flows', value: flows.length },
          { label: 'Active', value: totalActive },
          { label: 'Inactive', value: flows.length - totalActive },
          { label: 'Entity Types', value: new Set(flows.map(f => f.entityType)).size },
        ].map(s => (
          <div key={s.label} className="glass-panel p-4">
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-foreground">Flow filters</p>
              <p className="text-[11px] leading-tight text-muted-foreground">Inspect workflows by request type and status</p>
            </div>
          </div>
          <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums">{filtered.length} flows</span>
        </div>
        <div className="flex flex-wrap gap-2">
        {(['all', 'leave_request', 'payroll_run', 'appraisal', 'internal_request', 'general'] as const).map(et => (
          <Button
            key={et}
            size="sm"
            variant={entityFilter === et ? 'default' : 'outline'}
            onClick={() => setEntityFilter(et)}
          >
            {et === 'all' ? 'All' : ENTITY_TYPE_LABELS[et]}
          </Button>
        ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel max-h-[70vh] overflow-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Name</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Applies To</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Steps</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Status</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                No approval flows yet. Create your first flow.
              </td></tr>
            ) : filtered.map(flow => (
              <tr key={flow.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                <td className="px-3 py-2 font-medium">{flow.name}</td>
                <td className="px-3 py-2">
                  <Badge className={ENTITY_TYPE_BADGE[flow.entityType]}>
                    {ENTITY_TYPE_LABELS[flow.entityType]}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}</td>
                <td className="px-3 py-2">
                  <Badge className={flow.isActive
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-secondary text-secondary-foreground'}>
                    {flow.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(flow)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleToggleActive(flow)} title={flow.isActive ? 'Deactivate' : 'Activate'}>
                      {flow.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(flow)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Flow Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-h-[92vh] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader>
            <div className="border-b px-6 py-4">
              <DialogTitle className="flex items-center gap-2">
                <GitMerge className="h-4 w-4" />
                {editTarget ? 'Edit Approval Flow' : 'New Approval Flow'}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Define the workflow scope, then arrange the approval levels in the order they must be completed.
              </p>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto">
            <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4 border-b bg-muted/20 p-6 lg:border-b-0 lg:border-r">
                <div>
                  <h3 className="text-sm font-semibold">Workflow Details</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Reusable configuration for a request family.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Name *</Label>
                  <Input className="h-9 text-sm" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Textarea className="text-sm resize-none" rows={4} value={form.description ?? ''}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Applies To *</Label>
                  <Select value={form.entityType}
                    onValueChange={v => setForm(f => ({ ...f, entityType: v as FlowEntityType }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ENTITY_TYPE_LABELS) as FlowEntityType[]).map(et => (
                        <SelectItem key={et} value={et}>{ENTITY_TYPE_LABELS[et]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <div>
                    <Label className="text-sm">Active workflow</Label>
                    <p className="text-xs text-muted-foreground">Active flows can receive new requests.</p>
                  </div>
                  <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                </div>
              </div>

              <div className="min-w-0 p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Approval Sequence</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Each level shows the approver, rule, required action, and fallback behavior.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={addStep} className="shrink-0">
                    <Plus className="h-3.5 w-3.5 mr-1" />Add Step
                  </Button>
                </div>
                {formErrors.steps && <p className="mb-3 text-xs text-destructive">{formErrors.steps}</p>}

                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <div key={idx} className="rounded-lg border bg-card shadow-sm">
                      <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{step.name || `Approval Level ${idx + 1}`}</p>
                            <p className="text-xs text-muted-foreground">Action required: approve or reject request</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => removeStep(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 p-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Step Name *</Label>
                          <Input className="h-8 text-sm" value={step.name}
                            onChange={e => updateStep(idx, { name: e.target.value })} />
                          {stepErrors[idx]?.name && <p className="text-xs text-destructive">{stepErrors[idx].name}</p>}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Routing Rule</Label>
                          <Select value={step.approverType}
                            onValueChange={v => updateStep(idx, { approverType: v as StepDraft['approverType'], approverRole: '', approverUserId: '' })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(APPROVER_TYPE_LABELS) as StepDraft['approverType'][]).map(at => (
                                <SelectItem key={at} value={at}>{APPROVER_TYPE_LABELS[at]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {step.approverType === 'role' && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Responsible HRMS Role *</Label>
                            <Select value={step.approverRole ?? ''}
                              onValueChange={v => updateStep(idx, { approverRole: v })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select HRMS role" /></SelectTrigger>
                              <SelectContent>
                                {hrmsRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {stepErrors[idx]?.approverRole && <p className="text-xs text-destructive">{stepErrors[idx].approverRole}</p>}
                          </div>
                        )}

                        {step.approverType === 'specific_user' && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Responsible Person *</Label>
                            <Select value={step.approverUserId ?? ''}
                              onValueChange={v => updateStep(idx, { approverUserId: v })}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select employee" /></SelectTrigger>
                              <SelectContent>
                                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {stepErrors[idx]?.approverUserId && <p className="text-xs text-destructive">{stepErrors[idx].approverUserId}</p>}
                          </div>
                        )}

                        {step.approverType === 'direct_manager' && (
                          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground md:col-span-2">
                            Responsible person: the requester's direct manager. Fallback: workflow cannot start if no manager is assigned.
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Fallback Approver</Label>
                          <Select value={step.fallbackApproverUserId ?? ''}
                            onValueChange={v => updateStep(idx, { fallbackApproverUserId: v === '__none__' ? '' : v })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optional fallback person" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                          <div>
                            <Label className="text-xs font-medium">Step active</Label>
                            <p className="text-xs text-muted-foreground">Inactive steps are skipped for new routing.</p>
                          </div>
                          <Switch checked={step.isActive} onCheckedChange={v => updateStep(idx, { isActive: v })} />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Condition / Rule</Label>
                          <Input className="h-8 text-sm" value={step.conditionRule ?? ''}
                            onChange={e => updateStep(idx, { conditionRule: e.target.value })} placeholder="Example: leave days > 3" />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Escalation Rule</Label>
                          <Input className="h-8 text-sm" value={step.escalationRule ?? ''}
                            onChange={e => updateStep(idx, { escalationRule: e.target.value })} placeholder="Example: escalate after 2 business days" />
                        </div>

                        <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 md:col-span-2">
                          <Checkbox
                            id={`self-approval-${idx}`}
                            checked={step.allowSelfApproval}
                            onCheckedChange={v => updateStep(idx, { allowSelfApproval: !!v })}
                          />
                          <div>
                            <Label htmlFor={`self-approval-${idx}`} className="text-xs font-medium">Allow self-approval</Label>
                            <p className="text-xs text-muted-foreground">Keep disabled for separation of duties unless explicitly required.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {steps.length === 0 && (
                  <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                    No steps yet. Click "Add Step" to begin.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Flow'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Approval Flow</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? All steps will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
