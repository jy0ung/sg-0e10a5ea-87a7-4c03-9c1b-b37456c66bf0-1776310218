import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  listAppraisals,
  createAppraisal,
  listAppraisalItems,
  reviewAppraisalActivation,
  resubmitAppraisalActivation,
  submitAppraisalSelfReview,
  reviewAppraisalItem,
  acknowledgeAppraisalItem,
  updateAppraisalItem,
  deleteAppraisalItem,
} from '@/services/hrmsService';
import type { Appraisal, AppraisalItem, AppraisalCycle, AppraisalStatus, UpdateAppraisalItemInput } from '@/types';
import { Plus, Eye, Star, CheckCircle2, ChevronDown, ChevronUp, Clock, RotateCcw, XCircle, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HRMS_MANAGER_ROLES } from '@/config/hrmsConfig';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';

const MANAGER_ROLES = HRMS_MANAGER_ROLES;

const STATUS_COLORS: Record<AppraisalStatus, string> = {
  open:        'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  completed:   'bg-green-100 text-green-700 border-green-200',
  archived:    'bg-gray-100 text-gray-500 border-gray-200',
};

const ITEM_STATUS_COLORS: Record<AppraisalItem['status'], string> = {
  pending:       'bg-gray-100 text-gray-600',
  self_reviewed: 'bg-blue-100 text-blue-700',
  reviewed:      'bg-yellow-100 text-yellow-700',
  acknowledged:  'bg-green-100 text-green-700',
};

function StarRating({ rating }: { rating?: number }) {
  if (!rating) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} />
      ))}
    </div>
  );
}

type AppraisalItemAction = 'self_review' | 'manager_review' | 'acknowledge';

type AppraisalItemActionState = {
  item: AppraisalItem;
  action: AppraisalItemAction;
} | null;

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <button key={i} type="button" onClick={() => onChange(i + 1)} className="focus:outline-none">
          <Star className={`h-5 w-5 ${i < value ? 'text-amber-400 fill-amber-400' : 'text-gray-300 fill-gray-300'} hover:text-amber-400 hover:fill-amber-400 transition-colors`} />
        </button>
      ))}
    </div>
  );
}

export default function PerformanceAppraisals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;

  const queryClient = useQueryClient();
  const { data: appraisals = [], isPending: loading } = useQuery({
    queryKey: ['appraisals', user?.companyId],
    queryFn: async () => {
      const res = await listAppraisals(user!.companyId, { includeApprovalHistory: true });
      if (res.error) toast({ title: 'Error', description: res.error, variant: 'destructive' });
      return res.data;
    },
    enabled: !!user?.companyId,
  });
  const [viewId, setViewId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reviewingAppraisalId, setReviewingAppraisalId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [itemActionTarget, setItemActionTarget] = useState<AppraisalItemActionState>(null);
  const [itemForm, setItemForm] = useState({
    goals: '',
    achievements: '',
    areasToImprove: '',
    reviewerComments: '',
    employeeComments: '',
    rating: '3',
  });
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    title: '', cycle: 'annual' as AppraisalCycle, periodStart: '', periodEnd: '',
  });

  // Item edit/delete state
  const [editItem, setEditItem]   = useState<AppraisalItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<AppraisalItem | null>(null);
  const [editForm, setEditForm]   = useState<UpdateAppraisalItemInput>({});
  const [savingItem, setSavingItem] = useState(false);

  const { data: rawItems = [] } = useQuery({
    queryKey: ['appraisal-items', viewId],
    queryFn: async () => { const { data } = await listAppraisalItems(viewId!); return data; },
    enabled: !!viewId,
  });
  const items = isManager || !user?.id
    ? rawItems
    : rawItems.filter(item => matchesCurrentEmployee(item.employeeId) || item.reviewerId === user.id);

  function matchesCurrentEmployee(subjectId?: string): boolean {
    if (!subjectId || !user?.id) return false;
    return subjectId === user.id || subjectId === selfServiceEmployeeId;
  }

  function canReviewAppraisal(appraisal: Appraisal): boolean {
    if (!isManager || !user || appraisal.status !== 'in_progress' || appraisal.approvalInstanceStatus !== 'pending') return false;
    if (appraisal.currentApproverUserId) return appraisal.currentApproverUserId === user.id;
    if (appraisal.currentApproverRole) return appraisal.currentApproverRole === user.role;
    return false;
  }

  function canResubmitAppraisal(appraisal: Appraisal): boolean {
    return Boolean(
      isManager
      && user
      && appraisal.status === 'in_progress'
      && appraisal.approvalInstanceStatus === 'rejected'
      && appraisal.createdBy === user.id,
    );
  }

  function toggleHistory(appraisalId: string) {
    setExpandedHistory(prev => ({ ...prev, [appraisalId]: !prev[appraisalId] }));
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
    const { error } = await createAppraisal(user.companyId, form, user.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Appraisal cycle created' });
    notifyApprovalInboxChanged();
    setShowCreate(false);
    setForm({ title: '', cycle: 'annual', periodStart: '', periodEnd: '' });
    void queryClient.invalidateQueries({ queryKey: ['appraisals', user?.companyId] });
  }

  async function handleReview() {
    if (!reviewingAppraisalId || !user?.id) return;
    const { error } = await reviewAppraisalActivation(reviewingAppraisalId, user.id, reviewAction, reviewNote);
    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: `Appraisal activation ${reviewAction}` });
    notifyApprovalInboxChanged();
    setReviewingAppraisalId(null);
    setReviewNote('');
    await queryClient.invalidateQueries({ queryKey: ['appraisals', user?.companyId] });
  }

  async function handleResubmit(appraisalId: string) {
    if (!user?.id) return;
    const { error } = await resubmitAppraisalActivation(appraisalId, user.id);
    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Appraisal activation resubmitted' });
    notifyApprovalInboxChanged();
    await queryClient.invalidateQueries({ queryKey: ['appraisals', user?.companyId] });
  }

  function handleView(id: string) {
    setViewId(id);
  }

  function resetItemAction() {
    setItemActionTarget(null);
    setItemForm({
      goals: '',
      achievements: '',
      areasToImprove: '',
      reviewerComments: '',
      employeeComments: '',
      rating: '3',
    });
  }

  function openItemAction(item: AppraisalItem, action: AppraisalItemAction) {
    setItemActionTarget({ item, action });
    setItemForm({
      goals: item.goals ?? '',
      achievements: item.achievements ?? '',
      areasToImprove: item.areasToImprove ?? '',
      reviewerComments: item.reviewerComments ?? '',
      employeeComments: item.employeeComments ?? '',
      rating: item.rating ? String(item.rating) : '3',
    });
  }

  function canSelfReviewItem(item: AppraisalItem): boolean {
    return Boolean(
      selfServiceEmployeeId
      && viewingAppraisal?.status === 'open'
      && matchesCurrentEmployee(item.employeeId)
      && ['pending', 'self_reviewed'].includes(item.status),
    );
  }

  function canManagerReviewItem(item: AppraisalItem): boolean {
    return Boolean(
      isManager
      && user?.id
      && viewingAppraisal?.status === 'open'
      && item.reviewerId === user.id
      && ['self_reviewed', 'reviewed'].includes(item.status),
    );
  }

  function canAcknowledgeItem(item: AppraisalItem): boolean {
    return Boolean(
      selfServiceEmployeeId
      && viewingAppraisal?.status === 'open'
      && matchesCurrentEmployee(item.employeeId)
      && item.status === 'reviewed',
    );
  }

  async function handleItemAction() {
    if (!itemActionTarget || !user?.id) return;

    const employeeActorId = selfServiceEmployeeId ?? user.id;

    const result = itemActionTarget.action === 'self_review'
      ? await submitAppraisalSelfReview(itemActionTarget.item.id, employeeActorId, {
        goals: itemForm.goals,
        achievements: itemForm.achievements,
        areasToImprove: itemForm.areasToImprove,
        employeeComments: itemForm.employeeComments,
      })
      : itemActionTarget.action === 'manager_review'
        ? await reviewAppraisalItem(itemActionTarget.item.id, user.id, {
          rating: Number(itemForm.rating),
          reviewerComments: itemForm.reviewerComments,
        })
        : await acknowledgeAppraisalItem(itemActionTarget.item.id, employeeActorId, itemForm.employeeComments);

    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      return;
    }

    toast({
      title: itemActionTarget.action === 'self_review'
        ? 'Self review submitted'
        : itemActionTarget.action === 'manager_review'
          ? 'Manager review submitted'
          : 'Appraisal acknowledged',
    });
    resetItemAction();
    await queryClient.invalidateQueries({ queryKey: ['appraisals', user?.companyId] });
    void queryClient.invalidateQueries({ queryKey: ['appraisal-items', viewId] });
  }

  function openEditItem(item: AppraisalItem) {
    setEditItem(item);
    setEditForm({
      rating: item.rating,
      goals: item.goals ?? undefined,
      achievements: item.achievements ?? undefined,
      areasToImprove: item.areasToImprove ?? undefined,
      reviewerComments: item.reviewerComments ?? undefined,
      employeeComments: item.employeeComments ?? undefined,
      status: item.status,
    });
  }

  async function handleSaveItem() {
    if (!editItem || !user?.id) return;
    setSavingItem(true);
    const { error } = await updateAppraisalItem(editItem.id, editForm, user.id);
    setSavingItem(false);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Review updated' });
    setEditItem(null);
    void queryClient.invalidateQueries({ queryKey: ['appraisal-items', viewId] });
  }

  async function handleDeleteItem() {
    if (!deleteItem || !user?.id) return;
    const { error } = await deleteAppraisalItem(deleteItem.id, user.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Review removed' });
    setDeleteItem(null);
    void queryClient.invalidateQueries({ queryKey: ['appraisal-items', viewId] });
  }

  const viewingAppraisal = appraisals.find(a => a.id === viewId);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Performance Appraisals"
        description="Manage appraisal cycles, self reviews, and manager feedback"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Appraisals' }]}
        actions={
          isManager ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Cycle
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : appraisals.length === 0 ? (
        <Card><CardContent className="flex items-center justify-center h-32 text-muted-foreground">No appraisal cycles yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {appraisals.map(a => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <p className="text-sm text-muted-foreground capitalize">
                      {a.cycle.replace('_', ' ')} · {a.periodStart} → {a.periodEnd}
                    </p>
                  </div>
                  <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLORS[a.status]}`}>
                    {a.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleView(a.id)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View Reviews
                </Button>
                {a.status === 'in_progress' && a.approvalInstanceStatus === 'pending' && (
                  <span className="text-xs text-muted-foreground">
                    Current step: {a.currentApprovalStepName ?? 'Activation pending'}
                  </span>
                )}
                {a.status === 'in_progress' && a.approvalInstanceStatus === 'rejected' && (
                  <span className="text-xs text-red-600">Activation was rejected.</span>
                )}
                {canReviewAppraisal(a) && (
                  <span className="text-xs font-medium text-primary">Assigned to you</span>
                )}
                {(a.approvalInstanceId || a.approvalHistory?.length) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleHistory(a.id)}
                  >
                    {expandedHistory[a.id] ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                    {expandedHistory[a.id] ? 'Hide Timeline' : 'Show Timeline'}
                  </Button>
                )}
                {canResubmitAppraisal(a) && (
                  <Button size="sm" variant="outline" className="text-amber-700 border-amber-300" onClick={() => handleResubmit(a.id)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Resubmit Activation
                  </Button>
                )}
                {canReviewAppraisal(a) && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-700 border-blue-300"
                      onClick={() => { setReviewingAppraisalId(a.id); setReviewAction('approved'); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve Activation
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 border-red-300"
                      onClick={() => { setReviewingAppraisalId(a.id); setReviewAction('rejected'); }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </>
                )}
                {expandedHistory[a.id] && (
                  <div className="w-full mt-1 space-y-3 border-l border-border pl-4">
                    {a.approvalHistory?.map(decision => {
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
                    {a.approvalInstanceStatus === 'pending' && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{a.currentApprovalStepName ?? 'Awaiting review'}</span>
                          <span>pending</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Waiting for {a.currentApproverRole ? a.currentApproverRole.replace(/_/g, ' ') : 'assigned approver'}
                        </p>
                      </div>
                    )}
                    {!a.approvalHistory?.length && a.approvalInstanceStatus !== 'pending' && (
                      <p className="text-sm text-muted-foreground">No approval decisions recorded.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Appraisal Cycle</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Annual Review 2025" />
            </div>
            <div className="space-y-2">
              <Label>Cycle</Label>
              <Select value={form.cycle} onValueChange={v => setForm(f => ({ ...f, cycle: v as AppraisalCycle }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['annual','mid_year','quarterly','probation'] as AppraisalCycle[]).map(c => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} required />
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
      <Dialog open={!!viewId} onOpenChange={v => { if (!v) setViewId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingAppraisal?.title ?? 'Reviews'}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Reviewed At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground h-20">No reviews assigned</TableCell>
                </TableRow>
              ) : items.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{item.employeeName ?? '—'}</TableCell>
                  <TableCell>{item.reviewerName ?? '—'}</TableCell>
                  <TableCell><StarRating rating={item.rating} /></TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`capitalize text-xs ${ITEM_STATUS_COLORS[item.status]}`}>
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground align-top">
                    <div className="space-y-1 whitespace-normal">
                      {item.goals && <p>Goals: {item.goals}</p>}
                      {item.achievements && <p>Achievements: {item.achievements}</p>}
                      {item.areasToImprove && <p>Improve: {item.areasToImprove}</p>}
                      {item.reviewerComments && <p>Manager: {item.reviewerComments}</p>}
                      {item.employeeComments && <p>Employee: {item.employeeComments}</p>}
                      {!item.goals && !item.achievements && !item.areasToImprove && !item.reviewerComments && !item.employeeComments && '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{item.reviewedAt ? item.reviewedAt.slice(0, 10) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {canSelfReviewItem(item) && (
                        <Button size="sm" variant="outline" onClick={() => openItemAction(item, 'self_review')}>
                          Self Review
                        </Button>
                      )}
                      {canManagerReviewItem(item) && (
                        <Button size="sm" variant="outline" onClick={() => openItemAction(item, 'manager_review')}>
                          Manager Review
                        </Button>
                      )}
                      {canAcknowledgeItem(item) && (
                        <Button size="sm" variant="outline" onClick={() => openItemAction(item, 'acknowledge')}>
                          Acknowledge
                        </Button>
                      )}
                      {isManager && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEditItem(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteItem(item)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {!canSelfReviewItem(item) && !canManagerReviewItem(item) && !canAcknowledgeItem(item) && !isManager && (
                        <span className="text-xs text-muted-foreground">No action</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog open={!!itemActionTarget} onOpenChange={open => { if (!open) resetItemAction(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {itemActionTarget?.action === 'self_review'
                ? 'Submit Self Review'
                : itemActionTarget?.action === 'manager_review'
                  ? 'Submit Manager Review'
                  : 'Acknowledge Review'}
            </DialogTitle>
          </DialogHeader>

          {itemActionTarget?.action === 'self_review' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Goals</Label>
                <Textarea value={itemForm.goals} onChange={e => setItemForm(f => ({ ...f, goals: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Achievements</Label>
                <Textarea value={itemForm.achievements} onChange={e => setItemForm(f => ({ ...f, achievements: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Areas To Improve</Label>
                <Textarea value={itemForm.areasToImprove} onChange={e => setItemForm(f => ({ ...f, areasToImprove: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Employee Comments</Label>
                <Textarea value={itemForm.employeeComments} onChange={e => setItemForm(f => ({ ...f, employeeComments: e.target.value }))} rows={3} />
              </div>
            </div>
          )}

          {itemActionTarget?.action === 'manager_review' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rating</Label>
                <Select value={itemForm.rating} onValueChange={value => setItemForm(f => ({ ...f, rating: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(value => (
                      <SelectItem key={value} value={String(value)}>{value} / 5</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reviewer Comments</Label>
                <Textarea value={itemForm.reviewerComments} onChange={e => setItemForm(f => ({ ...f, reviewerComments: e.target.value }))} rows={4} />
              </div>
            </div>
          )}

          {itemActionTarget?.action === 'acknowledge' && (
            <div className="space-y-4">
              {itemActionTarget.item.reviewerComments && (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {itemActionTarget.item.reviewerComments}
                </div>
              )}
              <div className="space-y-2">
                <Label>Employee Comments</Label>
                <Textarea value={itemForm.employeeComments} onChange={e => setItemForm(f => ({ ...f, employeeComments: e.target.value }))} rows={4} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={resetItemAction}>Cancel</Button>
            <Button onClick={handleItemAction}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewingAppraisalId} onOpenChange={v => {
        if (!v) {
          setReviewingAppraisalId(null);
          setReviewNote('');
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="capitalize">{reviewAction} Appraisal Activation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label htmlFor="appraisal-review-note" className="text-sm font-medium">Note (optional)</label>
            <Textarea
              id="appraisal-review-note"
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              rows={3}
              placeholder="Add a note for the cycle owner..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewingAppraisalId(null)}>Cancel</Button>
            <Button
              onClick={handleReview}
              className={reviewAction === 'approved' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}
            >
              Confirm {reviewAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit item dialog */}
      <Dialog open={!!editItem} onOpenChange={v => !v && setEditItem(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Review</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Rating</Label>
              <StarPicker value={editForm.rating ?? 0} onChange={v => setEditForm(f => ({ ...f, rating: v }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={editForm.status ?? 'pending'} onValueChange={v => setEditForm(f => ({ ...f, status: v as AppraisalItem['status'] }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['pending','self_reviewed','reviewed','acknowledged'] as AppraisalItem['status'][]).map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Goals</Label>
              <Textarea rows={2} value={editForm.goals ?? ''} onChange={e => setEditForm(f => ({ ...f, goals: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Achievements</Label>
              <Textarea rows={2} value={editForm.achievements ?? ''} onChange={e => setEditForm(f => ({ ...f, achievements: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Areas to Improve</Label>
              <Textarea rows={2} value={editForm.areasToImprove ?? ''} onChange={e => setEditForm(f => ({ ...f, areasToImprove: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Reviewer Comments</Label>
              <Textarea rows={2} value={editForm.reviewerComments ?? ''} onChange={e => setEditForm(f => ({ ...f, reviewerComments: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Employee Comments</Label>
              <Textarea rows={2} value={editForm.employeeComments ?? ''} onChange={e => setEditForm(f => ({ ...f, employeeComments: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleSaveItem} disabled={savingItem}>{savingItem ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete item confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={v => !v && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Review</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the review for <strong>{deleteItem?.employeeName ?? 'this employee'}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
