import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  listPayrollRuns,
  createPayrollRun,
  resubmitPayrollRunFinalisation,
  reviewPayrollRunFinalisation,
  updatePayrollRunStatus,
  listPayrollItems,
} from '@/services/hrmsService';
import type { PayrollRun, PayrollItem, PayrollRunStatus } from '@/types';
import { Plus, Eye, CheckCircle2, ChevronDown, ChevronUp, Clock, CreditCard, RotateCcw, XCircle } from 'lucide-react';
import { HRMS_PAYROLL_ROLES } from '@/config/hrmsConfig';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';

const MANAGER_ROLES = HRMS_PAYROLL_ROLES;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STATUS_COLORS: Record<PayrollRunStatus, string> = {
  draft:      'bg-gray-100 text-gray-600 border-gray-200',
  finalised:  'bg-blue-100 text-blue-700 border-blue-200',
  paid:       'bg-green-100 text-green-700 border-green-200',
};

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2 });
}

export default function PayrollSummary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);

  const [runs, setRuns]         = useState<PayrollRun[]>([]);
  const [items, setItems]       = useState<PayrollItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [viewRunId, setViewRunId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newYear, setNewYear]   = useState(String(new Date().getFullYear()));
  const [newMonth, setNewMonth] = useState(String(new Date().getMonth() + 1));
  const [reviewingRunId, setReviewingRunId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const res = await listPayrollRuns(user.companyId, { includeApprovalHistory: true });
    setRuns(res.data);
    setLoading(false);
    if (res.error) toast({ title: 'Error', description: res.error, variant: 'destructive' });
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

  function canReviewRun(run: PayrollRun): boolean {
    if (!isManager || !user || run.status !== 'draft' || run.approvalInstanceStatus !== 'pending') return false;
    if (run.currentApproverUserId) return run.currentApproverUserId === user.id;
    if (run.currentApproverRole) return run.currentApproverRole === user.role;
    return false;
  }

  function canResubmitRun(run: PayrollRun): boolean {
    return Boolean(
      isManager
      && user
      && run.status === 'draft'
      && run.approvalInstanceStatus === 'rejected'
      && run.createdBy === user.id,
    );
  }

  function toggleHistory(runId: string) {
    setExpandedHistory(prev => ({ ...prev, [runId]: !prev[runId] }));
  }

  function formatTimelineTimestamp(value?: string) {
    if (!value) return 'Pending';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !user.id) return;
    const { error } = await createPayrollRun(user.companyId, Number(newYear), Number(newMonth), user.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Payroll run created' });
    setShowCreate(false);
    load();
  }

  async function handleStatusChange(runId: string, status: PayrollRunStatus) {
    const { error } = await updatePayrollRunStatus(runId, status, user?.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: `Status updated to ${status}` });
    load();
  }

  async function handleReview() {
    if (!reviewingRunId || !user?.id) return;
    const { error } = await reviewPayrollRunFinalisation(reviewingRunId, user.id, reviewAction, reviewNote);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: `Payroll finalisation ${reviewAction}` });
    notifyApprovalInboxChanged();
    setReviewingRunId(null);
    setReviewNote('');
    load();
  }

  async function handleResubmit(runId: string) {
    if (!user?.id) return;
    const { error } = await resubmitPayrollRunFinalisation(runId, user.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Payroll finalisation resubmitted' });
    notifyApprovalInboxChanged();
    load();
  }

  async function handleView(runId: string) {
    const { data, error } = await listPayrollItems(runId);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    setItems(data);
    setViewRunId(runId);
  }

  const viewingRun = runs.find(r => r.id === viewRunId);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payroll Summary"
        description="Manage monthly payroll runs"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Payroll' }]}
        actions={
          isManager ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Payroll Run
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <Card><CardContent className="flex items-center justify-center h-32 text-muted-foreground">No payroll runs yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <Card key={run.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      {MONTHS[run.periodMonth - 1]} {run.periodYear}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{run.totalHeadcount} employees · RM {fmt(run.totalGross)} gross · RM {fmt(run.totalNet)} net</p>
                  </div>
                  <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLORS[run.status]}`}>{run.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleView(run.id)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View Items
                </Button>
                {run.status === 'draft' && run.approvalInstanceStatus === 'pending' && (
                  <span className="text-xs text-muted-foreground">
                    Current step: {run.currentApprovalStepName ?? 'Approval pending'}
                  </span>
                )}
                {run.status === 'draft' && run.approvalInstanceStatus === 'rejected' && (
                  <span className="text-xs text-red-600">
                    Finalisation was rejected.
                  </span>
                )}
                {canReviewRun(run) && (
                  <span className="text-xs font-medium text-primary">Assigned to you</span>
                )}
                {(run.approvalInstanceId || run.approvalHistory?.length) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleHistory(run.id)}
                  >
                    {expandedHistory[run.id] ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                    {expandedHistory[run.id] ? 'Hide Timeline' : 'Show Timeline'}
                  </Button>
                )}
                {isManager && run.status === 'draft' && !run.approvalInstanceId && (
                  <Button size="sm" variant="outline" className="text-blue-700 border-blue-300" onClick={() => handleStatusChange(run.id, 'finalised')}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Finalise
                  </Button>
                )}
                {canResubmitRun(run) && (
                  <Button size="sm" variant="outline" className="text-amber-700 border-amber-300" onClick={() => handleResubmit(run.id)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Resubmit Finalisation
                  </Button>
                )}
                {canReviewRun(run) && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-700 border-blue-300"
                      onClick={() => { setReviewingRunId(run.id); setReviewAction('approved'); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve Finalisation
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 border-red-300"
                      onClick={() => { setReviewingRunId(run.id); setReviewAction('rejected'); }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </>
                )}
                {isManager && run.status === 'finalised' && (
                  <Button size="sm" variant="outline" className="text-green-700 border-green-300" onClick={() => handleStatusChange(run.id, 'paid')}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Mark Paid
                  </Button>
                )}
                {expandedHistory[run.id] && (
                  <div className="w-full mt-1 space-y-3 border-l border-border pl-4">
                    {run.approvalHistory?.map(decision => {
                      const decisionApproved = decision.decision === 'approved';
                      return (
                        <div key={decision.id} className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {decisionApproved ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span>{decision.stepName ?? `Step ${decision.stepOrder}`}</span>
                            <span className={decisionApproved ? 'text-green-700' : 'text-red-700'}>
                              {decision.decision}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {decision.approverName ?? 'Unknown approver'} · {formatTimelineTimestamp(decision.decidedAt)}
                          </p>
                          {decision.note && (
                            <p className="text-sm text-muted-foreground">{decision.note}</p>
                          )}
                        </div>
                      );
                    })}
                    {run.approvalInstanceStatus === 'pending' && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{run.currentApprovalStepName ?? 'Awaiting review'}</span>
                          <span>pending</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Waiting for {run.currentApproverRole ? run.currentApproverRole.replace(/_/g, ' ') : 'assigned approver'}
                        </p>
                      </div>
                    )}
                    {!run.approvalHistory?.length && run.approvalInstanceStatus !== 'pending' && (
                      <p className="text-sm text-muted-foreground">No approval decisions recorded.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create run dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Payroll Run</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Select value={newYear} onValueChange={setNewYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Month</label>
                <Select value={newMonth} onValueChange={setNewMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View items dialog */}
      <Dialog open={!!viewRunId} onOpenChange={v => { if (!v) setViewRunId(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Payroll Items — {viewingRun ? `${MONTHS[viewingRun.periodMonth - 1]} ${viewingRun.periodYear}` : ''}
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">OT</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground h-20">No items in this run</TableCell>
                </TableRow>
              ) : items.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{item.employeeName ?? '—'}</TableCell>
                  <TableCell className="text-right">{fmt(item.basicSalary)}</TableCell>
                  <TableCell className="text-right">{fmt(item.allowances)}</TableCell>
                  <TableCell className="text-right">{fmt(item.overtime)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(item.grossPay)}</TableCell>
                  <TableCell className="text-right text-red-600">({fmt(item.totalDeductions)})</TableCell>
                  <TableCell className="text-right font-bold">{fmt(item.netPay)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={!!reviewingRunId} onOpenChange={v => { if (!v) setReviewingRunId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="capitalize">{reviewAction} Payroll Finalisation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Note (optional)</label>
            <Textarea
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              rows={3}
              placeholder="Add a note for the payroll owner..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewingRunId(null)}>Cancel</Button>
            <Button
              onClick={handleReview}
              className={reviewAction === 'approved' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}
            >
              Confirm {reviewAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
