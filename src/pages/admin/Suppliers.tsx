import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useToast } from '@/hooks/use-toast';
import { supplierSchema, type SupplierFormValues } from '@/lib/forms';
import { deleteSupplier, getSuppliers, upsertSupplier } from '@/services/masterDataService';
import { Supplier } from '@/types';

const empty: SupplierFormValues = {
  name: '',
  code: '',
  companyRegNo: '',
  companyAddress: '',
  contactNo: '',
  email: '',
  status: 'Active',
};

const fields: Array<{ name: Exclude<keyof SupplierFormValues, 'status'>; label: string; hint?: string }> = [
  { name: 'name', label: 'Name', hint: 'e.g. Proton Edar Sdn Bhd' },
  { name: 'code', label: 'Code', hint: 'e.g. PE' },
  { name: 'companyRegNo', label: 'Company Reg No', hint: 'e.g. 123456-A' },
  { name: 'companyAddress', label: 'Address' },
  { name: 'contactNo', label: 'Contact No', hint: 'e.g. 03-12345678' },
  { name: 'email', label: 'Email', hint: 'supplier@example.com' },
];

export default function Suppliers() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: empty,
    mode: 'onChange',
  });

  const { data: suppliers = [], isPending: loading, isError, error, refetch } = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: async () => {
      const { data, error: supplierError } = await getSuppliers(companyId);
      if (supplierError) throw supplierError;
      return data;
    },
    enabled: !!companyId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;

  const openAdd = () => {
    setEditId(null);
    form.reset(empty);
    setDialogOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditId(supplier.id);
    form.reset({
      name: supplier.name,
      code: supplier.code ?? '',
      companyRegNo: supplier.companyRegNo ?? '',
      companyAddress: supplier.companyAddress ?? '',
      contactNo: supplier.contactNo ?? '',
      email: supplier.email ?? '',
      status: supplier.status,
    });
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditId(null);
      form.reset(empty);
    }
  };

  const handleSave = async (values: SupplierFormValues) => {
    setSaving(true);
    try {
      const { error: saveError } = await upsertSupplier(companyId, {
        id: editId ?? undefined,
        name: values.name.trim(),
        code: values.code?.trim() || undefined,
        companyRegNo: values.companyRegNo?.trim() || undefined,
        companyAddress: values.companyAddress?.trim() || undefined,
        contactNo: values.contactNo?.trim() || undefined,
        email: values.email?.trim() || undefined,
        status: values.status,
      });
      if (saveError) {
        toast({ title: 'Error', description: saveError.message, variant: 'destructive' });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['suppliers', companyId] });
      handleDialogOpenChange(false);
      toast({ title: editId ? 'Supplier updated' : 'Supplier created' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error: deleteError } = await deleteSupplier(companyId, deleteTarget.id);
    if (deleteError) {
      toast({ title: 'Error', description: deleteError.message, variant: 'destructive' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['suppliers', companyId] });
    setDeleteTarget(null);
    toast({ title: 'Supplier deleted' });
  };

  const columns: StandardTableColumn<Supplier>[] = [
    { key: 'name', label: 'Name', render: supplier => <span className="font-medium">{supplier.name}</span> },
    { key: 'code', label: 'Code', render: supplier => <span className="font-mono text-xs">{supplier.code ?? '-'}</span> },
    { key: 'companyRegNo', label: 'Company Reg No', render: supplier => supplier.companyRegNo ?? '-' },
    { key: 'contactNo', label: 'Contact No', render: supplier => supplier.contactNo ?? '-' },
    { key: 'email', label: 'Email', render: supplier => supplier.email ?? '-' },
    {
      key: 'status',
      label: 'Status',
      render: supplier => <Badge variant={supplier.status === 'Active' ? 'default' : 'secondary'}>{supplier.status}</Badge>,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      className: 'text-right',
      render: supplier => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(supplier)} aria-label={`Edit ${supplier.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(supplier)}
            aria-label={`Delete ${supplier.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const header = (
    <PageHeader
      title="Suppliers"
      description="Manage vehicle and parts suppliers"
      breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin/settings' }, { label: 'Suppliers' }]}
      actions={<Button size="sm" onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Add Supplier</Button>}
    />
  );

  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <PageErrorState title="Unable to load suppliers" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers found"
          description="Add suppliers before recording purchase invoices and procurement activity."
          icon={<Truck className="h-5 w-5" aria-hidden />}
          action={<Button size="sm" onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Add Supplier</Button>}
        />
      ) : (
        <StandardTable
          data={suppliers}
          columns={columns}
          searchPlaceholder="Search suppliers..."
          emptyMessage="No suppliers match your search."
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form id="supplier-form" onSubmit={form.handleSubmit(handleSave)} className="grid gap-4 py-2">
              {fields.map(({ name, label, hint }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input placeholder={hint} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="supplier-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
