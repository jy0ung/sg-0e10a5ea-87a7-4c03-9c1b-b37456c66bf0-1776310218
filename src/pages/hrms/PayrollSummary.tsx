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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  listPayrollRuns,
  createPayrollRun,
  updatePayrollRunStatus,
  listPayrollItems,
} from '@/services/hrmsService';
import type { PayrollRun, PayrollItem, PayrollRunStatus } from '@/types';
import { Plus, Eye, CheckCircle2, CreditCard } from 'lucide-react';

const MANAGER_ROLES = ['super_admin', 'company_admin', 'general_manager'] as const;

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

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const res = await listPayrollRuns(user.companyId);
    setRuns(res.data);
    setLoading(false);
    if (res.error) toast({ title: 'Error', description: res.error, variant: 'destructive' });
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

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
    const { error } = await updatePayrollRunStatus(runId, status);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: `Status updated to ${status}` });
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
                {isManager && run.status === 'draft' && (
                  <Button size="sm" variant="outline" className="text-blue-700 border-blue-300" onClick={() => handleStatusChange(run.id, 'finalised')}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Finalise
                  </Button>
                )}
                {isManager && run.status === 'finalised' && (
                  <Button size="sm" variant="outline" className="text-green-700 border-green-300" onClick={() => handleStatusChange(run.id, 'paid')}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Mark Paid
                  </Button>
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
    </div>
  );
}
