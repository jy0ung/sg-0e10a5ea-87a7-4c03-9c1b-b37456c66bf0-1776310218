import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Search, Plus, UserCheck } from 'lucide-react';

type SAStatus = 'active' | 'resigned' | 'inactive';

interface SalesAdvisor {
  id: string;
  code: string;
  name: string;
  ic: string;
  email: string;
  contact: string;
  branch: string;
  joinDate: string;
  resignDate?: string;
  status: SAStatus;
}

const STATUS_BADGE: Record<SAStatus, string> = {
  active:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  inactive: 'bg-secondary text-secondary-foreground',
  resigned: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const EMPTY_FORM = { code: '', name: '', ic: '', email: '', contact: '', branch: '', joinDate: new Date().toISOString().split('T')[0] };

export default function SalesAdvisors() {
  const { user } = useAuth();
  const { vehicles } = useData();
  const { toast } = useToast();

  const [advisors, setAdvisors]   = useState<SalesAdvisor[]>(() => {
    // Pre-populate from salesman names found in vehicle data
    const seen = new Set<string>();
    const initial: SalesAdvisor[] = [];
    vehicles.forEach(v => {
      if (!v.salesman_name || seen.has(v.salesman_name)) return;
      seen.add(v.salesman_name);
      initial.push({
        id: `sa-${seen.size}`,
        code: `SA${String(seen.size).padStart(3, '0')}`,
        name: v.salesman_name,
        ic: '—',
        email: '—',
        contact: '—',
        branch: v.branch_code ?? '—',
        joinDate: '—',
        status: 'active',
      });
    });
    return initial;
  });

  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState<string>('all');
  const [branchFilter, setBranch]   = useState('all');
  const [addOpen, setAddOpen]       = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  const branches = [...new Set(vehicles.map(v => v.branch_code).filter(Boolean))].sort() as string[];

  const filtered = advisors.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (branchFilter !== 'all' && a.branch !== branchFilter) return false;
    const q = search.toLowerCase();
    return !q || [a.code, a.name, a.email, a.branch].join(' ').toLowerCase().includes(q);
  });

  const handleCreate = () => {
    if (!form.code || !form.name || !form.branch) {
      return toast({ title: 'Code, Name, and Branch are required', variant: 'destructive' });
    }
    if (advisors.some(a => a.code === form.code)) {
      return toast({ title: 'SA Code already exists', variant: 'destructive' });
    }
    setSaving(true);
    const sa: SalesAdvisor = {
      id: `sa-${Date.now()}`,
      code: form.code.toUpperCase(),
      name: form.name,
      ic: form.ic || '—',
      email: form.email || '—',
      contact: form.contact || '—',
      branch: form.branch,
      joinDate: form.joinDate,
      status: 'active',
    };
    setAdvisors(prev => [sa, ...prev]);
    setForm(EMPTY_FORM);
    setAddOpen(false);
    setSaving(false);
    toast({ title: 'Sales Advisor created', description: `${sa.code} — ${sa.name}` });
  };

  const toggleStatus = (id: string) => {
    setAdvisors(prev => prev.map(a =>
      a.id !== id ? a : { ...a, status: a.status === 'active' ? 'inactive' : 'active' }
    ));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Sales Advisors"
        description="Sales advisor profiles and branch assignments"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Sales Advisors' }]}
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />New SA
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> Active</p>
          <p className="text-2xl font-bold text-emerald-500">{advisors.filter(a => a.status === 'active').length}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Inactive</p>
          <p className="text-2xl font-bold text-foreground">{advisors.filter(a => a.status === 'inactive').length}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-bold text-foreground">{advisors.length}</p>
        </div>
      </div>

      <div className="glass-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Code, name, email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="resigned">Resigned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranch}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} advisors</span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Code</th>
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">IC</th>
                <th className="pb-2 pr-4 font-medium">Contact</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Branch</th>
                <th className="pb-2 pr-4 font-medium">Join Date</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground text-sm">No sales advisors found</td></tr>
              ) : (
                filtered.map(a => (
                  <tr key={a.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs font-medium">{a.code}</td>
                    <td className="py-2 pr-4 font-medium text-sm">{a.name}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{a.ic}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{a.contact}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{a.email}</td>
                    <td className="py-2 pr-4 text-xs">{a.branch}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{a.joinDate}</td>
                    <td className="py-2 pr-4">
                      <Badge className={`text-[10px] capitalize ${STATUS_BADGE[a.status]}`}>{a.status}</Badge>
                    </td>
                    <td className="py-2">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => toggleStatus(a.id)}>
                        {a.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add SA Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Sales Advisor</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">SA Code *</label>
                <Input className="h-8 text-sm uppercase" placeholder="e.g. SA001" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Branch *</label>
                <Select value={form.branch} onValueChange={v => setForm(f => ({ ...f, branch: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
              <Input className="h-8 text-sm" placeholder="e.g. Ahmad bin Ibrahim" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">IC Number</label>
                <Input className="h-8 text-sm" placeholder="e.g. 900101-12-1234" value={form.ic} onChange={e => setForm(f => ({ ...f, ic: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Contact No</label>
                <Input className="h-8 text-sm" placeholder="e.g. 012-3456789" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" className="h-8 text-sm" placeholder="sa@flc.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Join Date</label>
                <Input type="date" className="h-8 text-sm" value={form.joinDate} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>Create Advisor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
