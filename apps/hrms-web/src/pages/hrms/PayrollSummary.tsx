import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  listPayrollRuns,
  createPayrollRun,
  resubmitPayrollRunFinalisation,
  updatePayrollRunStatus,
  listPayrollItems,
} from '@/services/hrmsService';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { PayrollRun, PayrollItem, PayrollRunStatus } from '@/types';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Eye,
  Plus,
  RotateCcw,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { getApprovalInboxReviewPath, notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
type PayrollItemRow = PayrollItem & Record<string, unknown>;

const PAYROLL_ITEM_COLUMNS: StandardTableColumn<PayrollItemRow>[] = [
  { key: 'employeeName', label: 'Employee', render: (i) => (i.employeeName as string | undefined) ?? '—' },
  { key: 'basicSalary', label: 'Basic', className: 'text-right', render: (i) => fmt(i.basicSalary as number) },
  { key: 'allowances', label: 'Allowances', className: 'text-right', render: (i) => fmt(i.allowances as number) },
  { key: 'overtime', label: 'OT', className: 'text-right', render: (i) => fmt(i.overtime as number) },
  { key: 'grossPay', label: 'Gross', className: 'text-right font-medium', render: (i) => fmt(i.grossPay as number) },
  { key: 'totalDeductions', label: 'Deductions', className: 'text-right text-red-600', render: (i) => `(${fmt(i.totalDeductions as number)})` },
  { key: 'netPay', label: 'Net Pay', className: 'text-right font-bold', render: (i) => fmt(i.netPay as number) },
];

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2 });
}

export default function PayrollSummary() {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const { toast } = useToast();
  const canManagePayroll = hrmsAccess.canAccessPayroll;

  const queryClient = useQueryClient();
  const { data: runs = [], isPending: loading } = useQuery({
    queryKey: ['payroll-runs', user?.companyId],
    queryFn: async () => {
      const res = await listPayrollRuns(user!.companyId, { includeApprovalHistory: true });
      if (res.error) toast({ title: 'Error', description: res.error, variant: 'destructive' });
      return res.data;
    },
    enabled: !!user?.companyId,
  });
  const [items, setItems]       = useState<PayrollItem[]>([]);
  const [viewRunId, setViewRunId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newYear, setNewYear]   = useState(String(new Date().getFullYear()));
  const [newMonth, setNewMonth] = useState(String(new Date().getMonth() + 1));
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const sortedRuns = useMemo(
    () => [...runs].sort((left, right) => (
      right.periodYear - left.periodYear || right.periodMonth - left.periodMonth
    )),
    [runs],
  );

  const latestRun = sortedRuns[0] ?? null;
  const payrollMetrics = useMemo(() => ({
    latestHeadcount: latestRun?.totalHeadcount ?? 0,
    totalNet: runs.reduce((sum, run) => sum + run.totalNet, 0),
    pendingApprovals: runs.filter((run) => run.approvalInstanceStatus === 'pending').length,
    paidRuns: runs.filter((run) => run.status === 'paid').length,
  }), [latestRun, runs]);

  function canReviewRun(run: PayrollRun): boolean {
    if (!canManagePayroll || !user || run.status !== 'draft' || run.approvalInstanceStatus !== 'pending') return false;
    if (run.currentApproverUserId) return run.currentApproverUserId === user.id;
    if (run.currentApproverRole) return hrmsAccess.matchesApproverRole(run.currentApproverRole);
    return false;
  }

  function canResubmitRun(run: PayrollRun): boolean {
    return Boolean(
      canManagePayroll
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
    void queryClient.invalidateQueries({ queryKey: ['payroll-runs', user?.companyId] });
  }

  async function handleStatusChange(runId: string, status: PayrollRunStatus) {
    const { error } = await updatePayrollRunStatus(runId, status, user?.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: `Status updated to ${status}` });
    void queryClient.invalidateQueries({ queryKey: ['payroll-runs', user?.companyId] });
  }

  async function handleResubmit(runId: string) {
    if (!user?.id) return;
    const { error } = await resubmitPayrollRunFinalisation(runId, user.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Payroll finalisation resubmitted' });
    notifyApprovalInboxChanged();
    void queryClient.invalidateQueries({ queryKey: ['payroll-runs', user?.companyId] });
  }

  async function handleView(runId: string) {
    const { data, error } = await listPayrollItems(runId);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    setItems(data);
    setViewRunId(runId);
  }

  const viewingRun = runs.find(r => r.id === viewRunId);

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Payroll Workspace"
        description="Prepare monthly payroll, monitor approval readiness, and track payout status."
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Payroll' }]}
        actions={
          canManagePayroll ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Payroll Run
            </Button>
          ) : undefined
        }
      />

      {!loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
              <CardTitle className="text-sm font-medium">Latest headcount</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-2xl font-semibold tabular-nums">{payrollMetrics.latestHeadcount}</p>
              <p className="text-xs text-muted-foreground">
                {latestRun ? `${MONTHS[latestRun.periodMonth - 1]} ${latestRun.periodYear}` : 'No run yet'}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
              <CardTitle className="text-sm font-medium">Net payroll</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="truncate text-2xl font-semibold tabular-nums" title={`RM ${fmt(payrollMetrics.totalNet)}`}>RM {fmt(payrollMetrics.totalNet)}</p>
              <p className="text-xs text-muted-foreground">Across visible runs</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
              <CardTitle className="text-sm font-medium">Pending approval</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-2xl font-semibold tabular-nums">{payrollMetrics.pendingApprovals}</p>
              <p className="text-xs text-muted-foreground">Runs waiting for review</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
              <CardTitle className="text-sm font-medium">Paid runs</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-2xl font-semibold tabular-nums">{payrollMetrics.paidRuns}</p>
              <p className="text-xs text-muted-foreground">Completed payroll cycles</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : runs.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium text-foreground">No payroll runs yet</p>
            <p className="text-sm text-muted-foreground">Create the first run when salary inputs are ready for review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-foreground">Payroll runs</h2>
              <p className="text-sm text-muted-foreground">Newest cycles first, with approval state and payout actions.</p>
            </div>
            <Badge variant="outline">{runs.length} runs</Badge>
          </div>
          {sortedRuns.map(run => (
            <Card key={run.id} className="overflow-hidden shadow-sm">
              <CardHeader className="border-b bg-muted/30 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 truncate text-base">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      {MONTHS[run.periodMonth - 1]} {run.periodYear}
                    </CardTitle>
                    <p className="truncate text-sm text-muted-foreground">{run.totalHeadcount} employees · RM {fmt(run.totalGross)} gross · RM {fmt(run.totalNet)} net</p>
                  </div>
                <Badge variant="outline" className="capitalize text-xs">{run.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 p-4">
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
                {canManagePayroll && run.status === 'draft' && !run.approvalInstanceId && (
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
                  <Button asChild size="sm" variant="outline" className="text-blue-700 border-blue-300">
                    <Link to={getApprovalInboxReviewPath('payroll_run', run.id)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Review in Approval Inbox
                    </Link>
                  </Button>
                )}
                {canManagePayroll && run.status === 'finalised' && (
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
                          Waiting for {run.currentApproverRole ? 'assigned HRMS role' : 'assigned approver'}
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
                <label htmlFor="payroll-run-year" className="text-sm font-medium">Year</label>
                <Select value={newYear} onValueChange={setNewYear}>
                  <SelectTrigger id="payroll-run-year"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="payroll-run-month" className="text-sm font-medium">Month</label>
                <Select value={newMonth} onValueChange={setNewMonth}>
                  <SelectTrigger id="payroll-run-month"><SelectValue /></SelectTrigger>
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
          <StandardTable
            data={items.map(i => ({ ...i }))}
            columns={PAYROLL_ITEM_COLUMNS}
            emptyMessage="No items in this run"
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}
