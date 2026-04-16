import React, { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  getBranchMappings, createBranchMapping, updateBranchMapping, deleteBranchMapping,
  getPaymentMethodMappings, createPaymentMethodMapping, updatePaymentMethodMapping, deletePaymentMethodMapping,
} from '@/services/mappingService';
import type { BranchMapping, PaymentMethodMapping } from '@/types';
import { Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';

interface EditingRow {
  id: string | null; // null = new row
  rawValue: string;
  canonicalValue: string;
  notes: string;
}

function MappingTable<T extends { id: string; rawValue: string; notes?: string }>({
  title,
  description,
  items,
  canonicalLabel,
  getCanonical,
  onSaveNew,
  onUpdate,
  onDelete,
  canEdit,
}: {
  title: string;
  description: string;
  items: T[];
  canonicalLabel: string;
  getCanonical: (item: T) => string;
  onSaveNew: (rawValue: string, canonical: string, notes: string) => Promise<void>;
  onUpdate: (id: string, rawValue: string, canonical: string, notes: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canEdit: boolean;
}) {
  const [editRow, setEditRow] = useState<EditingRow | null>(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => setEditRow({ id: null, rawValue: '', canonicalValue: '', notes: '' });
  const startEdit = (item: T) => setEditRow({ id: item.id, rawValue: item.rawValue, canonicalValue: getCanonical(item), notes: item.notes ?? '' });
  const cancel = () => setEditRow(null);

  const save = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      if (editRow.id === null) {
        await onSaveNew(editRow.rawValue, editRow.canonicalValue, editRow.notes);
      } else {
        await onUpdate(editRow.id, editRow.rawValue, editRow.canonicalValue, editRow.notes);
      }
      setEditRow(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={startNew} disabled={!!editRow}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add
          </Button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-left">
            <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Raw Value</th>
            <th className="px-4 py-2 text-xs text-muted-foreground font-medium">{canonicalLabel}</th>
            <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Notes</th>
            {canEdit && <th className="px-4 py-2 text-xs text-muted-foreground font-medium w-24">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {/* New row form */}
          {editRow?.id === null && (
            <tr className="border-b border-border bg-primary/5">
              <td className="px-3 py-2"><Input className="h-7 text-xs" value={editRow.rawValue} onChange={e => setEditRow(r => r && { ...r, rawValue: e.target.value })} placeholder="RAW" /></td>
              <td className="px-3 py-2"><Input className="h-7 text-xs" value={editRow.canonicalValue} onChange={e => setEditRow(r => r && { ...r, canonicalValue: e.target.value })} placeholder="Canonical" /></td>
              <td className="px-3 py-2"><Input className="h-7 text-xs" value={editRow.notes} onChange={e => setEditRow(r => r && { ...r, notes: e.target.value })} placeholder="Notes" /></td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-500" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancel}><X className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                </div>
              </td>
            </tr>
          )}

          {items.map(item => (
            editRow?.id === item.id ? (
              <tr key={item.id} className="border-b border-border bg-primary/5">
                <td className="px-3 py-2"><Input className="h-7 text-xs" value={editRow.rawValue} onChange={e => setEditRow(r => r && { ...r, rawValue: e.target.value })} /></td>
                <td className="px-3 py-2"><Input className="h-7 text-xs" value={editRow.canonicalValue} onChange={e => setEditRow(r => r && { ...r, canonicalValue: e.target.value })} /></td>
                <td className="px-3 py-2"><Input className="h-7 text-xs" value={editRow.notes} onChange={e => setEditRow(r => r && { ...r, notes: e.target.value })} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-500" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancel}><X className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={item.id} className="data-table-row">
                <td className="px-4 py-2 font-mono text-xs text-foreground">{item.rawValue}</td>
                <td className="px-4 py-2 text-foreground font-medium">{getCanonical(item)}</td>
                <td className="px-4 py-2 text-muted-foreground">{item.notes || '—'}</td>
                {canEdit && (
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(item)} disabled={!!editRow}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(item.id)} disabled={!!editRow}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                )}
              </tr>
            )
          ))}

          {items.length === 0 && !editRow && (
            <tr><td colSpan={canEdit ? 4 : 3} className="px-4 py-6 text-center text-xs text-muted-foreground">No mappings configured.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function MappingAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = user?.company_id ?? 'c1';
  const canEdit = ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'].includes(user?.role ?? '');

  const [branchMappings, setBranchMappings] = useState<BranchMapping[]>([]);
  const [paymentMappings, setPaymentMappings] = useState<PaymentMethodMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [bRes, pRes] = await Promise.all([
      getBranchMappings(companyId),
      getPaymentMethodMappings(companyId),
    ]);
    setBranchMappings(bRes.data);
    setPaymentMappings(pRes.data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Branch mapping handlers
  const handleNewBranch = async (rawValue: string, canonical: string, notes: string) => {
    const { error } = await createBranchMapping({ rawValue, canonicalCode: canonical, notes, companyId });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Branch mapping added' });
    await load();
  };
  const handleUpdateBranch = async (id: string, rawValue: string, canonical: string, notes: string) => {
    const { error } = await updateBranchMapping(id, { rawValue, canonicalCode: canonical, notes });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Branch mapping updated' });
    await load();
  };
  const handleDeleteBranch = async (id: string) => {
    const { error } = await deleteBranchMapping(id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Branch mapping deleted' });
    await load();
  };

  // Payment mapping handlers
  const handleNewPayment = async (rawValue: string, canonical: string, notes: string) => {
    const { error } = await createPaymentMethodMapping({ rawValue, canonicalValue: canonical, notes, companyId });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Payment mapping added' });
    await load();
  };
  const handleUpdatePayment = async (id: string, rawValue: string, canonical: string, notes: string) => {
    const { error } = await updatePaymentMethodMapping(id, { rawValue, canonicalValue: canonical, notes });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Payment mapping updated' });
    await load();
  };
  const handleDeletePayment = async (id: string) => {
    const { error } = await deletePaymentMethodMapping(id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Payment mapping deleted' });
    await load();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Mapping Administration"
        description="Manage data normalisation rules used during imports"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Mappings' }]}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading mappings…
        </div>
      ) : (
        <>
          <MappingTable<BranchMapping>
            title="Branch Mappings"
            description="Map raw branch codes from imported files to canonical branch codes"
            items={branchMappings}
            canonicalLabel="Canonical Code"
            getCanonical={item => item.canonicalCode}
            onSaveNew={handleNewBranch}
            onUpdate={handleUpdateBranch}
            onDelete={handleDeleteBranch}
            canEdit={canEdit}
          />

          <MappingTable<PaymentMethodMapping>
            title="Payment Method Mappings"
            description="Normalise payment method values from imported files"
            items={paymentMappings}
            canonicalLabel="Canonical Value"
            getCanonical={item => item.canonicalValue}
            onSaveNew={handleNewPayment}
            onUpdate={handleUpdatePayment}
            onDelete={handleDeletePayment}
            canEdit={canEdit}
          />
        </>
      )}
    </div>
  );
}
