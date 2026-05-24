import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock, CreditCard, Eye, Inbox, Star, XCircle } from 'lucide-react';
import { FilterBar } from '@/components/shared/FilterBar';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageSpinner } from '@/components/shared/PageSpinner';
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
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { approvalInboxQueryKey, useApprovalInboxItems } from '@/hooks/useApprovalInboxItems';
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel';
import {
  reviewAppraisalActivation,
  reviewLeaveRequest,
  reviewPayrollRunFinalisation,
} from '@/services/hrmsService';
import type { ApprovalDecision } from '@/types';
import {
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

const APPROVAL_FILTERS: ApprovalInboxFilter[] = ['all', 'leave_request', 'payroll_run', 'appraisal'];

function parseApprovalFilter(value: string | null): ApprovalInboxFilter {
  return APPROVAL_FILTERS.includes(value as ApprovalInboxFilter)
    ? value as ApprovalInboxFilter
    : 'all';
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const { toast } = useToast();
  const canOpenPayrollPage = hrmsAccess.canAccessRoute('payroll');
  const canOpenAppraisalPage = hrmsAccess.canAccessRoute('appraisals');

  const queryClient = useQueryClient();
  const { errors: inboxErrors, isPending: loading, items } = useApprovalInboxItems();

  const filter = parseApprovalFilter(searchParams.get('type'));
  const targetId = searchParams.get('target');
  const [reviewTarget, setReviewTarget] = useState<ApprovalInboxReviewState>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  useEffect(() => {
    inboxErrors.forEach(error => {
      toast({ title: 'Error', description: error, variant: 'destructive' });
    });
  }, [inboxErrors, toast]);

  // Real-time: reload inbox when any approval-related table changes for this company.
  useSupabaseChannel({
    name: `approval-inbox:${user?.companyId ?? 'anon'}`,
    enabled: !!user?.companyId,
    subscriptions: [
      { event: '*', table: 'leave_requests', filter: `company_id=eq.${user?.companyId ?? ''}` },
      { event: '*', table: 'payroll_runs',   filter: `company_id=eq.${user?.companyId ?? ''}` },
      { event: '*', table: 'appraisals',     filter: `company_id=eq.${user?.companyId ?? ''}` },
    ],
    onChange: () => {
      if (user?.companyId) {
        void queryClient.invalidateQueries({ queryKey: approvalInboxQueryKey(user.companyId) });
      }
    },
  });

  const filteredItems = useMemo(() => {
    const filtered = filterApprovalInboxItems(items, filter);
    if (!targetId) return filtered;
    return [...filtered].sort((left, right) => {
      if (left.entityId === targetId) return -1;
      if (right.entityId === targetId) return 1;
      return 0;
    });
  }, [filter, items, targetId]);

  const leaveCount = items.filter(item => item.entityType === 'leave_request').length;
  const payrollCount = items.filter(item => item.entityType === 'payroll_run').length;
  const appraisalCount = items.filter(item => item.entityType === 'appraisal').length;

  function toggleHistory(itemKey: string) {
    setExpandedHistory(prev => ({ ...prev, [itemKey]: !prev[itemKey] }));
  }

  function setFilter(nextFilter: ApprovalInboxFilter) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (nextFilter === 'all') next.delete('type');
      else next.set('type', nextFilter);
      next.delete('target');
      return next;
    });
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
    await queryClient.invalidateQueries({ queryKey: approvalInboxQueryKey(user?.companyId) });
  }

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Approval Inbox"
        description="Review assigned HRMS approvals across leave, payroll, and appraisals from one queue."
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Approval Inbox' }]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Assigned Now', value: items.length, helper: 'Items waiting for your decision', bg: items.length > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-muted', fg: items.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground', icon: Inbox },
          { label: 'Leave Queue', value: leaveCount, helper: 'Pending leave approvals', bg: 'bg-blue-100 dark:bg-blue-900/30', fg: 'text-blue-600 dark:text-blue-400', icon: Calendar },
          { label: 'Payroll Queue', value: payrollCount, helper: 'Pending payroll reviews', bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-600 dark:text-emerald-400', icon: CreditCard },
          { label: 'Appraisal Queue', value: appraisalCount, helper: 'Pending activation approvals', bg: 'bg-violet-100 dark:bg-violet-900/30', fg: 'text-violet-600 dark:text-violet-400', icon: Star },
        ].map(({ label, value, helper, bg, fg, icon: Icon }) => (
          <Card key={label} className="overflow-hidden shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-5 w-5 ${fg}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold tabular-nums ${fg}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{helper}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <FilterBar title="Approval filters" description="Focus the decision queue by HRMS source" countLabel={`${filteredItems.length} visible`}>
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
      </FilterBar>

      {loading ? (
        <PageSpinner />
      ) : filteredItems.length === 0 ? (
        <Card className="shadow-sm">
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
            const isTarget = targetId === item.entityId;
            const isUnassigned = !item.currentApproverUserId && !item.currentApproverRole;

            return (
              <Card
                key={itemKey}
                className={`overflow-hidden shadow-sm ${isTarget ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
              >
                <CardHeader className="border-b bg-muted/30 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isLeaveItem ? (
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                        ) : item.entityType === 'appraisal' ? (
                          <Star className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                        )}
                        <CardTitle className="truncate text-base">{item.title}</CardTitle>
                        <Badge variant="outline">
                          {isLeaveItem ? 'Leave' : item.entityType === 'appraisal' ? 'Appraisal' : 'Payroll'}
                        </Badge>
                        {isUnassigned && (
                          <Badge variant="secondary">Unassigned</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                      {item.summary && (
                        <p className="text-sm text-muted-foreground">{item.summary}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">pending</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <p>Current step: {isUnassigned ? 'Unassigned shared queue' : item.currentApprovalStepName ?? 'Awaiting review'}</p>
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
                            {isUnassigned
                              ? 'Waiting for an HRMS approver to take this shared item'
                              : `Waiting for ${item.currentApproverRole ? 'assigned HRMS role' : 'assigned approver'}`}
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
