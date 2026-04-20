import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { listAppraisals, createAppraisal, listAppraisalItems } from '@/services/hrmsService';
import type { Appraisal, AppraisalItem, AppraisalCycle, AppraisalStatus } from '@/types';
import { Plus, Eye, Star } from 'lucide-react';
import { HRMS_MANAGER_ROLES } from '@/config/hrmsConfig';

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

export default function PerformanceAppraisals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);

  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [items, setItems]           = useState<AppraisalItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [viewId, setViewId]         = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState({
    title: '', cycle: 'annual' as AppraisalCycle, periodStart: '', periodEnd: '',
  });

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const res = await listAppraisals(user.companyId);
    setAppraisals(res.data);
    setLoading(false);
    if (res.error) toast({ title: 'Error', description: res.error, variant: 'destructive' });
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !user.id) return;
    const { error } = await createAppraisal(user.companyId, form, user.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Appraisal cycle created' });
    setShowCreate(false);
    setForm({ title: '', cycle: 'annual', periodStart: '', periodEnd: '' });
    load();
  }

  async function handleView(id: string) {
    const { data, error } = await listAppraisalItems(id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    setItems(data);
    setViewId(id);
  }

  const viewingAppraisal = appraisals.find(a => a.id === viewId);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Performance Appraisals"
        description="Manage employee performance reviews"
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
              <CardContent className="pt-0">
                <Button size="sm" variant="outline" onClick={() => handleView(a.id)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View Reviews
                </Button>
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
                <TableHead>Reviewed At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground h-20">No reviews assigned</TableCell>
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
                  <TableCell className="text-muted-foreground text-xs">{item.reviewedAt ? item.reviewedAt.slice(0, 10) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
