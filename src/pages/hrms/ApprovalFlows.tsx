import React, { useState, useEffect, useCallback } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { HRMS_ADMIN_ROLES } from '@/config/hrmsConfig';
import { GitMerge, Plus, Pencil, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, X } from 'lucide-react';
import {
  listApprovalFlows, createApprovalFlow, updateApprovalFlow,
  toggleApprovalFlowActive, deleteApprovalFlow, listEmployeesForSelect,
} from '@/services/approvalFlowService';
import type { ApprovalFlow, ApprovalStep, CreateApprovalFlowInput, FlowEntityType, AppRole } from '@/types';
import { approvalFlowWithStepsSchema, type ApprovalFlowFormData } from '@/lib/validations';

// ─── Constants ───────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<FlowEntityType, string> = {
  leave_request: 'Leave Request',
  payroll_run:   'Payroll Run',
  appraisal:     'Appraisal',
  general:       'General',
};

const ENTITY_TYPE_BADGE: Record<FlowEntityType, string> = {
  leave_request: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  payroll_run:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  appraisal:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  general:       'bg-secondary text-secondary-foreground',
};

const APPROVER_TYPE_LABELS = {
  role:           'By Role',
  specific_user:  'Specific Employee',
  direct_manager: "Requester's Manager",
};

const ALL_ROLES: { value: AppRole; label: string }[] = [
  { value: 'super_admin',     label: 'Super Admin' },
  { value: 'company_admin',   label: 'Company Admin' },
  { value: 'director',        label: 'Director' },
  { value: 'general_manager', label: 'General Manager' },
  { value: 'manager',         label: 'Manager' },
  { value: 'sales',           label: 'Sales Advisor' },
  { value: 'accounts',        label: 'Accounts' },
  { value: 'analyst',         label: 'Analyst' },
];

type StepDraft = Omit<ApprovalStep, 'id' | 'flowId' | 'approverUserName'>;

const EMPTY_STEP: StepDraft = {
  stepOrder: 1, name: '', approverType: 'role',
  approverRole: '', approverUserId: '', allowSelfApproval: false,
};

const EMPTY_FORM: ApprovalFlowFormData = {
  name: '', description: '', entityType: 'general', isActive: true, steps: [],
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApprovalFlows() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();

  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState<FlowEntityType | 'all'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApprovalFlow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalFlow | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<ApprovalFlowFormData>(EMPTY_FORM);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stepErrors, setStepErrors] = useState<Record<number, Record<string, string>>>({});

  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  // NOTE: auth guard is intentionally placed AFTER all hooks to satisfy React Rules of Hooks
  const isAuthorized = !!user && (HRMS_ADMIN_ROLES as string[]).includes(user.role);

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    const { data, error } = await listApprovalFlows(companyId);
    if (!error) setFlows(data);
    setLoading(false);
  }, [companyId, isAuthorized]);

  useEffect(() => { void load(); }, [load]);

  // Pre-load employees for specific_user picker
  useEffect(() => {
    if (!isAuthorized) return;
    listEmployeesForSelect(companyId).then(({ data }) => setEmployees(data));
  }, [companyId, isAuthorized]);

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
    void load();
  }

  async function handleToggleActive(flow: ApprovalFlow) {
    setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, isActive: !f.isActive } : f));
    const { error } = await toggleApprovalFlowActive(companyId, flow.id, !flow.isActive, user.id);
    if (error) { void load(); toast({ title: 'Error', description: error, variant: 'destructive' }); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteApprovalFlow(companyId, deleteTarget.id, user.id);
    if (error) toast({ title: 'Error', description: error, variant: 'destructive' });
    else toast({ title: 'Flow deleted' });
    setDeleteTarget(null);
    void load();
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalActive = flows.filter(f => f.isActive).length;

  if (!isAuthorized) return <UnauthorizedAccess />;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Approval Flows"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Approval Flows' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />New Flow
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Flows', value: flows.length },
          { label: 'Active', value: totalActive },
          { label: 'Inactive', value: flows.length - totalActive },
          { label: 'Entity Types', value: new Set(flows.map(f => f.entityType)).size },
        ].map(s => (
          <div key={s.label} className="glass-panel p-3 text-center">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'leave_request', 'payroll_run', 'appraisal', 'general'] as const).map(et => (
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

      {/* Table */}
      <div className="glass-panel overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Applies To</th>
              <th className="px-3 py-2 font-medium">Steps</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-4 w-4" />
              {editTarget ? 'Edit Approval Flow' : 'New Approval Flow'}
            </DialogTitle>
          </DialogHeader>

          {/* Section 1: Flow details */}
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input className="h-8 text-sm" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea className="text-sm resize-none" rows={2} value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Applies To *</Label>
              <Select value={form.entityType}
                onValueChange={v => setForm(f => ({ ...f, entityType: v as FlowEntityType }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ENTITY_TYPE_LABELS) as FlowEntityType[]).map(et => (
                    <SelectItem key={et} value={et}>{ENTITY_TYPE_LABELS[et]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label className="text-sm">Active</Label>
            </div>
          </div>

          <Separator />

          {/* Section 2: Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Approval Steps</h4>
              <Button size="sm" variant="outline" onClick={addStep}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Step
              </Button>
            </div>
            {formErrors.steps && <p className="text-xs text-destructive">{formErrors.steps}</p>}

            {steps.map((step, idx) => (
              <div key={idx} className="border border-border rounded-md p-3 space-y-2 bg-secondary/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Step {idx + 1}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-destructive hover:text-destructive" onClick={() => removeStep(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Step Name *</Label>
                  <Input className="h-7 text-sm" value={step.name}
                    onChange={e => updateStep(idx, { name: e.target.value })} />
                  {stepErrors[idx]?.name && <p className="text-xs text-destructive">{stepErrors[idx].name}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Approver Type</Label>
                  <Select value={step.approverType}
                    onValueChange={v => updateStep(idx, { approverType: v as StepDraft['approverType'], approverRole: '', approverUserId: '' })}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(APPROVER_TYPE_LABELS) as StepDraft['approverType'][]).map(at => (
                        <SelectItem key={at} value={at}>{APPROVER_TYPE_LABELS[at]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {step.approverType === 'role' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Role *</Label>
                    <Select value={step.approverRole ?? ''}
                      onValueChange={v => updateStep(idx, { approverRole: v })}>
                      <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {stepErrors[idx]?.approverRole && <p className="text-xs text-destructive">{stepErrors[idx].approverRole}</p>}
                  </div>
                )}

                {step.approverType === 'specific_user' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Employee *</Label>
                    <Select value={step.approverUserId ?? ''}
                      onValueChange={v => updateStep(idx, { approverUserId: v })}>
                      <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {stepErrors[idx]?.approverUserId && <p className="text-xs text-destructive">{stepErrors[idx].approverUserId}</p>}
                  </div>
                )}

                {step.approverType === 'direct_manager' && (
                  <p className="text-xs text-muted-foreground">No extra config needed — the requester's direct manager will be the approver.</p>
                )}

                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`self-approval-${idx}`}
                    checked={step.allowSelfApproval}
                    onCheckedChange={v => updateStep(idx, { allowSelfApproval: !!v })}
                  />
                  <Label htmlFor={`self-approval-${idx}`} className="text-xs">Allow self-approval</Label>
                </div>
              </div>
            ))}

            {steps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No steps yet. Click "+ Add Step" to begin.
              </p>
            )}
          </div>

          <DialogFooter>
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
