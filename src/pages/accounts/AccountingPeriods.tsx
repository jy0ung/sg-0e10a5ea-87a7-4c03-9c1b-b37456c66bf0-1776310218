import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import {
  listAccountingPeriods,
  createAccountingPeriod,
  closeAccountingPeriod,
  lockAccountingPeriod,
} from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { Plus, Lock, CheckCircle, Calendar } from 'lucide-react';
import type { AccountingPeriod, AccountingPeriodStatus } from '@/types';

const STATUS_BADGE: Record<AccountingPeriodStatus, string> = {
  open:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  closed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  locked: 'bg-secondary text-secondary-foreground',
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const EMPTY_FORM = {
  name:        '',
  periodYear:  new Date().getFullYear(),
  periodMonth: new Date().getMonth() + 1,
  startDate:   '',
  endDate:     '',
};

export default function AccountingPeriods() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canWrite = hasRole(['super_admin', 'company_admin', 'accounts']);

  const [addOpen, setAddOpen]         = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [actionTarget, setTarget]     = useState<AccountingPeriod | null>(null);
  const [actionType, setActionType]   = useState<'close' | 'lock' | null>(null);
  const [actioning, setActioning]     = useState(false);

  const {
    data: periods = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['accounting_periods', companyId],
    queryFn: async () => {
      const r = await listAccountingPeriods(companyId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  async function handleCreate() {
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      toast({ title: 'Name, start date, and end date are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error: err } = await createAccountingPeriod(companyId, {
      name:        form.name.trim(),
      periodYear:  form.periodYear,
      periodMonth: form.periodMonth,
      startDate:   form.startDate,
      endDate:     form.endDate,
    });
    setSaving(false);
    if (err) {
      toast({ title: 'Failed to create period', description: err.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Period created' });
    setAddOpen(false);
    setForm(EMPTY_FORM);
    queryClient.invalidateQueries({ queryKey: ['accounting_periods', companyId] });
  }

  async function handleAction() {
    if (!actionTarget || !actionType) return;
    setActioning(true);
    const result = actionType === 'close'
      ? await closeAccountingPeriod(actionTarget.id)
      : await lockAccountingPeriod(actionTarget.id);
    setActioning(false);
    if (result.error) {
      toast({ title: `Failed to ${actionType} period`, description: result.error.message, variant: 'destructive' });
    } else {
      toast({ title: `Period ${actionType === 'close' ? 'closed' : 'locked'}` });
      queryClient.invalidateQueries({ queryKey: ['accounting_periods', companyId] });
    }
    setTarget(null);
    setActionType(null);
  }

  if (isLoading) return <TableSkeleton />;
  if (isError)   return <PageErrorState error={error} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Accounting Periods"
        description="Manage fiscal periods — open, close, and lock for month-end finalization"
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts', path: '/accounts/periods' },
          { label: 'Accounting Periods' },
        ]}
        actions={canWrite ? (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Period
          </Button>
        ) : undefined}
      />

      <ScrollableRegion label="Accounting periods list">
        {periods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Calendar className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">No accounting periods yet.</p>
            {canWrite && (
              <Button variant="link" className="mt-2" onClick={() => setAddOpen(true)}>
                Create the first period
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Period</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Dates</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  {canWrite && (
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{period.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {MONTH_NAMES[period.periodMonth]} {period.periodYear}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {period.startDate} → {period.endDate}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[period.status]}`}>
                        {period.status}
                      </span>
                      {period.closedAt && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {new Date(period.closedAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right space-x-2">
                        {period.status === 'open' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setTarget(period); setActionType('close'); }}
                          >
                            <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Close
                          </Button>
                        )}
                        {period.status === 'closed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setTarget(period); setActionType('lock'); }}
                          >
                            <Lock className="mr-1.5 h-3.5 w-3.5" /> Lock
                          </Button>
                        )}
                        {period.status === 'locked' && (
                          <Badge variant="secondary" className="text-xs">locked</Badge>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ScrollableRegion>

      {/* Create Period Dialog */}
      <Dialog open={addOpen} onOpenChange={open => { if (!saving) { setAddOpen(open); if (!open) setForm(EMPTY_FORM); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Accounting Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Period Name</Label>
              <Input
                id="p-name"
                placeholder="e.g. May 2026"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-year">Year</Label>
                <Input
                  id="p-year"
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.periodYear}
                  onChange={e => setForm(f => ({ ...f, periodYear: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-month">Month</Label>
                <Input
                  id="p-month"
                  type="number"
                  min={1}
                  max={12}
                  value={form.periodMonth}
                  onChange={e => setForm(f => ({ ...f, periodMonth: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-start">Start Date</Label>
                <Input
                  id="p-start"
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-end">End Date</Label>
                <Input
                  id="p-end"
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close / Lock Confirm Dialog */}
      <AlertDialog
        open={!!actionTarget && !!actionType}
        onOpenChange={open => { if (!open && !actioning) { setTarget(null); setActionType(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'close' ? 'Close Period?' : 'Lock Period?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'close' ? (
                <>
                  Closing <strong>{actionTarget?.name}</strong> will mark it as closed.
                  Ensure all journal entries for this period are posted before closing.
                  You can still lock the period after reviewing.
                </>
              ) : (
                <>
                  Locking <strong>{actionTarget?.name}</strong> is permanent. No further
                  journal entries can be posted to a locked period.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={actioning}>
              {actioning ? 'Working…' : actionType === 'close' ? 'Close Period' : 'Lock Period'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
