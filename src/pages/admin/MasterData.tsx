import React, { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getFinanceCompanies, upsertFinanceCompany, deleteFinanceCompany,
  getInsuranceCompanies, upsertInsuranceCompany, deleteInsuranceCompany,
  getVehicleModels, upsertVehicleModel, deleteVehicleModel,
  getVehicleColours, upsertVehicleColour, deleteVehicleColour,
} from '@/services/masterDataService';
import { FinanceCompany, InsuranceCompany, VehicleModel, VehicleColour } from '@/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';

// ── Generic inline-editable table ──────────────────────────────────────────

interface ColDef<T> { key: keyof T; label: string; className?: string }

interface TableProps<T extends { id: string }> {
  rows: T[];
  cols: ColDef<T>[];
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  onAdd: () => void;
  addLabel: string;
}

function MasterTable<T extends { id: string }>({ rows, cols, onEdit, onDelete, onAdd, addLabel }: TableProps<T>) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" />{addLabel}</Button>
      </div>
      <div className="glass-panel overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {cols.map(c => <th key={String(c.key)} className="px-3 py-2 font-medium">{c.label}</th>)}
              <th className="px-3 py-2 font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                {cols.map(c => (
                  <td key={String(c.key)} className={`px-3 py-2 ${c.className ?? ''}`}>
                    {String(row[c.key] ?? '—')}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => onDelete(row)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="py-8 text-center text-muted-foreground text-xs">No records</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Generic single-record dialog ───────────────────────────────────────────

interface FieldDef { key: string; label: string; type?: string; hint?: string }
interface RecordDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: FieldDef[];
  values: Record<string, string>;
  onChange: (k: string, v: string) => void;
  onSave: () => void;
  saving: boolean;
}

function RecordDialog({ open, onClose, title, fields, values, onChange, onSave, saving }: RecordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {fields.map(f => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <Input
                className="h-8 text-sm"
                type={f.type ?? 'text'}
                placeholder={f.hint}
                value={values[f.key] ?? ''}
                onChange={e => onChange(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirm dialog ──────────────────────────────────────────────────

function ConfirmDelete({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Delete Record</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{name}</strong>? This cannot be undone.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function MasterData() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? 'c1';
  const { toast } = useToast();

  // Finance Companies
  const [finCos, setFinCos] = useState<FinanceCompany[]>([]);
  const [fcDialog, setFcDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [fcDelete, setFcDelete] = useState<FinanceCompany | null>(null);

  // Insurance Companies
  const [insCos, setInsCos] = useState<InsuranceCompany[]>([]);
  const [icDialog, setIcDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [icDelete, setIcDelete] = useState<InsuranceCompany | null>(null);

  // Models
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [mdDialog, setMdDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [mdDelete, setMdDelete] = useState<VehicleModel | null>(null);

  // Colours
  const [colours, setColours] = useState<VehicleColour[]>([]);
  const [clDialog, setClDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [clDelete, setClDelete] = useState<VehicleColour | null>(null);

  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    const [fc, ic, md, cl] = await Promise.all([
      getFinanceCompanies(companyId),
      getInsuranceCompanies(companyId),
      getVehicleModels(companyId),
      getVehicleColours(companyId),
    ]);
    setFinCos(fc.data);
    setInsCos(ic.data);
    setModels(md.data);
    setColours(cl.data);
  }, [companyId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Finance Companies handlers ──
  const fcSave = async () => {
    const { code, name } = fcDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertFinanceCompany(companyId, { id: fcDialog.id, code: code.trim(), name: name.trim() });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setFcDialog({ open: false, values: {} });
    toast({ title: fcDialog.id ? 'Updated' : 'Created' });
  };
  const fcDel = async () => {
    if (!fcDelete) return;
    const { error } = await deleteFinanceCompany(fcDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setFcDelete(null);
  };

  // ── Insurance Companies handlers ──
  const icSave = async () => {
    const { code, name } = icDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertInsuranceCompany(companyId, { id: icDialog.id, code: code.trim(), name: name.trim() });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setIcDialog({ open: false, values: {} });
    toast({ title: icDialog.id ? 'Updated' : 'Created' });
  };
  const icDel = async () => {
    if (!icDelete) return;
    const { error } = await deleteInsuranceCompany(icDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setIcDelete(null);
  };

  // ── Models handlers ──
  const mdSave = async () => {
    const { code, name, basePrice } = mdDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertVehicleModel(companyId, { id: mdDialog.id, code: code.trim(), name: name.trim(), basePrice: basePrice ? parseFloat(basePrice) : undefined });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setMdDialog({ open: false, values: {} });
    toast({ title: mdDialog.id ? 'Updated' : 'Created' });
  };
  const mdDel = async () => {
    if (!mdDelete) return;
    const { error } = await deleteVehicleModel(mdDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setMdDelete(null);
  };

  // ── Colours handlers ──
  const clSave = async () => {
    const { code, name, hex } = clDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertVehicleColour(companyId, { id: clDialog.id, code: code.trim(), name: name.trim(), hex: hex?.trim() || undefined });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setClDialog({ open: false, values: {} });
    toast({ title: clDialog.id ? 'Updated' : 'Created' });
  };
  const clDel = async () => {
    if (!clDelete) return;
    const { error } = await deleteVehicleColour(clDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setClDelete(null);
  };

  const codeNameCols = [
    { key: 'code' as const, label: 'Code', className: 'font-mono font-semibold' },
    { key: 'name' as const, label: 'Name' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Master Data"
        description="Manage Finance Companies, Insurance Companies, Vehicle Models and Colours"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Master Data' }]}
      />

      <Tabs defaultValue="finance">
        <TabsList>
          <TabsTrigger value="finance">Finance Companies</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="colours">Colours</TabsTrigger>
        </TabsList>

        {/* Finance Companies */}
        <TabsContent value="finance" className="mt-4">
          <MasterTable
            rows={finCos}
            cols={codeNameCols as ColDef<FinanceCompany>[]}
            onAdd={() => setFcDialog({ open: true, values: {} })}
            onEdit={r => setFcDialog({ open: true, id: r.id, values: { code: r.code, name: r.name } })}
            onDelete={r => setFcDelete(r)}
            addLabel="Add Finance Co"
          />
          <RecordDialog
            open={fcDialog.open}
            onClose={() => setFcDialog({ open: false, values: {} })}
            title={fcDialog.id ? 'Edit Finance Company' : 'Add Finance Company'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. MAY' }, { key: 'name', label: 'Name *', hint: 'e.g. Maybank Islamic' }]}
            values={fcDialog.values}
            onChange={(k, v) => setFcDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))}
            onSave={fcSave}
            saving={saving}
          />
          {fcDelete && <ConfirmDelete name={`${fcDelete.code} – ${fcDelete.name}`} onConfirm={fcDel} onCancel={() => setFcDelete(null)} />}
        </TabsContent>

        {/* Insurance Companies */}
        <TabsContent value="insurance" className="mt-4">
          <MasterTable
            rows={insCos}
            cols={codeNameCols as ColDef<InsuranceCompany>[]}
            onAdd={() => setIcDialog({ open: true, values: {} })}
            onEdit={r => setIcDialog({ open: true, id: r.id, values: { code: r.code, name: r.name } })}
            onDelete={r => setIcDelete(r)}
            addLabel="Add Insurance Co"
          />
          <RecordDialog
            open={icDialog.open}
            onClose={() => setIcDialog({ open: false, values: {} })}
            title={icDialog.id ? 'Edit Insurance Company' : 'Add Insurance Company'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. AIA' }, { key: 'name', label: 'Name *', hint: 'e.g. AIA Insurance' }]}
            values={icDialog.values}
            onChange={(k, v) => setIcDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))}
            onSave={icSave}
            saving={saving}
          />
          {icDelete && <ConfirmDelete name={`${icDelete.code} – ${icDelete.name}`} onConfirm={icDel} onCancel={() => setIcDelete(null)} />}
        </TabsContent>

        {/* Models */}
        <TabsContent value="models" className="mt-4">
          <MasterTable
            rows={models}
            cols={[
              { key: 'code', label: 'Code', className: 'font-mono font-semibold' },
              { key: 'name', label: 'Name' },
              { key: 'basePrice', label: 'Base Price (RM)' },
            ] as ColDef<VehicleModel>[]}
            onAdd={() => setMdDialog({ open: true, values: {} })}
            onEdit={r => setMdDialog({ open: true, id: r.id, values: { code: r.code, name: r.name, basePrice: String(r.basePrice ?? '') } })}
            onDelete={r => setMdDelete(r)}
            addLabel="Add Model"
          />
          <RecordDialog
            open={mdDialog.open}
            onClose={() => setMdDialog({ open: false, values: {} })}
            title={mdDialog.id ? 'Edit Model' : 'Add Model'}
            fields={[
              { key: 'code', label: 'Code *', hint: 'e.g. MYVI' },
              { key: 'name', label: 'Name *', hint: 'e.g. Perodua Myvi' },
              { key: 'basePrice', label: 'Base Price (RM)', type: 'number', hint: 'e.g. 45000' },
            ]}
            values={mdDialog.values}
            onChange={(k, v) => setMdDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))}
            onSave={mdSave}
            saving={saving}
          />
          {mdDelete && <ConfirmDelete name={`${mdDelete.code} – ${mdDelete.name}`} onConfirm={mdDel} onCancel={() => setMdDelete(null)} />}
        </TabsContent>

        {/* Colours */}
        <TabsContent value="colours" className="mt-4">
          <MasterTable
            rows={colours}
            cols={[
              { key: 'code', label: 'Code', className: 'font-mono font-semibold' },
              { key: 'name', label: 'Name' },
              { key: 'hex', label: 'Hex Color' },
            ] as ColDef<VehicleColour>[]}
            onAdd={() => setClDialog({ open: true, values: {} })}
            onEdit={r => setClDialog({ open: true, id: r.id, values: { code: r.code, name: r.name, hex: r.hex ?? '' } })}
            onDelete={r => setClDelete(r)}
            addLabel="Add Colour"
          />
          <RecordDialog
            open={clDialog.open}
            onClose={() => setClDialog({ open: false, values: {} })}
            title={clDialog.id ? 'Edit Colour' : 'Add Colour'}
            fields={[
              { key: 'code', label: 'Code *', hint: 'e.g. WHT' },
              { key: 'name', label: 'Name *', hint: 'e.g. Polar White' },
              { key: 'hex', label: 'Hex Color', hint: '#FFFFFF' },
            ]}
            values={clDialog.values}
            onChange={(k, v) => setClDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))}
            onSave={clSave}
            saving={saving}
          />
          {clDelete && <ConfirmDelete name={`${clDelete.code} – ${clDelete.name}`} onConfirm={clDel} onCancel={() => setClDelete(null)} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
