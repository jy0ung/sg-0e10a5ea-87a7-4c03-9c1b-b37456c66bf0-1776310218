import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock, CreditCard, Eye, Inbox, Star, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  listAppraisals,
  listLeaveRequests,
  listPayrollRuns,
  reviewAppraisalActivation,
  reviewLeaveRequest,
  reviewPayrollRunFinalisation,
} from '@/services/hrmsService';
import { HRMS_MANAGER_ROLES, HRMS_PAYROLL_ROLES } from '@/config/hrmsConfig';
import type { ApprovalDecision } from '@/types';
import {
  buildApprovalInboxItems,
  filterApprovalInboxItems,
  getApprovalInboxSourcePath,
  notifyApprovalInboxChanged,
  type ApprovalInboxEntityType,
  type ApprovalInboxFilter,
} from '@/lib/hrms/approvalInbox';

type ApprovalInboxReviewState = {
  entityType: ApprovalInboxEntityType;
  entityId: string;
  action: 'approved' | 'rejected';
} | null;

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown time';
  try {
    return format(parseISO(value), 'dd MMM yyyy, h:mm a');
  } catch {
    return value;
  }
}

function getLastDecision(history?: ApprovalDecision[]) {
  return history?.length ? history[history.length - 1] : undefined;
}

export default function ApprovalInbox() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const canOpenPayrollPage = HRMS_PAYROLL_ROLES.includes(user?.role as typeof HRMS_PAYROLL_ROLES[number]);
  const canOpenAppraisalPage = HRMS_MANAGER_ROLES.includes(user?.role as typeof HRMS_MANAGER_ROLES[number]);

  const queryClient = useQueryClient();

  const { data: inboxData, isPending: loading } = useQuery({
    queryKey: ['approval-inbox', user?.companyId],
    queryFn: async () => {
      const [leaveResult, payrollResult, appraisalResult] = await Promise.all([
        listLeaveRequests(user!.companyId, { includeApprovalHistory: true }),
        listPayrollRuns(user!.companyId, { includeApprovalHistory: true }),
        listAppraisals(user!.companyId, { includeApprovalHistory: true }),
      ]);
      if (leaveResult.error) toast({ title: 'Error', description: leaveResult.error, variant: 'destructive' });
      if (payrollResult.error) toast({ title: 'Error', description: payrollResult.error, variant: 'destructive' });
      if (appraisalResult.error) toast({ title: 'Error', description: appraisalResult.error, variant: 'destructive' });
      return { leaveRequests: leaveResult.data, payrollRuns: payrollResult.data, appraisals: appraisalResult.data };
    },
    enabled: !!user?.companyId,
  });

  const [filter, setFilter] = useState<ApprovalInboxFilter>('all');
  const [reviewTarget, setReviewTarget] = useState<ApprovalInboxReviewState>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // Real-time: reload inbox when any approval-related table changes for this company
  // Note: leaveRequests/payrollRuns/appraisals are derived from inboxData — use inboxData as dep
  useEffect(() => {
    if (!user?.companyId) return;

    const channel = supabase
      .channel(`approval-inbox:${user.companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests', filter: `company_id=eq.${user.companyId}` },
        () => void queryClient.invalidateQueries({ queryKey: ['approval-inbox', user.companyId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payroll_runs', filter: `company_id=eq.${user.companyId}` },
        () => void queryClient.invalidateQueries({ queryKey: ['approval-inbox', user.companyId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appraisals', filter: `company_id=eq.${user.companyId}` },
        () => void queryClient.invalidateQueries({ queryKey: ['approval-inbox', user.companyId] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.companyId, queryClient]);

  const items = useMemo(
    () => buildApprovalInboxItems(
      inboxData?.leaveRequests ?? [],
      inboxData?.payrollRuns ?? [],
      inboxData?.appraisals ?? [],
      user,
    ),
    [inboxData, user],
  );
  const filteredItems = useMemo(() => filterApprovalInboxItems(items, filter), [items, filter]);

  const leaveCount = items.filter(item => item.entityType === 'leave_request').length;
  const payrollCount = items.filter(item => item.entityType === 'payroll_run').length;
  const appraisalCount = items.filter(item => item.entityType === 'appraisal').length;

  function toggleHistory(itemKey: string) {
    setExpandedHistory(prev => ({ ...prev, [itemKey]: !prev[itemKey] }));
  }

  async function handleReview() {
    if (!reviewTarget || !user?.id) return;

    const result = reviewTarget.entityType === 'leave_request'
      ? await reviewLeaveRequest(reviewTarget.entityId, user.id, reviewTarget.action, reviewNote)
      : reviewTarget.entityType === 'payroll_run'
        ? await reviewPayrollRunFinalisation(reviewTarget.entityId, user.id, reviewTarget.action, reviewNote)
        : await reviewAppraisalActivation(reviewTarget.entityId, user.id, reviewTarget.action, reviewNote);

    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      return;
    }

    toast({
      title: reviewTarget.entityType === 'leave_request'
        ? `Leave request ${reviewTarget.action}`
        : reviewTarget.entityType === 'payroll_run'
          ? `Payroll finalisation ${reviewTarget.action}`
          : `Appraisal activation ${reviewTarget.action}`,
    });
    notifyApprovalInboxChanged();
    setReviewTarget(null);
    setReviewNote('');
    await queryClient.invalidateQueries({ queryKey: ['approval-inbox', user?.companyId] });
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Approval Inbox"
        description="Review assigned HRMS approvals across leave, payroll, and appraisals from one queue."
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Approval Inbox' }]}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assigned Now</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{items.length}</div>
            <p className="text-sm text-muted-foreground">Items currently waiting for your decision.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leave Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{leaveCount}</div>
            <p className="text-sm text-muted-foreground">Pending leave approvals assigned to you.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payroll Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{payrollCount}</div>
            <p className="text-sm text-muted-foreground">Pending payroll approvals assigned to you.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Appraisal Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{appraisalCount}</div>
            <p className="text-sm text-muted-foreground">Pending appraisal activations assigned to you.</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['all', `All (${items.length})`],
          ['leave_request', `Leave (${leaveCount})`],
          ['payroll_run', `Payroll (${payrollCount})`],
          ['appraisal', `Appraisals (${appraisalCount})`],
        ] as const).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={filter === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No approvals in this queue.</p>
              <p className="text-sm text-muted-foreground">Anything assigned to you in leave, payroll, or appraisals will surface here.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map(item => {
            const lastDecision = getLastDecision(item.approvalHistory);
            const isLeaveItem = item.entityType === 'leave_request';
            const isPayrollItem = item.entityType === 'payroll_run';
            const canOpenSource = isLeaveItem || (isPayrollItem ? canOpenPayrollPage : canOpenAppraisalPage);
            const itemKey = `${item.entityType}:${item.entityId}`;

            return (
              <Card key={itemKey}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isLeaveItem ? (
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                        ) : item.entityType === 'appraisal' ? (
                          <Star className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                        )}
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <Badge variant="outline">
                          {isLeaveItem ? 'Leave' : item.entityType === 'appraisal' ? 'Appraisal' : 'Payroll'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                      {item.summary && (
                        <p className="text-sm text-muted-foreground">{item.summary}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">pending</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <p>Current step: {item.currentApprovalStepName ?? 'Awaiting review'}</p>
                    <p>Updated: {formatTimestamp(item.updatedAt)}</p>
                  </div>

                  {(item.approvalHistory?.length || item.approvalInstanceStatus === 'pending') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => toggleHistory(itemKey)}
                    >
                      {expandedHistory[itemKey] ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      {expandedHistory[itemKey] ? 'Hide Timeline' : 'Show Timeline'}
                    </Button>
                  )}

                  {lastDecision && (
                    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        {lastDecision.decision === 'approved' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span>
                          Last step: {lastDecision.stepName ?? `Step ${lastDecision.stepOrder}`} · {lastDecision.decision}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lastDecision.approverName ?? 'Unknown approver'} · {formatTimestamp(lastDecision.decidedAt)}
                      </p>
                      {lastDecision.note && (
                        <p className="mt-2 text-sm text-muted-foreground">{lastDecision.note}</p>
                      )}
                    </div>
                  )}

                  {expandedHistory[itemKey] && (
                    <div className="space-y-3 border-l border-border pl-4">
                      {item.approvalHistory?.map(decision => {
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
                              {decision.approverName ?? 'Unknown approver'} · {formatTimestamp(decision.decidedAt)}
                            </p>
                            {decision.note && (
                              <p className="text-sm text-muted-foreground">{decision.note}</p>
                            )}
                          </div>
                        );
                      })}

                      {item.approvalInstanceStatus === 'pending' && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{item.currentApprovalStepName ?? 'Awaiting review'}</span>
                            <span>pending</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Waiting for {item.currentApproverRole ? item.currentApproverRole.replace(/_/g, ' ') : 'assigned approver'}
                          </p>
                        </div>
                      )}

                      {!item.approvalHistory?.length && item.approvalInstanceStatus !== 'pending' && (
                        <p className="text-sm text-muted-foreground">No approval decisions recorded.</p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => setReviewTarget({ entityType: item.entityType, entityId: item.entityId, action: 'approved' })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {isLeaveItem ? 'Approve Leave' : item.entityType === 'appraisal' ? 'Approve Activation' : 'Approve Finalisation'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 border-red-300 hover:bg-red-50"
                      onClick={() => setReviewTarget({ entityType: item.entityType, entityId: item.entityId, action: 'rejected' })}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                    {canOpenSource && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(getApprovalInboxSourcePath(item.entityType))}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> Open Source Page
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!reviewTarget} onOpenChange={open => {
        if (!open) {
          setReviewTarget(null);
          setReviewNote('');
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {reviewTarget?.action} {reviewTarget?.entityType === 'leave_request' ? 'Leave Request' : reviewTarget?.entityType === 'payroll_run' ? 'Payroll Finalisation' : 'Appraisal Activation'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="approval-review-note" className="text-sm font-medium">Note (optional)</label>
            <Textarea
              id="approval-review-note"
              value={reviewNote}
              onChange={event => setReviewNote(event.target.value)}
              rows={3}
              placeholder="Add a note for the requester..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setReviewTarget(null);
              setReviewNote('');
            }}>Cancel</Button>
            <Button
              onClick={handleReview}
              className={reviewTarget?.action === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              Confirm {reviewTarget?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}