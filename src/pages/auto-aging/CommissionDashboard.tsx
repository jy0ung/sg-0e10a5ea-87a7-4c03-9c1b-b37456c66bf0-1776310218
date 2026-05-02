import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';
import {
  getCommissionRules, createCommissionRule, updateCommissionRule, deleteCommissionRule,
  getCommissionRecords, updateCommissionRecordStatus,
} from '@/services/commissionService';
import type { CommissionRule, CommissionRecord } from '@/types';
import { Plus, Pencil, Trash2, Check, Loader2, DollarSign, TrendingUp } from 'lucide-react';

const PERIODS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});

const STATUS_COLORS: Record<CommissionRecord['status'], string> = {
  pending: 'bg-secondary text-muted-foreground',
  approved: 'bg-warning/15 text-warning',
  paid: 'bg-success/15 text-success',
};

export default function CommissionDashboard() {
  const { user } = useAuth();
  const { vehicles } = useData();
  const { toast } = useToast();
  const companyId = useCompanyId();
  const canManage = ['super_admin', 'company_admin', 'director', 'general_manager'].includes(user?.role ?? '');

  const queryClient = useQueryClient();

  const [periodFilter, setPeriodFilter] = useState(PERIODS[0]);
  const [salesmanFilter, setSalesmanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<Partial<CommissionRule>>({});

  const { data: rules = [], isPending: loadingRules } = useQuery({
    queryKey: ['commission-rules', companyId],
    queryFn: async () => { const r = await getCommissionRules(companyId); return r.data; },
    enabled: !!companyId,
  });
  const { data: records = [], isPending: loadingRecords } = useQuery({
    queryKey: ['commission-records', companyId, periodFilter],
    queryFn: async () => { const r = await getCommissionRecords(companyId, { period: periodFilter }); return r.data; },
    enabled: !!companyId,
  });
  const loading = loadingRules || loadingRecords;

  const salesmen = [...new Set(vehicles.map(v => v.salesman_name))].sort();
  const branches = [...new Set(vehicles.map(v => v.branch_code))].sort();

  const filteredRecords = records.filter(r => {
    if (salesmanFilter !== 'all' && r.salesmanName !== salesmanFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const totalAmt = filteredRecords.reduce((s, r) => s + r.amount, 0);

  // ─── Rule CRUD ───────────────────────────────────────────────────────────────
  const openNewRule = () => {
    setEditingRule(null);
    setRuleForm({ companyId });
    setRuleDialogOpen(true);
  };

  const openEditRule = (rule: CommissionRule) => {
    setEditingRule(rule);
    setRuleForm(rule);
    setRuleDialogOpen(true);
  };

  const handleSaveRule = async () => {
    if (!ruleForm.ruleName || ruleForm.amount === undefined) return;
    if (editingRule) {
      const { error } = await updateCommissionRule(companyId, editingRule.id, ruleForm);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Rule updated' });
    } else {
      const { error } = await createCommissionRule({ ...ruleForm, companyId } as Omit<CommissionRule, 'id'>);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Rule created' });
    }
    setRuleDialogOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['commission-rules', companyId] });
  };

  const handleDeleteRule = async () => {
    if (!deleteRuleId) return;
    const { error } = await deleteCommissionRule(companyId, deleteRuleId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Rule deleted' });
    setDeleteRuleId(null);
    await queryClient.invalidateQueries({ queryKey: ['commission-rules', companyId] });
  };

  const handleStatusChange = async (recordId: string, status: CommissionRecord['status']) => {
    const { error } = await updateCommissionRecordStatus(companyId, recordId, status);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    void queryClient.invalidateQueries({ queryKey: ['commission-records', companyId, periodFilter] });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Commission Dashboard"
        description="Manage commission rules and track incentive payouts per salesman"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Commissions' }]}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Pending', value: records.filter(r => r.status === 'pending').length, icon: DollarSign, color: 'text-muted-foreground' },
          { label: 'Total Approved', value: records.filter(r => r.status === 'approved').length, icon: Check, color: 'text-warning' },
          { label: 'Total Paid', value: records.filter(r => r.status === 'paid').length, icon: Check, color: 'text-success' },
          { label: `Amount (${periodFilter})`, value: `MYR ${totalAmt.toLocaleString()}`, icon: TrendingUp, color: 'text-primary' },
        ].map(card => (
          <div key={card.label} className="glass-panel p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Commission Rules */}
      <div className="glass-panel overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Commission Rules</h3>
            <p className="text-xs text-muted-foreground">Rules applied to vehicles in each period</p>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={openNewRule}>
              <Plus className="h-3.5 w-3.5 mr-1" />New Rule
            </Button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : rules.length === 0 ? (
          <p className="text-center py-8 text-xs text-muted-foreground">No commission rules configured.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Rule Name</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Salesman</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Branch</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Threshold (days)</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Amount (MYR)</th>
                {canManage && <th className="px-4 py-2 w-20" />}
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="data-table-row">
                  <td className="px-4 py-2 font-medium">{rule.ruleName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{rule.salesmanName ?? 'All'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{rule.branchCode ?? 'All'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{rule.thresholdDays ?? '—'}</td>
                  <td className="px-4 py-2 font-semibold">{rule.amount.toLocaleString()}</td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditRule(rule)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteRuleId(rule.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Commission Records */}
      <div className="glass-panel overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold">Commission Records</h3>
            <p className="text-xs text-muted-foreground">{filteredRecords.length} record(s)</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={salesmanFilter} onValueChange={setSalesmanFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All Salesmen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Salesmen</SelectItem>
                {salesmen.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {filteredRecords.length === 0 ? (
          <p className="text-center py-8 text-xs text-muted-foreground">No commission records for this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Chassis</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Salesman</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Rule</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Amount (MYR)</th>
                <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Status</th>
                {canManage && <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(rec => (
                <tr key={rec.id} className="data-table-row">
                  <td className="px-4 py-2 font-mono text-xs">{rec.chassisNo}</td>
                  <td className="px-4 py-2">{rec.salesmanName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{rec.ruleName ?? '—'}</td>
                  <td className="px-4 py-2 font-semibold">{rec.amount.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <Badge className={`${STATUS_COLORS[rec.status]} border-0 capitalize`}>{rec.status}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2">
                      {rec.status === 'pending' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusChange(rec.id, 'approved')}>Approve</Button>
                      )}
                      {rec.status === 'approved' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-success" onClick={() => handleStatusChange(rec.id, 'paid')}>Mark Paid</Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Commission Rule' : 'New Commission Rule'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-1">
              <label htmlFor="commission-rule-name" className="text-xs text-muted-foreground">Rule Name *</label>
              <Input id="commission-rule-name" value={ruleForm.ruleName ?? ''} onChange={e => setRuleForm(f => ({ ...f, ruleName: e.target.value }))} placeholder="e.g. Fast Delivery Bonus" />
            </div>
            <div className="space-y-1">
              <label htmlFor="commission-rule-salesman" className="text-xs text-muted-foreground">Salesman (leave blank for all)</label>
              <Select value={ruleForm.salesmanName ?? '_all'} onValueChange={v => setRuleForm(f => ({ ...f, salesmanName: v === '_all' ? undefined : v }))}>
                <SelectTrigger id="commission-rule-salesman"><SelectValue placeholder="All salesmen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All salesmen</SelectItem>
                  {salesmen.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="commission-rule-branch" className="text-xs text-muted-foreground">Branch (leave blank for all)</label>
              <Select value={ruleForm.branchCode ?? '_all'} onValueChange={v => setRuleForm(f => ({ ...f, branchCode: v === '_all' ? undefined : v }))}>
                <SelectTrigger id="commission-rule-branch"><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All branches</SelectItem>
                  {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="commission-rule-threshold" className="text-xs text-muted-foreground">Threshold Days (BG→Delivery ≤ N days)</label>
              <Input id="commission-rule-threshold" type="number" value={ruleForm.thresholdDays ?? ''} onChange={e => setRuleForm(f => ({ ...f, thresholdDays: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <label htmlFor="commission-rule-amount" className="text-xs text-muted-foreground">Commission Amount (MYR) *</label>
              <Input id="commission-rule-amount" type="number" value={ruleForm.amount ?? ''} onChange={e => setRuleForm(f => ({ ...f, amount: Number(e.target.value) }))} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRule} disabled={!ruleForm.ruleName || ruleForm.amount === undefined}>
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={v => { if (!v) setDeleteRuleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this commission rule?</AlertDialogTitle>
            <AlertDialogDescription>This will not delete existing commission records linked to this rule.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRule} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
