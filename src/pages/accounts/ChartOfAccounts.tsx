import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { listAccounts, createGlAccount } from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { Plus } from 'lucide-react';
import type { GlAccountType } from '@/types';

const ACCOUNT_TYPES: GlAccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const TYPE_LABELS: Record<GlAccountType, string> = {
  asset:     'Assets',
  liability: 'Liabilities',
  equity:    'Equity',
  revenue:   'Revenue',
  expense:   'Expenses',
};

const TYPE_BADGE: Record<GlAccountType, string> = {
  asset:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  liability: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  equity:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  revenue:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  expense:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const EMPTY_FORM = { code: '', name: '', type: 'asset' as GlAccountType, description: '' };

export default function ChartOfAccounts() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canWrite = hasRole(['super_admin', 'company_admin', 'accounts']);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);

  const {
    data: accounts = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['gl_accounts', companyId],
    queryFn: async () => {
      const r = await listAccounts(companyId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const grouped = ACCOUNT_TYPES.reduce<Record<GlAccountType, typeof accounts>>(
    (acc, t) => { acc[t] = accounts.filter(a => a.type === t); return acc; },
    { asset: [], liability: [], equity: [], revenue: [], expense: [] },
  );

  async function handleAdd() {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: 'Code and name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error: err } = await createGlAccount(companyId, {
      code:        form.code.trim(),
      name:        form.name.trim(),
      type:        form.type,
      description: form.description.trim() || undefined,
    });
    setSaving(false);
    if (err) {
      toast({ title: 'Failed to create account', description: err.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Account created' });
    setAddOpen(false);
    setForm(EMPTY_FORM);
    queryClient.invalidateQueries({ queryKey: ['gl_accounts', companyId] });
  }

  if (isLoading) return <TableSkeleton />;
  if (isError)   return <PageErrorState message={String(error)} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Chart of Accounts"
        description="Manage accounts grouped by type"
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts', path: '/accounts/chart' },
          { label: 'Chart of Accounts' },
        ]}
        actions={canWrite ? (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Account
          </Button>
        ) : undefined}
      />

      <ScrollableRegion>
        <div className="space-y-8">
          {ACCOUNT_TYPES.map(type => {
            const rows = grouped[type];
            return (
              <div key={type}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[type]}`}>
                    {TYPE_LABELS[type]}
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">({rows.length})</span>
                </h3>

                {rows.length === 0 ? (
                  <p className="pl-2 text-sm text-muted-foreground">No accounts</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground w-24">Code</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground w-20">Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(acct => (
                          <tr key={acct.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-xs">{acct.code}</td>
                            <td className="px-4 py-2.5 font-medium">{acct.name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell text-xs">
                              {acct.description ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {acct.isSystem && (
                                <Badge variant="secondary" className="text-[10px]">system</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollableRegion>

      {/* Add Account Dialog */}
      <Dialog open={addOpen} onOpenChange={open => { if (!saving) { setAddOpen(open); if (!open) setForm(EMPTY_FORM); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="acc-code">Code</Label>
                <Input
                  id="acc-code"
                  placeholder="e.g. 1010"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-type">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as GlAccountType }))}>
                  <SelectTrigger id="acc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Name</Label>
              <Input
                id="acc-name"
                placeholder="Account name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-desc">Description (optional)</Label>
              <Input
                id="acc-desc"
                placeholder="Brief description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving…' : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
