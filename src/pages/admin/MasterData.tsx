import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
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
import type {
  FinanceCompany, InsuranceCompany, VehicleModel, VehicleColour,
  TinType, RegistrationFee, RoadTaxFee, InspectionFee, HandlingFee,
  AdditionalItem, PaymentType, BankRecord,
} from '@/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

interface MasterTableProps<T extends { id: string }> {
  rows: T[];
  columns: StandardTableColumn<T>[];
  onAdd: () => void;
  addLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
}

function MasterTable<T extends { id: string }>({ rows, columns, onAdd, addLabel, searchPlaceholder, emptyMessage }: MasterTableProps<T>) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" />{addLabel}</Button>
      </div>
      <StandardTable
        data={rows}
        columns={columns}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}

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
              <label htmlFor={`master-data-${f.key}`} className="text-xs text-muted-foreground">{f.label}</label>
              <Input
                id={`master-data-${f.key}`}
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

const VALID_TABS = ['finance','insurance','models','colours','tin','regfee','roadtax','inspfee','handfee','additems','paytype','banks'] as const;
type MasterTab = typeof VALID_TABS[number];

export default function MasterData() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') as MasterTab | null;
  const tab: MasterTab = rawTab && (VALID_TABS as readonly string[]).includes(rawTab) ? rawTab : 'finance';
  const onTabChange = (value: string) => setSearchParams({ tab: value }, { replace: true });

  const [saving, setSaving] = useState(false);

  const [fcDialog, setFcDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [fcDelete, setFcDelete] = useState<FinanceCompany | null>(null);
  const [icDialog, setIcDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [icDelete, setIcDelete] = useState<InsuranceCompany | null>(null);
  const [mdDialog, setMdDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [mdDelete, setMdDelete] = useState<VehicleModel | null>(null);
  const [clDialog, setClDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [clDelete, setClDelete] = useState<VehicleColour | null>(null);
  const [ttDialog, setTtDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [ttDelete, setTtDelete] = useState<TinType | null>(null);
  const [rfDialog, setRfDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [rfDelete, setRfDelete] = useState<RegistrationFee | null>(null);
  const [rtDialog, setRtDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [rtDelete, setRtDelete] = useState<RoadTaxFee | null>(null);
  const [ifDialog, setIfDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [ifDelete, setIfDelete] = useState<InspectionFee | null>(null);
  const [hfDialog, setHfDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [hfDelete, setHfDelete] = useState<HandlingFee | null>(null);
  const [aiDialog, setAiDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [aiDelete, setAiDelete] = useState<AdditionalItem | null>(null);
  const [ptDialog, setPtDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [ptDelete, setPtDelete] = useState<PaymentType | null>(null);
  const [bkDialog, setBkDialog] = useState<{ open: boolean; id?: string; values: Record<string, string> }>({ open: false, values: {} });
  const [bkDelete, setBkDelete] = useState<BankRecord | null>(null);

  function useMasterQuery<T>(queryKey: string[], queryFn: () => Promise<T>) {
    return useQuery({
      queryKey,
      queryFn,
      enabled: !!companyId,
      staleTime: 60_000,
    });
  }

  const finCosQuery = useMasterQuery(
    ['master-data', 'finance-companies', companyId],
    () => getFinanceCompanies(companyId).then(r => r.data ?? []),
  );
  const insCosQuery = useMasterQuery(
    ['master-data', 'insurance-companies', companyId],
    () => getInsuranceCompanies(companyId).then(r => r.data ?? []),
  );
  const modelsQuery = useMasterQuery(
    ['master-data', 'vehicle-models', companyId],
    () => getVehicleModels(companyId).then(r => r.data ?? []),
  );
  const coloursQuery = useMasterQuery(
    ['master-data', 'vehicle-colours', companyId],
    () => getVehicleColours(companyId).then(r => r.data ?? []),
  );
  const tinTypesQuery = useMasterQuery(
    ['master-data', 'tin-types', companyId],
    () => getTinTypes(companyId).then(r => r.data ?? []),
  );
  const regFeesQuery = useMasterQuery(
    ['master-data', 'registration-fees', companyId],
    () => getRegistrationFees(companyId).then(r => r.data ?? []),
  );
  const roadTaxQuery = useMasterQuery(
    ['master-data', 'road-tax-fees', companyId],
    () => getRoadTaxFees(companyId).then(r => r.data ?? []),
  );
  const inspFeesQuery = useMasterQuery(
    ['master-data', 'inspection-fees', companyId],
    () => getInspectionFees(companyId).then(r => r.data ?? []),
  );
  const handFeesQuery = useMasterQuery(
    ['master-data', 'handling-fees', companyId],
    () => getHandlingFees(companyId).then(r => r.data ?? []),
  );
  const addItemsQuery = useMasterQuery(
    ['master-data', 'additional-items', companyId],
    () => getAdditionalItems(companyId).then(r => r.data ?? []),
  );
  const payTypesQuery = useMasterQuery(
    ['master-data', 'payment-types', companyId],
    () => getPaymentTypes(companyId).then(r => r.data ?? []),
  );
  const banksQuery = useMasterQuery(
    ['master-data', 'banks', companyId],
    () => getBanks(companyId).then(r => r.data ?? []),
  );

  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;

  const invalidateTab = (tabKey: string) =>
    queryClient.invalidateQueries({ queryKey: ['master-data', tabKey, companyId] });

  const fcSave = async () => {
    const { code, name } = fcDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertFinanceCompany(companyId, { id: fcDialog.id, code: code.trim(), name: name.trim() });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('finance-companies');
    setFcDialog({ open: false, values: {} });
    toast({ title: fcDialog.id ? 'Updated' : 'Created' });
  };
  const fcDel = async () => {
    if (!fcDelete) return;
    const { error } = await deleteFinanceCompany(companyId, fcDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('finance-companies');
    setFcDelete(null);
  };

  const icSave = async () => {
    const { code, name } = icDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertInsuranceCompany(companyId, { id: icDialog.id, code: code.trim(), name: name.trim() });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('insurance-companies');
    setIcDialog({ open: false, values: {} });
    toast({ title: icDialog.id ? 'Updated' : 'Created' });
  };
  const icDel = async () => {
    if (!icDelete) return;
    const { error } = await deleteInsuranceCompany(companyId, icDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('insurance-companies');
    setIcDelete(null);
  };

  const mdSave = async () => {
    const { code, name, basePrice } = mdDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertVehicleModel(companyId, { id: mdDialog.id, code: code.trim(), name: name.trim(), basePrice: basePrice ? parseFloat(basePrice) : undefined });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('vehicle-models');
    setMdDialog({ open: false, values: {} });
    toast({ title: mdDialog.id ? 'Updated' : 'Created' });
  };
  const mdDel = async () => {
    if (!mdDelete) return;
    const { error } = await deleteVehicleModel(companyId, mdDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('vehicle-models');
    setMdDelete(null);
  };

  const clSave = async () => {
    const { code, name, hex } = clDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertVehicleColour(companyId, { id: clDialog.id, code: code.trim(), name: name.trim(), hex: hex?.trim() || undefined });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('vehicle-colours');
    setClDialog({ open: false, values: {} });
    toast({ title: clDialog.id ? 'Updated' : 'Created' });
  };
  const clDel = async () => {
    if (!clDelete) return;
    const { error } = await deleteVehicleColour(companyId, clDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('vehicle-colours');
    setClDelete(null);
  };

  const ttSave = async () => {
    const { code, name, status } = ttDialog.values;
    if (!code?.trim() || !name?.trim()) return toast({ title: 'Code and Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertTinType(companyId, { id: ttDialog.id, code: code.trim(), name: name.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('tin-types');
    setTtDialog({ open: false, values: {} });
    toast({ title: ttDialog.id ? 'Updated' : 'Created' });
  };
  const ttDel = async () => {
    if (!ttDelete) return;
    const { error } = await deleteTinType(companyId, ttDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('tin-types');
    setTtDelete(null);
  };

  const rfSave = async () => {
    const { description, price, status } = rfDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertRegistrationFee(companyId, { id: rfDialog.id, description: description.trim(), price: parseFloat(price) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('registration-fees');
    setRfDialog({ open: false, values: {} });
    toast({ title: rfDialog.id ? 'Updated' : 'Created' });
  };
  const rfDel = async () => {
    if (!rfDelete) return;
    const { error } = await deleteRegistrationFee(companyId, rfDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('registration-fees');
    setRfDelete(null);
  };

  const rtSave = async () => {
    const { description, price, status } = rtDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertRoadTaxFee(companyId, { id: rtDialog.id, description: description.trim(), price: parseFloat(price) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('road-tax-fees');
    setRtDialog({ open: false, values: {} });
    toast({ title: rtDialog.id ? 'Updated' : 'Created' });
  };
  const rtDel = async () => {
    if (!rtDelete) return;
    const { error } = await deleteRoadTaxFee(companyId, rtDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('road-tax-fees');
    setRtDelete(null);
  };

  const ifSave = async () => {
    const { itemCode, description, price, status } = ifDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertInspectionFee(companyId, { id: ifDialog.id, itemCode: itemCode?.trim(), description: description.trim(), price: parseFloat(price) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('inspection-fees');
    setIfDialog({ open: false, values: {} });
    toast({ title: ifDialog.id ? 'Updated' : 'Created' });
  };
  const ifDel = async () => {
    if (!ifDelete) return;
    const { error } = await deleteInspectionFee(companyId, ifDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('inspection-fees');
    setIfDelete(null);
  };

  const hfSave = async () => {
    const { itemCode, description, price, billing, status } = hfDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertHandlingFee(companyId, { id: hfDialog.id, itemCode: itemCode?.trim(), description: description.trim(), price: parseFloat(price) || 0, billing: billing?.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('handling-fees');
    setHfDialog({ open: false, values: {} });
    toast({ title: hfDialog.id ? 'Updated' : 'Created' });
  };
  const hfDel = async () => {
    if (!hfDelete) return;
    const { error } = await deleteHandlingFee(companyId, hfDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('handling-fees');
    setHfDelete(null);
  };

  const aiSave = async () => {
    const { itemCode, description, unitPrice, status } = aiDialog.values;
    if (!description?.trim()) return toast({ title: 'Description required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertAdditionalItem(companyId, { id: aiDialog.id, itemCode: itemCode?.trim(), description: description.trim(), unitPrice: parseFloat(unitPrice) || 0, status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('additional-items');
    setAiDialog({ open: false, values: {} });
    toast({ title: aiDialog.id ? 'Updated' : 'Created' });
  };
  const aiDel = async () => {
    if (!aiDelete) return;
    const { error } = await deleteAdditionalItem(companyId, aiDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('additional-items');
    setAiDelete(null);
  };

  const ptSave = async () => {
    const { name, billing, status } = ptDialog.values;
    if (!name?.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertPaymentType(companyId, { id: ptDialog.id, name: name.trim(), billing: billing?.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('payment-types');
    setPtDialog({ open: false, values: {} });
    toast({ title: ptDialog.id ? 'Updated' : 'Created' });
  };
  const ptDel = async () => {
    if (!ptDelete) return;
    const { error } = await deletePaymentType(companyId, ptDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('payment-types');
    setPtDelete(null);
  };

  const bkSave = async () => {
    const { name, accountNo, status } = bkDialog.values;
    if (!name?.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertBank(companyId, { id: bkDialog.id, name: name.trim(), accountNo: accountNo?.trim(), status: status ?? 'Active' });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('banks');
    setBkDialog({ open: false, values: {} });
    toast({ title: bkDialog.id ? 'Updated' : 'Created' });
  };
  const bkDel = async () => {
    if (!bkDelete) return;
    const { error } = await deleteBank(companyId, bkDelete.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidateTab('banks');
    setBkDelete(null);
  };

  const isLoading = finCosQuery.isLoading || insCosQuery.isLoading || modelsQuery.isLoading || coloursQuery.isLoading
    || tinTypesQuery.isLoading || regFeesQuery.isLoading || roadTaxQuery.isLoading || inspFeesQuery.isLoading
    || handFeesQuery.isLoading || addItemsQuery.isLoading || payTypesQuery.isLoading || banksQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Master Data"
          description="Manage Finance Companies, Insurance Companies, Vehicle Models and Colours"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin/settings' }, { label: 'Master Data' }]}
        />
        <div className="h-10 w-full bg-muted rounded animate-pulse" />
        <TableSkeleton rows={5} cols={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Master Data"
        description="Manage Finance Companies, Insurance Companies, Vehicle Models and Colours"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin/settings' }, { label: 'Master Data' }]}
      />

      <Tabs value={tab} onValueChange={onTabChange}>
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

        <TabsContent value="finance" className="mt-4">
          <MasterTable
            rows={finCosQuery.data ?? []}
            columns={[
              { key: 'code', label: 'Code', render: row => <span className="font-mono font-semibold">{row.code}</span> },
              { key: 'name', label: 'Name' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.code}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<FinanceCompany>[]}
            onAdd={() => setFcDialog({ open: true, values: {} })}
            onEdit={r => setFcDialog({ open: true, id: r.id, values: { code: r.code, name: r.name } })}
            onDelete={r => setFcDelete(r)}
            addLabel="Add Finance Co"
            searchPlaceholder="Search finance companies..."
            emptyMessage="No finance companies match your search."
          />
          <RecordDialog open={fcDialog.open} onClose={() => setFcDialog({ open: false, values: {} })} title={fcDialog.id ? 'Edit Finance Company' : 'Add Finance Company'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. MAY' }, { key: 'name', label: 'Name *', hint: 'e.g. Maybank Islamic' }]}
            values={fcDialog.values} onChange={(k, v) => setFcDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={fcSave} saving={saving} />
          {fcDelete && <ConfirmDelete name={`${fcDelete.code} – ${fcDelete.name}`} onConfirm={fcDel} onCancel={() => setFcDelete(null)} />}
        </TabsContent>

        <TabsContent value="insurance" className="mt-4">
          <MasterTable
            rows={insCosQuery.data ?? []}
            columns={[
              { key: 'code', label: 'Code', render: row => <span className="font-mono font-semibold">{row.code}</span> },
              { key: 'name', label: 'Name' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.code}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<InsuranceCompany>[]}
            onAdd={() => setIcDialog({ open: true, values: {} })}
            onEdit={r => setIcDialog({ open: true, id: r.id, values: { code: r.code, name: r.name } })}
            onDelete={r => setIcDelete(r)}
            addLabel="Add Insurance Co"
            searchPlaceholder="Search insurance companies..."
            emptyMessage="No insurance companies match your search."
          />
          <RecordDialog open={icDialog.open} onClose={() => setIcDialog({ open: false, values: {} })} title={icDialog.id ? 'Edit Insurance Company' : 'Add Insurance Company'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. AIA' }, { key: 'name', label: 'Name *', hint: 'e.g. AIA Insurance' }]}
            values={icDialog.values} onChange={(k, v) => setIcDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={icSave} saving={saving} />
          {icDelete && <ConfirmDelete name={`${icDelete.code} – ${icDelete.name}`} onConfirm={icDel} onCancel={() => setIcDelete(null)} />}
        </TabsContent>

        <TabsContent value="models" className="mt-4">
          <MasterTable
            rows={modelsQuery.data ?? []}
            columns={[
              { key: 'code', label: 'Code', render: row => <span className="font-mono font-semibold">{row.code}</span> },
              { key: 'name', label: 'Name' },
              { key: 'basePrice', label: 'Base Price (RM)' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.code}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<VehicleModel>[]}
            onAdd={() => setMdDialog({ open: true, values: {} })}
            onEdit={r => setMdDialog({ open: true, id: r.id, values: { code: r.code, name: r.name, basePrice: String(r.basePrice ?? '') } })}
            onDelete={r => setMdDelete(r)}
            addLabel="Add Model"
            searchPlaceholder="Search models..."
            emptyMessage="No models match your search."
          />
          <RecordDialog open={mdDialog.open} onClose={() => setMdDialog({ open: false, values: {} })} title={mdDialog.id ? 'Edit Model' : 'Add Model'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. MYVI' }, { key: 'name', label: 'Name *', hint: 'e.g. Perodua Myvi' }, { key: 'basePrice', label: 'Base Price (RM)', type: 'number', hint: 'e.g. 45000' }]}
            values={mdDialog.values} onChange={(k, v) => setMdDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={mdSave} saving={saving} />
          {mdDelete && <ConfirmDelete name={`${mdDelete.code} – ${mdDelete.name}`} onConfirm={mdDel} onCancel={() => setMdDelete(null)} />}
        </TabsContent>

        <TabsContent value="colours" className="mt-4">
          <MasterTable
            rows={coloursQuery.data ?? []}
            columns={[
              { key: 'code', label: 'Code', render: row => <span className="font-mono font-semibold">{row.code}</span> },
              { key: 'name', label: 'Name' },
              { key: 'hex', label: 'Hex Color' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.code}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<VehicleColour>[]}
            onAdd={() => setClDialog({ open: true, values: {} })}
            onEdit={r => setClDialog({ open: true, id: r.id, values: { code: r.code, name: r.name, hex: r.hex ?? '' } })}
            onDelete={r => setClDelete(r)}
            addLabel="Add Colour"
            searchPlaceholder="Search colours..."
            emptyMessage="No colours match your search."
          />
          <RecordDialog open={clDialog.open} onClose={() => setClDialog({ open: false, values: {} })} title={clDialog.id ? 'Edit Colour' : 'Add Colour'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. WHT' }, { key: 'name', label: 'Name *', hint: 'e.g. Polar White' }, { key: 'hex', label: 'Hex Color', hint: '#FFFFFF' }]}
            values={clDialog.values} onChange={(k, v) => setClDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={clSave} saving={saving} />
          {clDelete && <ConfirmDelete name={`${clDelete.code} – ${clDelete.name}`} onConfirm={clDel} onCancel={() => setClDelete(null)} />}
        </TabsContent>

        <TabsContent value="tin" className="mt-4">
          <MasterTable
            rows={tinTypesQuery.data ?? []}
            columns={[
              { key: 'code', label: 'Code', render: row => <span className="font-mono font-semibold">{row.code}</span> },
              { key: 'name', label: 'Name' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.code}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<TinType>[]}
            onAdd={() => setTtDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setTtDialog({ open: true, id: r.id, values: { code: r.code, name: r.name, status: r.status } })}
            onDelete={r => setTtDelete(r)}
            addLabel="Add TIN Type"
            searchPlaceholder="Search TIN types..."
            emptyMessage="No TIN types match your search."
          />
          <RecordDialog open={ttDialog.open} onClose={() => setTtDialog({ open: false, values: {} })} title={ttDialog.id ? 'Edit TIN Type' : 'Add TIN Type'}
            fields={[{ key: 'code', label: 'Code *', hint: 'e.g. IND' }, { key: 'name', label: 'Name *', hint: 'e.g. Individual' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={ttDialog.values} onChange={(k, v) => setTtDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={ttSave} saving={saving} />
          {ttDelete && <ConfirmDelete name={`${ttDelete.code} – ${ttDelete.name}`} onConfirm={ttDel} onCancel={() => setTtDelete(null)} />}
        </TabsContent>

        <TabsContent value="regfee" className="mt-4">
          <MasterTable
            rows={regFeesQuery.data ?? []}
            columns={[
              { key: 'description', label: 'Description' },
              { key: 'price', label: 'Price (RM)' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.description}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.description}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<RegistrationFee>[]}
            onAdd={() => setRfDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setRfDialog({ open: true, id: r.id, values: { description: r.description, price: String(r.price), status: r.status } })}
            onDelete={r => setRfDelete(r)}
            addLabel="Add Fee"
            searchPlaceholder="Search registration fees..."
            emptyMessage="No registration fees match your search."
          />
          <RecordDialog open={rfDialog.open} onClose={() => setRfDialog({ open: false, values: {} })} title={rfDialog.id ? 'Edit Registration Fee' : 'Add Registration Fee'}
            fields={[{ key: 'description', label: 'Description *', hint: 'e.g. JPJ Registration' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={rfDialog.values} onChange={(k, v) => setRfDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={rfSave} saving={saving} />
          {rfDelete && <ConfirmDelete name={rfDelete.description} onConfirm={rfDel} onCancel={() => setRfDelete(null)} />}
        </TabsContent>

        <TabsContent value="roadtax" className="mt-4">
          <MasterTable
            rows={roadTaxQuery.data ?? []}
            columns={[
              { key: 'description', label: 'Description' },
              { key: 'price', label: 'Price (RM)' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.description}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.description}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<RoadTaxFee>[]}
            onAdd={() => setRtDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setRtDialog({ open: true, id: r.id, values: { description: r.description, price: String(r.price), status: r.status } })}
            onDelete={r => setRtDelete(r)}
            addLabel="Add Fee"
            searchPlaceholder="Search road tax fees..."
            emptyMessage="No road tax fees match your search."
          />
          <RecordDialog open={rtDialog.open} onClose={() => setRtDialog({ open: false, values: {} })} title={rtDialog.id ? 'Edit Road Tax Fee' : 'Add Road Tax Fee'}
            fields={[{ key: 'description', label: 'Description *' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={rtDialog.values} onChange={(k, v) => setRtDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={rtSave} saving={saving} />
          {rtDelete && <ConfirmDelete name={rtDelete.description} onConfirm={rtDel} onCancel={() => setRtDelete(null)} />}
        </TabsContent>

        <TabsContent value="inspfee" className="mt-4">
          <MasterTable
            rows={inspFeesQuery.data ?? []}
            columns={[
              { key: 'itemCode', label: 'Item Code', render: row => <span className="font-mono">{row.itemCode ?? '-'}</span> },
              { key: 'description', label: 'Description' },
              { key: 'price', label: 'Price (RM)' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.description}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.description}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<InspectionFee>[]}
            onAdd={() => setIfDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setIfDialog({ open: true, id: r.id, values: { itemCode: r.itemCode ?? '', description: r.description, price: String(r.price), status: r.status } })}
            onDelete={r => setIfDelete(r)}
            addLabel="Add Fee"
            searchPlaceholder="Search inspection fees..."
            emptyMessage="No inspection fees match your search."
          />
          <RecordDialog open={ifDialog.open} onClose={() => setIfDialog({ open: false, values: {} })} title={ifDialog.id ? 'Edit Inspection Fee' : 'Add Inspection Fee'}
            fields={[{ key: 'itemCode', label: 'Item Code', hint: 'Optional code' }, { key: 'description', label: 'Description *' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={ifDialog.values} onChange={(k, v) => setIfDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={ifSave} saving={saving} />
          {ifDelete && <ConfirmDelete name={ifDelete.description} onConfirm={ifDel} onCancel={() => setIfDelete(null)} />}
        </TabsContent>

        <TabsContent value="handfee" className="mt-4">
          <MasterTable
            rows={handFeesQuery.data ?? []}
            columns={[
              { key: 'itemCode', label: 'Item Code', render: row => <span className="font-mono">{row.itemCode ?? '-'}</span> },
              { key: 'description', label: 'Description' },
              { key: 'price', label: 'Price (RM)' },
              { key: 'billing', label: 'Billing' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.description}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.description}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<HandlingFee>[]}
            onAdd={() => setHfDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setHfDialog({ open: true, id: r.id, values: { itemCode: r.itemCode ?? '', description: r.description, price: String(r.price), billing: r.billing ?? '', status: r.status } })}
            onDelete={r => setHfDelete(r)}
            addLabel="Add Fee"
            searchPlaceholder="Search handling fees..."
            emptyMessage="No handling fees match your search."
          />
          <RecordDialog open={hfDialog.open} onClose={() => setHfDialog({ open: false, values: {} })} title={hfDialog.id ? 'Edit Handling Fee' : 'Add Handling Fee'}
            fields={[{ key: 'itemCode', label: 'Item Code' }, { key: 'description', label: 'Description *' }, { key: 'price', label: 'Price (RM)', type: 'number' }, { key: 'billing', label: 'Billing', hint: 'Yes / No' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={hfDialog.values} onChange={(k, v) => setHfDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={hfSave} saving={saving} />
          {hfDelete && <ConfirmDelete name={hfDelete.description} onConfirm={hfDel} onCancel={() => setHfDelete(null)} />}
        </TabsContent>

        <TabsContent value="additems" className="mt-4">
          <MasterTable
            rows={addItemsQuery.data ?? []}
            columns={[
              { key: 'itemCode', label: 'Item Code', render: row => <span className="font-mono">{row.itemCode ?? '-'}</span> },
              { key: 'description', label: 'Description' },
              { key: 'unitPrice', label: 'Unit Price (RM)' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.description}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.description}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<AdditionalItem>[]}
            onAdd={() => setAiDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setAiDialog({ open: true, id: r.id, values: { itemCode: r.itemCode ?? '', description: r.description, unitPrice: String(r.unitPrice), status: r.status } })}
            onDelete={r => setAiDelete(r)}
            addLabel="Add Product"
            searchPlaceholder="Search products..."
            emptyMessage="No products match your search."
          />
          <RecordDialog open={aiDialog.open} onClose={() => setAiDialog({ open: false, values: {} })} title={aiDialog.id ? 'Edit Other Product' : 'Add Other Product'}
            fields={[{ key: 'itemCode', label: 'Item Code' }, { key: 'description', label: 'Description *' }, { key: 'unitPrice', label: 'Unit Price (RM)', type: 'number' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={aiDialog.values} onChange={(k, v) => setAiDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={aiSave} saving={saving} />
          {aiDelete && <ConfirmDelete name={aiDelete.description} onConfirm={aiDel} onCancel={() => setAiDelete(null)} />}
        </TabsContent>

        <TabsContent value="paytype" className="mt-4">
          <MasterTable
            rows={payTypesQuery.data ?? []}
            columns={[
              { key: 'name', label: 'Payment Type' },
              { key: 'billing', label: 'Billing' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<PaymentType>[]}
            onAdd={() => setPtDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setPtDialog({ open: true, id: r.id, values: { name: r.name, billing: r.billing ?? '', status: r.status } })}
            onDelete={r => setPtDelete(r)}
            addLabel="Add Type"
            searchPlaceholder="Search payment types..."
            emptyMessage="No payment types match your search."
          />
          <RecordDialog open={ptDialog.open} onClose={() => setPtDialog({ open: false, values: {} })} title={ptDialog.id ? 'Edit Payment Type' : 'Add Payment Type'}
            fields={[{ key: 'name', label: 'Name *', hint: 'e.g. Cash' }, { key: 'billing', label: 'Billing', hint: 'Yes / No' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={ptDialog.values} onChange={(k, v) => setPtDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={ptSave} saving={saving} />
          {ptDelete && <ConfirmDelete name={ptDelete.name} onConfirm={ptDel} onCancel={() => setPtDelete(null)} />}
        </TabsContent>

        <TabsContent value="banks" className="mt-4">
          <MasterTable
            rows={banksQuery.data ?? []}
            columns={[
              { key: 'name', label: 'Bank Name' },
              { key: 'accountNo', label: 'Account No.' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions', sortable: false, className: 'text-right', render: row => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)} aria-label={`Edit ${row.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${row.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )},
            ] as StandardTableColumn<BankRecord>[]}
            onAdd={() => setBkDialog({ open: true, values: { status: 'Active' } })}
            onEdit={r => setBkDialog({ open: true, id: r.id, values: { name: r.name, accountNo: r.accountNo ?? '', status: r.status } })}
            onDelete={r => setBkDelete(r)}
            addLabel="Add Bank"
            searchPlaceholder="Search banks..."
            emptyMessage="No banks match your search."
          />
          <RecordDialog open={bkDialog.open} onClose={() => setBkDialog({ open: false, values: {} })} title={bkDialog.id ? 'Edit Bank' : 'Add Bank'}
            fields={[{ key: 'name', label: 'Bank Name *', hint: 'e.g. Maybank Berhad' }, { key: 'accountNo', label: 'Account No.', hint: 'e.g. 5621-1234-5678' }, { key: 'status', label: 'Status', hint: 'Active / Inactive' }]}
            values={bkDialog.values} onChange={(k, v) => setBkDialog(d => ({ ...d, values: { ...d.values, [k]: v } }))} onSave={bkSave} saving={saving} />
          {bkDelete && <ConfirmDelete name={bkDelete.name} onConfirm={bkDel} onCancel={() => setBkDelete(null)} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
