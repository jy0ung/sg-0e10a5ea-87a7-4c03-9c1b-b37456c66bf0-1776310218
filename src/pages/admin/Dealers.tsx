import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
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
import { dealerSchema, type DealerFormValues } from '@/lib/forms';
import { deleteDealer, getDealers, upsertDealer } from '@/services/masterDataService';
import { Dealer } from '@/types';

const empty: DealerFormValues = {
  name: '',
  accCode: '',
  companyRegNo: '',
  companyAddress: '',
  contactNo: '',
  email: '',
  status: 'Active',
};

const fields: Array<{ name: Exclude<keyof DealerFormValues, 'status'>; label: string; hint?: string }> = [
  { name: 'name', label: 'Name', hint: 'e.g. Best Motors Sdn Bhd' },
  { name: 'accCode', label: 'Acc. Code', hint: 'e.g. BM001' },
  { name: 'companyRegNo', label: 'Company Reg No', hint: 'e.g. 123456-A' },
  { name: 'companyAddress', label: 'Address' },
  { name: 'contactNo', label: 'Contact No', hint: 'e.g. 03-12345678' },
  { name: 'email', label: 'Email', hint: 'dealer@example.com' },
];

export default function Dealers() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<DealerFormValues>({
    resolver: zodResolver(dealerSchema),
    defaultValues: empty,
    mode: 'onChange',
  });

  const { data: dealers = [], isPending: loading, isError, error, refetch } = useQuery({
    queryKey: ['dealers', companyId],
    queryFn: async () => {
      const { data, error: dealerError } = await getDealers(companyId);
      if (dealerError) throw dealerError;
      return data;
    },
    enabled: !!companyId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Dealer | null>(null);

  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;

  const openAdd = () => {
    setEditId(null);
    form.reset(empty);
    setDialogOpen(true);
  };

  const openEdit = (dealer: Dealer) => {
    setEditId(dealer.id);
    form.reset({
      name: dealer.name,
      accCode: dealer.accCode ?? '',
      companyRegNo: dealer.companyRegNo ?? '',
      companyAddress: dealer.companyAddress ?? '',
      contactNo: dealer.contactNo ?? '',
      email: dealer.email ?? '',
      status: dealer.status,
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

  const handleSave = async (values: DealerFormValues) => {
    setSaving(true);
    try {
      const { error: saveError } = await upsertDealer(companyId, {
        id: editId ?? undefined,
        name: values.name.trim(),
        accCode: values.accCode?.trim() || undefined,
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
      await queryClient.invalidateQueries({ queryKey: ['dealers', companyId] });
      handleDialogOpenChange(false);
      toast({ title: editId ? 'Dealer updated' : 'Dealer created' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error: deleteError } = await deleteDealer(companyId, deleteTarget.id);
    if (deleteError) {
      toast({ title: 'Error', description: deleteError.message, variant: 'destructive' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['dealers', companyId] });
    setDeleteTarget(null);
    toast({ title: 'Dealer deleted' });
  };

  const columns: StandardTableColumn<Dealer>[] = [
    { key: 'name', label: 'Name', render: dealer => <span className="font-medium">{dealer.name}</span> },
    { key: 'accCode', label: 'Acc. Code', render: dealer => <span className="font-mono text-xs">{dealer.accCode ?? '-'}</span> },
    { key: 'companyRegNo', label: 'Company Reg No', render: dealer => dealer.companyRegNo ?? '-' },
    { key: 'contactNo', label: 'Contact No', render: dealer => dealer.contactNo ?? '-' },
    { key: 'email', label: 'Email', render: dealer => dealer.email ?? '-' },
    {
      key: 'status',
      label: 'Status',
      render: dealer => <Badge variant={dealer.status === 'Active' ? 'default' : 'secondary'}>{dealer.status}</Badge>,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      className: 'text-right',
      render: dealer => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(dealer)} aria-label={`Edit ${dealer.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(dealer)}
            aria-label={`Delete ${dealer.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const header = (
    <PageHeader
      title="Dealers"
      description="Manage authorised dealers and their accounts"
      breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin/settings' }, { label: 'Dealers' }]}
      actions={<Button size="sm" onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Add Dealer</Button>}
    />
  );

  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <PageErrorState title="Unable to load dealers" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : dealers.length === 0 ? (
        <EmptyState
          title="No dealers found"
          description="Add dealer accounts before creating dealer invoices or operational reports."
          icon={<Users className="h-5 w-5" aria-hidden />}
          action={<Button size="sm" onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Add Dealer</Button>}
        />
      ) : (
        <StandardTable
          data={dealers}
          columns={columns}
          searchPlaceholder="Search dealers..."
          emptyMessage="No dealers match your search."
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Dealer' : 'Add Dealer'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form id="dealer-form" onSubmit={form.handleSubmit(handleSave)} className="grid gap-4 py-2">
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
            <Button type="submit" form="dealer-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dealer</AlertDialogTitle>
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
