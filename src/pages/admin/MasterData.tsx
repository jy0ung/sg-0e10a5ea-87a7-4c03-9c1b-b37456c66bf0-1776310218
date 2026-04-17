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
  getTinTypes, upsertTinType, deleteTinType,
  getRegistrationFees, upsertRegistrationFee, deleteRegistrationFee,
  getRoadTaxFees, upsertRoadTaxFee, deleteRoadTaxFee,
  getInspectionFees, upsertInspectionFee, deleteInspectionFee,
  getHandlingFees, upsertHandlingFee, deleteHandlingFee,
  getAdditionalItems, upsertAdditionalItem, deleteAdditionalItem,
  getPaymentTypes, upsertPaymentType, deletePaymentType,
  getBanks, upsertBank, deleteBank,
} from '@/services/masterDataService';
import {
  FinanceCompany, InsuranceCompany, VehicleModel, VehicleColour,
  TinType, RegistrationFee, RoadTaxFee, InspectionFee, HandlingFee,
  AdditionalItem, PaymentType, BankRecord,
} from '@/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

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
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
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

  // TIN Types
  const [tinTypes, setTinTypes] = useState<TinType[]>([]);
  const [ttDialog, setTtDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [ttDelete, setTtDelete] = useState<TinType | null>(null);

  // Registration Fees
  const [regFees, setRegFees] = useState<RegistrationFee[]>([]);
  const [rfDialog, setRfDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [rfDelete, setRfDelete] = useState<RegistrationFee | null>(null);

  // Road Tax Fees
  const [roadTaxFees, setRoadTaxFees] = useState<RoadTaxFee[]>([]);
  const [rtDialog, setRtDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [rtDelete, setRtDelete] = useState<RoadTaxFee | null>(null);

  // Inspection Fees
  const [inspFees, setInspFees] = useState<InspectionFee[]>([]);
  const [ifDialog, setIfDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [ifDelete, setIfDelete] = useState<InspectionFee | null>(null);

  // Handling Fees
  const [handFees, setHandFees] = useState<HandlingFee[]>([]);
  const [hfDialog, setHfDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [hfDelete, setHfDelete] = useState<HandlingFee | null>(null);

  // Additional Items
  const [addItems, setAddItems] = useState<AdditionalItem[]>([]);
  const [aiDialog, setAiDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [aiDelete, setAiDelete] = useState<AdditionalItem | null>(null);

  // Payment Types
  const [payTypes, setPayTypes] = useState<PaymentType[]>([]);
  const [ptDialog, setPtDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [ptDelete, setPtDelete] = useState<PaymentType | null>(null);

  // Banks
  const [banks, setBanks] = useState<BankRecord[]>([]);
  const [bkDialog, setBkDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [bkDelete, setBkDelete] = useState<BankRecord | null>(null);

  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    const [fc, ic, md, cl, tt, rf, rt, inf, hf, ai, pt, bk] = await Promise.all([
      getFinanceCompanies(companyId),
      getInsuranceCompanies(companyId),
      getVehicleModels(companyId),
      getVehicleColours(companyId),
      getTinTypes(companyId),
      getRegistrationFees(companyId),
      getRoadTaxFees(companyId),
      getInspectionFees(companyId),
      getHandlingFees(companyId),
      getAdditionalItems(companyId),
      getPaymentTypes(companyId),
      getBanks(companyId),
    ]);
    setFinCos(fc.data); setInsCos(ic.data); setModels(md.data); setColours(cl.data);
    setTinTypes(tt.data); setRegFees(rf.data); setRoadTaxFees(rt.data);
    setInspFees(inf.data); setHandFees(hf.data); setAddItems(ai.data);
    setPayTypes(pt.data); setBanks(bk.data);
  }, [companyId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;

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

  // ── TIN Types handlers ──
  const ttSave = async () => {
    const { code, name, status } = ttDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertTinType(companyId, { id: ttDialog.id, code: code.trim(), name: name.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setTtDialog({ open: false, values: {} }); toast({ title: ttDialog.id ? 'Updated' : 'Created' });
  };
  const ttDel = async () => {
    if (!ttDelete) return;
    const { error } = await deleteTinType(ttDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setTtDelete(null);
  };

  // ── Registration Fee handlers ──
  const rfSave = async () => {
    const { description, price, status } = rfDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertRegistrationFee(companyId, { id: rfDialog.id, description: description.trim(), price: parseFloat(price) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setRfDialog({ open: false, values: {} }); toast({ title: rfDialog.id ? 'Updated' : 'Created' });
  };
  const rfDel = async () => {
    if (!rfDelete) return;
    const { error } = await deleteRegistrationFee(rfDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setRfDelete(null);
  };

  // ── Road Tax Fee handlers ──
  const rtSave = async () => {
    const { description, price, status } = rtDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertRoadTaxFee(companyId, { id: rtDialog.id, description: description.trim(), price: parseFloat(price) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setRtDialog({ open: false, values: {} }); toast({ title: rtDialog.id ? 'Updated' : 'Created' });
  };
  const rtDel = async () => {
    if (!rtDelete) return;
    const { error } = await deleteRoadTaxFee(rtDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setRtDelete(null);
  };

  // ── Inspection Fee handlers ──
  const ifSave = async () => {
    const { itemCode, description, price, status } = ifDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertInspectionFee(companyId, { id: ifDialog.id, itemCode: itemCode?.trim(), description: description.trim(), price: parseFloat(price) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setIfDialog({ open: false, values: {} }); toast({ title: ifDialog.id ? 'Updated' : 'Created' });
  };
  const ifDel = async () => {
    if (!ifDelete) return;
    const { error } = await deleteInspectionFee(ifDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setIfDelete(null);
  };

  // ── Handling Fee handlers ──
  const hfSave = async () => {
    const { itemCode, description, price, billing, status } = hfDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertHandlingFee(companyId, { id: hfDialog.id, itemCode: itemCode?.trim(), description: description.trim(), price: parseFloat(price) || 0, billing: billing?.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setHfDialog({ open: false, values: {} }); toast({ title: hfDialog.id ? 'Updated' : 'Created' });
  };
  const hfDel = async () => {
    if (!hfDelete) return;
    const { error } = await deleteHandlingFee(hfDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setHfDelete(null);
  };

  // ── Additional Item handlers ──
  const aiSave = async () => {
    const { itemCode, description, unitPrice, status } = aiDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertAdditionalItem(companyId, { id: aiDialog.id, itemCode: itemCode?.trim(), description: description.trim(), unitPrice: parseFloat(unitPrice) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setAiDialog({ open: false, values: {} }); toast({ title: aiDialog.id ? 'Updated' : 'Created' });
  };
  const aiDel = async () => {
    if (!aiDelete) return;
    const { error } = await deleteAdditionalItem(aiDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setAiDelete(null);
  };

  // ── Payment Type handlers ──
  const ptSave = async () => {
    const { name, billing, status } = ptDialog.values;
    if (!name?.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertPaymentType(companyId, { id: ptDialog.id, name: name.trim(), billing: billing?.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setPtDialog({ open: false, values: {} }); toast({ title: ptDialog.id ? 'Updated' : 'Created' });
  };
  const ptDel = async () => {
    if (!ptDelete) return;
    const { error } = await deletePaymentType(ptDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setPtDelete(null);
  };

  // ── Bank handlers ──
  const bkSave = async () => {
    const { name, accountNo, status } = bkDialog.values;
    if (!name?.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertBank(companyId, { id: bkDialog.id, name: name.trim(), accountNo: accountNo?.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll(); setBkDialog({ open: false, values: {} }); toast({ title: bkDialog.id ? 'Updated' : 'Created' });
  };
  const bkDel = async () => {
    if (!bkDelete) return;
    const { error } = await deleteBank(bkDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await loadAll();
    setBkDelete(null);
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
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="finance">Finance Cos</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="colours">Colours</TabsTrigger>
          <TabsTrigger value="tin">TIN Types</TabsTrigger>
          <TabsTrigger value="regfee">Reg. Fee</TabsTrigger>
          <TabsTrigger value="roadtax">Road Tax</TabsTrigger>
          <TabsTrigger value="inspfee">Insp. Fee</TabsTrigger>
          <TabsTrigger value="handfee">Handling Fee</TabsTrigger>
          <TabsTrigger value="additems">Other Products</TabsTrigger>
          <TabsTrigger value="paytype">Payment Types</TabsTrigger>
          <TabsTrigger value="banks">Banks</TabsTrigger>
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

        {/* TIN Types */}
        <TabsContent value="tin" className="mt-4">
          <MasterTable rows={tinTypes} cols={[{ key: 'code' as const, label: 'Code', className: 'font-mono font-semibold' }, { key: 'name' as const, label: 'Name' }, { key: 'status' as const, label: 'Status' }] as ColDef<TinType>[]}
            onAdd={() => setTtDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setTtDialog({ open: true, id: r.id, values: { code: r.code, name: r.name, status: r.status } })} onDelete={r => setTtDelete(r)} addLabel="Add TIN Type" />
          <RecordDialog open={ttDialog.open} onClose={() => setTtDialog({ open: false, values: {} })} title={ttDialog.id ? 'Edit TIN Type' : 'Add TIN Type'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. IND' }, { key: 'name', label: 'Name *', hint: 'e.g. Individual' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={ttDialog.values} onChange={(k, v) => setTtDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={ttSave} saving={saving} />
          {ttDelete && <ConfirmDelete name={`${ttDelete.code} – ${ttDelete.name}`} onConfirm={ttDel} onCancel={() => setTtDelete(null)} />}
        </TabsContent>

        {/* Registration Fees */}
        <TabsContent value="regfee" className="mt-4">
          <MasterTable rows={regFees} cols={[{ key: 'description' as const, label: 'Description' }, { key: 'price' as const, label: 'Price (RM)' }, { key: 'status' as const, label: 'Status' }] as ColDef<RegistrationFee>[]}
            onAdd={() => setRfDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setRfDialog({ open: true, id: r.id, values: { description: r.description, price: String(r.price), status: r.status } })} onDelete={r => setRfDelete(r)} addLabel="Add Fee" />
          <RecordDialog open={rfDialog.open} onClose={() => setRfDialog({ open: false, values: {} })} title={rfDialog.id ? 'Edit Registration Fee' : 'Add Registration Fee'}
            fields={[{ key: 'description', label: 'Description *', hint: 'e.g. JPJ Registration' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={rfDialog.values} onChange={(k, v) => setRfDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={rfSave} saving={saving} />
          {rfDelete && <ConfirmDelete name={rfDelete.description} onConfirm={rfDel} onCancel={() => setRfDelete(null)} />}
        </TabsContent>

        {/* Road Tax Fees */}
        <TabsContent value="roadtax" className="mt-4">
          <MasterTable rows={roadTaxFees} cols={[{ key: 'description' as const, label: 'Description' }, { key: 'price' as const, label: 'Price (RM)' }, { key: 'status' as const, label: 'Status' }] as ColDef<RoadTaxFee>[]}
            onAdd={() => setRtDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setRtDialog({ open: true, id: r.id, values: { description: r.description, price: String(r.price), status: r.status } })} onDelete={r => setRtDelete(r)} addLabel="Add Fee" />
          <RecordDialog open={rtDialog.open} onClose={() => setRtDialog({ open: false, values: {} })} title={rtDialog.id ? 'Edit Road Tax Fee' : 'Add Road Tax Fee'}
            fields={[{ key: 'description', label: 'Description *' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={rtDialog.values} onChange={(k, v) => setRtDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={rtSave} saving={saving} />
          {rtDelete && <ConfirmDelete name={rtDelete.description} onConfirm={rtDel} onCancel={() => setRtDelete(null)} />}
        </TabsContent>

        {/* Inspection Fees */}
        <TabsContent value="inspfee" className="mt-4">
          <MasterTable rows={inspFees} cols={[{ key: 'itemCode' as const, label: 'Item Code', className: 'font-mono' }, { key: 'description' as const, label: 'Description' }, { key: 'price' as const, label: 'Price (RM)' }, { key: 'status' as const, label: 'Status' }] as ColDef<InspectionFee>[]}
            onAdd={() => setIfDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setIfDialog({ open: true, id: r.id, values: { itemCode: r.itemCode ?? '', description: r.description, price: String(r.price), status: r.status } })} onDelete={r => setIfDelete(r)} addLabel="Add Fee" />
          <RecordDialog open={ifDialog.open} onClose={() => setIfDialog({ open: false, values: {} })} title={ifDialog.id ? 'Edit Inspection Fee' : 'Add Inspection Fee'}
            fields={[{ key: 'itemCode', label: 'Item Code', hint: 'Optional code' }, { key: 'description', label: 'Description *' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={ifDialog.values} onChange={(k, v) => setIfDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={ifSave} saving={saving} />
          {ifDelete && <ConfirmDelete name={ifDelete.description} onConfirm={ifDel} onCancel={() => setIfDelete(null)} />}
        </TabsContent>

        {/* Handling Fees */}
        <TabsContent value="handfee" className="mt-4">
          <MasterTable rows={handFees} cols={[{ key: 'itemCode' as const, label: 'Item Code', className: 'font-mono' }, { key: 'description' as const, label: 'Description' }, { key: 'price' as const, label: 'Price (RM)' }, { key: 'billing' as const, label: 'Billing' }, { key: 'status' as const, label: 'Status' }] as ColDef<HandlingFee>[]}
            onAdd={() => setHfDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setHfDialog({ open: true, id: r.id, values: { itemCode: r.itemCode ?? '', description: r.description, price: String(r.price), billing: r.billing ?? '', status: r.status } })} onDelete={r => setHfDelete(r)} addLabel="Add Fee" />
          <RecordDialog open={hfDialog.open} onClose={() => setHfDialog({ open: false, values: {} })} title={hfDialog.id ? 'Edit Handling Fee' : 'Add Handling Fee'}
            fields={[{ key: 'itemCode', label: 'Item Code' }, { key: 'description', label: 'Description *' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'billing', label: 'Billing', hint: 'Yes / No' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={hfDialog.values} onChange={(k, v) => setHfDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={hfSave} saving={saving} />
          {hfDelete && <ConfirmDelete name={hfDelete.description} onConfirm={hfDel} onCancel={() => setHfDelete(null)} />}
        </TabsContent>

        {/* Additional Items */}
        <TabsContent value="additems" className="mt-4">
          <MasterTable rows={addItems} cols={[{ key: 'itemCode' as const, label: 'Item Code', className: 'font-mono' }, { key: 'description' as const, label: 'Description' }, { key: 'unitPrice' as const, label: 'Unit Price (RM)' }, { key: 'status' as const, label: 'Status' }] as ColDef<AdditionalItem>[]}
            onAdd={() => setAiDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setAiDialog({ open: true, id: r.id, values: { itemCode: r.itemCode ?? '', description: r.description, unitPrice: String(r.unitPrice), status: r.status } })} onDelete={r => setAiDelete(r)} addLabel="Add Product" />
          <RecordDialog open={aiDialog.open} onClose={() => setAiDialog({ open: false, values: {} })} title={aiDialog.id ? 'Edit Other Product' : 'Add Other Product'}
            fields={[{ key: 'itemCode', label: 'Item Code' }, { key: 'description', label: 'Description *' }, { key: 'unitPrice', label: 'Unit Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={aiDialog.values} onChange={(k, v) => setAiDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={aiSave} saving={saving} />
          {aiDelete && <ConfirmDelete name={aiDelete.description} onConfirm={aiDel} onCancel={() => setAiDelete(null)} />}
        </TabsContent>

        {/* Payment Types */}
        <TabsContent value="paytype" className="mt-4">
          <MasterTable rows={payTypes} cols={[{ key: 'name' as const, label: 'Payment Type' }, { key: 'billing' as const, label: 'Billing' }, { key: 'status' as const, label: 'Status' }] as ColDef<PaymentType>[]}
            onAdd={() => setPtDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setPtDialog({ open: true, id: r.id, values: { name: r.name, billing: r.billing ?? '', status: r.status } })} onDelete={r => setPtDelete(r)} addLabel="Add Type" />
          <RecordDialog open={ptDialog.open} onClose={() => setPtDialog({ open: false, values: {} })} title={ptDialog.id ? 'Edit Payment Type' : 'Add Payment Type'}
            fields={[{ key: 'name', label: 'Name *', hint: 'e.g. Cash' }, { key: 'billing', label: 'Billing', hint: 'Yes / No' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={ptDialog.values} onChange={(k, v) => setPtDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={ptSave} saving={saving} />
          {ptDelete && <ConfirmDelete name={ptDelete.name} onConfirm={ptDel} onCancel={() => setPtDelete(null)} />}
        </TabsContent>

        {/* Banks */}
        <TabsContent value="banks" className="mt-4">
          <MasterTable rows={banks} cols={[{ key: 'name' as const, label: 'Bank Name' }, { key: 'accountNo' as const, label: 'Account No.' }, { key: 'status' as const, label: 'Status' }] as ColDef<BankRecord>[]}
            onAdd={() => setBkDialog({ open: true, values: { status: 'Active' } })} onEdit={r => setBkDialog({ open: true, id: r.id, values: { name: r.name, accountNo: r.accountNo ?? '', status: r.status } })} onDelete={r => setBkDelete(r)} addLabel="Add Bank" />
          <RecordDialog open={bkDialog.open} onClose={() => setBkDialog({ open: false, values: {} })} title={bkDialog.id ? 'Edit Bank' : 'Add Bank'}
            fields={[{ key: 'name', label: 'Bank Name *', hint: 'e.g. Maybank Berhad' }, { key: 'accountNo', label: 'Account No.', hint: 'e.g. 5621-1234-5678' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={bkDialog.values} onChange={(k, v) => setBkDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={bkSave} saving={saving} />
          {bkDelete && <ConfirmDelete name={bkDelete.name} onConfirm={bkDel} onCancel={() => setBkDelete(null)} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
