import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  listLeaveRequests,
  listLeaveTypes,
  createLeaveRequest,
  reviewLeaveRequest,
} from '@/services/hrmsService';
import type { LeaveRequest, LeaveStatus, CreateLeaveRequestInput } from '@/types';
import { CheckCircle2, XCircle, Clock, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { HRMS_LEAVE_APPROVER_ROLES } from '@/config/hrmsConfig';
import { createLeaveRequestSchema } from '@/lib/validations';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';
import {
  getPendingApprovalsForUser,
  submitApprovalDecision,
} from '@/services/approvalEngineService';

const MANAGER_ROLES = HRMS_LEAVE_APPROVER_ROLES;
const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved:  'bg-green-100 text-green-700 border-green-200',
  rejected:  'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

export type LeaveApproverIdentity = {
  id?: string;
  role?: string;
} | null | undefined;

// eslint-disable-next-line react-refresh/only-export-components
export function isRequestAssignedToApprover(
  request: LeaveRequest,
  approver: LeaveApproverIdentity,
  isManager: boolean,
): boolean {
  if (request.status !== 'pending' || !approver) return false;
  if (request.currentApproverUserId) return request.currentApproverUserId === approver.id;
  if (request.currentApproverRole) return request.currentApproverRole === approver.role;
  return isManager;
}

// eslint-disable-next-line react-refresh/only-export-components
export function filterLeaveRequestsForView(
  requests: LeaveRequest[],
  filterStatus: LeaveStatus | 'all',
  viewMode: 'all' | 'my_queue',
  approver: LeaveApproverIdentity,
  isManager: boolean,
): LeaveRequest[] {
  const filteredByStatus = filterStatus === 'all'
    ? requests
    : requests.filter(request => request.status === filterStatus);

  return viewMode === 'my_queue'
    ? filteredByStatus.filter(request => isRequestAssignedToApprover(request, approver, isManager))
    : filteredByStatus;
}

function statusIcon(s: LeaveStatus) {
  if (s === 'approved') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === 'rejected') return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

export default function LeaveManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;

  const queryClient = useQueryClient();

  const { data: leaveData, isPending: loading } = useQuery({
    queryKey: ['leave-management', user?.companyId, user?.id, isManager, selfServiceEmployeeId],
    queryFn: async () => {
      const [reqRes, typeRes, approvalsRes] = await Promise.all([
        listLeaveRequests(user!.companyId, isManager
          ? { includeApprovalHistory: true }
          : { employeeId: selfServiceEmployeeId, includeApprovalHistory: true }),
        listLeaveTypes(user!.companyId),
        isManager ? getPendingApprovalsForUser(user!.companyId, user!.id) : Promise.resolve({ data: [], error: null }),
      ]);
      if (reqRes.error) toast({ title: 'Error', description: reqRes.error, variant: 'destructive' });
      return { requests: reqRes.data, leaveTypes: typeRes.data, pendingApprovals: approvalsRes.data };
    },
    enabled: !!user?.companyId && (!!(isManager) || !!selfServiceEmployeeId),
  });
  const requests       = leaveData?.requests       ?? [];
  const leaveTypes     = leaveData?.leaveTypes     ?? [];
  const pendingApprovals = leaveData?.pendingApprovals ?? [];

  const [filterStatus, setFilterStatus] = useState<LeaveStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'all' | 'my_queue'>('all');
  const [showApply, setShowApply]   = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // Approval engine queue
  const [approvalsExpanded, setApprovalsExpanded] = useState(true);
  // When a pending approval is being acted on, track the approval_request id
  const [reviewingApprovalId, setReviewingApprovalId] = useState<string | null>(null);

  // Apply form
  const [applyForm, setApplyForm] = useState<Partial<CreateLeaveRequestInput>>({})

  function canReviewRequest(request: LeaveRequest): boolean {
    return isRequestAssignedToApprover(request, user, isManager);
  }

  const myQueueCount = requests.filter(req => canReviewRequest(req)).length;
  const companyPendingCount = requests.filter(req => req.status === 'pending').length;
  const filtered = filterLeaveRequestsForView(requests, filterStatus, viewMode, user, isManager);

  function toggleHistory(requestId: string) {
    setExpandedHistory(prev => ({ ...prev, [requestId]: !prev[requestId] }));
  }

  function formatTimelineTimestamp(value?: string) {
    if (!value) return 'Unknown time';
    try {
      return format(parseISO(value), 'dd MMM yyyy, h:mm a');
    } catch {
      return value;
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !selfServiceEmployeeId) return;
    const result = createLeaveRequestSchema.safeParse(applyForm);
    if (!result.success) {
      toast({ title: 'Validation error', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }
    const days = differenceInCalendarDays(
      parseISO(applyForm.endDate!),
      parseISO(applyForm.startDate!),
    ) + 1;
    const { error } = await createLeaveRequest(selfServiceEmployeeId, user.companyId, {
      ...applyForm as CreateLeaveRequestInput,
      days,
    });
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Leave application submitted' });
    setShowApply(false);
    setApplyForm({});
    void queryClient.invalidateQueries({ queryKey: ['leave-management', user?.companyId] });
  }

  async function handleReview() {
    if (!user?.id) return;
    let error: string | null = null;
    if (reviewingApprovalId) {
      // Route through approval engine
      ({ error } = await submitApprovalDecision(reviewingApprovalId, user.id, reviewAction, reviewNote));
    } else if (reviewingId) {
      // Direct review (no workflow configured)
      ({ error } = await reviewLeaveRequest(reviewingId, user.id, reviewAction, reviewNote));
    }
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: `Request ${reviewAction}` });
    notifyApprovalInboxChanged();
    setReviewingId(null);
    setReviewingApprovalId(null);
    setReviewNote('');
    void queryClient.invalidateQueries({ queryKey: ['leave-management', user?.companyId] });
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leave Management"
        description="Apply for leave and manage approvals"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Leave Management' }]}
        actions={
          <Button size="sm" onClick={() => setShowApply(true)}>
            <Plus className="h-4 w-4 mr-1" /> Apply Leave
          </Button>
        }
      />

      {/* Pending approvals queue (managers only) */}
      {isManager && pendingApprovals.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Clock className="h-4 w-4" />
                Awaiting My Approval ({pendingApprovals.length})
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setApprovalsExpanded(v => !v)}>
                {approvalsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {approvalsExpanded && (
            <CardContent className="pt-0 space-y-3">
              {pendingApprovals.map(pa => (
                <div key={pa.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <div className="text-sm space-y-0.5">
                    <p className="font-medium">{pa.requesterName ?? pa.requesterId}</p>
                    {pa.leaveRequest && (
                      <p className="text-muted-foreground">
                        {pa.leaveRequest.leaveTypeName} · {pa.leaveRequest.days}d
                        &nbsp;({pa.leaveRequest.startDate} – {pa.leaveRequest.endDate})
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Step: {pa.currentStepName} · Flow: {pa.flowName}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm" variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50 h-7 px-2"
                      onClick={() => {
                        setReviewingApprovalId(pa.id);
                        setReviewingId(pa.entityId);
                        setReviewAction('approved');
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="text-red-700 border-red-300 hover:bg-red-50 h-7 px-2"
                      onClick={() => {
                        setReviewingApprovalId(pa.id);
                        setReviewingId(pa.entityId);
                        setReviewAction('rejected');
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {isManager && (
          <>
            <Button
              variant={viewMode === 'my_queue' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('my_queue')}
            >
              My Queue ({myQueueCount})
            </Button>
            <Button
              variant={viewMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('all')}
            >
              All Requests ({requests.length})
            </Button>
            <span className="text-xs text-muted-foreground">Pending company-wide: {companyPendingCount}</span>
          </>
        )}
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(s => (
          <Button
            key={s}
            variant={filterStatus === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
      </div>

      {/* Requests list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-32 text-muted-foreground">
            {viewMode === 'my_queue' ? 'No approvals are currently assigned to you.' : 'No requests found.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <Card key={req.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{req.employeeName ?? 'You'}</CardTitle>
                    <p className="text-sm text-muted-foreground">{req.leaveTypeName} · {req.days} day(s)</p>
                  </div>
                  <Badge className={`flex items-center gap-1 text-xs capitalize ${STATUS_COLORS[req.status]}`} variant="outline">
                    {statusIcon(req.status)} {req.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Period: </span>
                  {req.startDate} → {req.endDate}
                </p>
                {req.reason && (
                  <p className="text-sm"><span className="text-muted-foreground">Reason: </span>{req.reason}</p>
                )}
                {req.reviewerNote && (
                  <p className="text-sm"><span className="text-muted-foreground">Note: </span>{req.reviewerNote}</p>
                )}
                {req.status === 'pending' && (
                  <p className="text-sm text-muted-foreground">
                    Current step: {req.currentApprovalStepName ?? 'Manager review'}
                  </p>
                )}
                {canReviewRequest(req) && (
                  <p className="text-xs font-medium text-primary">Assigned to you</p>
                )}
                {(req.approvalInstanceId || req.approvalHistory?.length) && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => toggleHistory(req.id)}
                    >
                      {expandedHistory[req.id] ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      {expandedHistory[req.id] ? 'Hide Timeline' : 'Show Timeline'}
                    </Button>
                  </div>
                )}
                {expandedHistory[req.id] && (
                  <div className="mt-3 space-y-3 border-l border-border pl-4">
                    {req.approvalHistory?.map(decision => {
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
                    {req.status === 'pending' && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{req.currentApprovalStepName ?? 'Awaiting review'}</span>
                          <span>pending</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Waiting for {req.currentApproverRole ? req.currentApproverRole.replace(/_/g, ' ') : 'assigned approver'}
                        </p>
                      </div>
                    )}
                    {!req.approvalHistory?.length && req.status !== 'pending' && (
                      <p className="text-sm text-muted-foreground">No approval decisions recorded.</p>
                    )}
                  </div>
                )}
                {canReviewRequest(req) && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm" variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => { setReviewingId(req.id); setReviewAction('approved'); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="text-red-700 border-red-300 hover:bg-red-50"
                      onClick={() => { setReviewingId(req.id); setReviewAction('rejected'); }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Apply leave dialog */}
      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
          <form onSubmit={handleApply} className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select
                value={applyForm.leaveTypeId ?? ''}
                onValueChange={v => setApplyForm(f => ({ ...f, leaveTypeId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.daysPerYear}d/yr)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={applyForm.startDate ?? ''} onChange={e => setApplyForm(f => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={applyForm.endDate ?? ''} onChange={e => setApplyForm(f => ({ ...f, endDate: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea value={applyForm.reason ?? ''} onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowApply(false)}>Cancel</Button>
              <Button type="submit">Submit</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={!!reviewingId} onOpenChange={v => { if (!v) setReviewingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="capitalize">{reviewAction} Leave Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Note (optional)</Label>
            <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3} placeholder="Leave a note for the employee..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewingId(null)}>Cancel</Button>
            <Button
              onClick={handleReview}
              className={reviewAction === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              Confirm {reviewAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
