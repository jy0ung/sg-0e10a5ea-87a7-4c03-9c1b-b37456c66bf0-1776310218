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
import type { LeaveRequest, LeaveType, LeaveStatus, CreateLeaveRequestInput } from '@/types';
import { CheckCircle2, XCircle, Clock, Plus } from 'lucide-react';

const MANAGER_ROLES = ['super_admin', 'company_admin', 'general_manager', 'manager'] as const;
const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved:  'bg-green-100 text-green-700 border-green-200',
  rejected:  'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

function statusIcon(s: LeaveStatus) {
  if (s === 'approved') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === 'rejected') return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

export default function LeaveManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);

  const [requests, setRequests]     = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilterStatus] = useState<LeaveStatus | 'all'>('all');
  const [showApply, setShowApply]   = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');

  // Apply form
  const [applyForm, setApplyForm] = useState<Partial<CreateLeaveRequestInput>>({});

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const [reqRes, typeRes] = await Promise.all([
      listLeaveRequests(user.companyId, isManager ? undefined : { employeeId: user.id }),
      listLeaveTypes(user.companyId),
    ]);
    setRequests(reqRes.data);
    setLeaveTypes(typeRes.data);
    setLoading(false);
    if (reqRes.error) toast({ title: 'Error', description: reqRes.error, variant: 'destructive' });
  }, [user, isManager, toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !applyForm.leaveTypeId || !applyForm.startDate || !applyForm.endDate) return;
    const start = new Date(applyForm.startDate);
    const end   = new Date(applyForm.endDate);
    const days  = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    const { error } = await createLeaveRequest(user.id, user.companyId, {
      ...applyForm as CreateLeaveRequestInput,
      days,
    });
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Leave application submitted' });
    setShowApply(false);
    setApplyForm({});
    load();
  }

  async function handleReview() {
    if (!reviewingId || !user?.id) return;
    const { error } = await reviewLeaveRequest(reviewingId, user.id, reviewAction, reviewNote);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: `Request ${reviewAction}` });
    setReviewingId(null);
    setReviewNote('');
    load();
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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
        <Card><CardContent className="flex items-center justify-center h-32 text-muted-foreground">No requests found.</CardContent></Card>
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
                {isManager && req.status === 'pending' && (
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
