import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { GitBranch, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useToast } from '@/hooks/use-toast';
import { branchSchema, type BranchFormValues } from '@/lib/forms';
import { deleteBranch, getBranches, upsertBranch } from '@/services/masterDataService';
import { BranchRecord } from '@/types';

const empty: BranchFormValues = { code: '', name: '', orSeries: '', vdoSeries: '' };

const fields: Array<{ name: keyof BranchFormValues; label: string; hint?: string }> = [
  { name: 'code', label: 'Branch Code', hint: 'e.g. KK' },
  { name: 'name', label: 'Branch Name', hint: 'e.g. Kota Kinabalu' },
  { name: 'orSeries', label: 'OR Series', hint: 'Invoice OR prefix' },
  { name: 'vdoSeries', label: 'VDO Series', hint: 'VDO number prefix' },
];

export default function BranchManagement() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: empty,
    mode: 'onChange',
  });

  const { data: branches = [], isPending: loading, isError, error, refetch } = useQuery({
    queryKey: ['branches', companyId],
    queryFn: async () => {
      const { data, error: branchError } = await getBranches(companyId);
      if (branchError) throw branchError;
      return data;
    },
    enabled: !!companyId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BranchRecord | null>(null);

  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;

  const openAdd = () => {
    setEditId(null);
    form.reset(empty);
    setDialogOpen(true);
  };

  const openEdit = (branch: BranchRecord) => {
    setEditId(branch.id);
    form.reset({
      code: branch.code,
      name: branch.name,
      orSeries: branch.orSeries ?? '',
      vdoSeries: branch.vdoSeries ?? '',
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

  const handleSave = async (values: BranchFormValues) => {
    setSaving(true);
    try {
      const { error: saveError } = await upsertBranch(companyId, {
        id: editId ?? undefined,
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        orSeries: values.orSeries?.trim() || undefined,
        vdoSeries: values.vdoSeries?.trim() || undefined,
      });
      if (saveError) {
        toast({ title: 'Error', description: saveError.message, variant: 'destructive' });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['branches', companyId] });
      handleDialogOpenChange(false);
      toast({ title: editId ? 'Branch updated' : 'Branch created' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error: deleteError } = await deleteBranch(companyId, deleteTarget.id);
    if (deleteError) {
      toast({ title: 'Error', description: deleteError.message, variant: 'destructive' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['branches', companyId] });
    setDeleteTarget(null);
    toast({ title: 'Branch deleted' });
  };

  const columns: StandardTableColumn<BranchRecord>[] = [
    { key: 'code', label: 'Code', render: branch => <span className="font-mono font-semibold">{branch.code}</span> },
    { key: 'name', label: 'Name' },
    {
      key: 'orSeries',
      label: 'OR Series',
      render: branch => <span className="font-mono text-xs text-muted-foreground">{branch.orSeries ?? '-'}</span>,
    },
    {
      key: 'vdoSeries',
      label: 'VDO Series',
      render: branch => <span className="font-mono text-xs text-muted-foreground">{branch.vdoSeries ?? '-'}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      className: 'text-right',
      render: branch => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(branch)} aria-label={`Edit ${branch.code}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(branch)}
            aria-label={`Delete ${branch.code}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const header = (
    <PageHeader
      title="Branch Management"
      description="Manage company branches and their document series"
      breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin/settings' }, { label: 'Branches' }]}
      actions={<Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Add Branch</Button>}
    />
  );

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        {header}
        <PageErrorState title="Unable to load branches" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {header}

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : branches.length === 0 ? (
        <EmptyState
          title="No branches configured"
          description="Create the first branch before assigning users, documents, or dashboard filters."
          icon={<GitBranch className="h-5 w-5" aria-hidden />}
          action={<Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Add Branch</Button>}
        />
      ) : (
        <StandardTable
          data={branches}
          columns={columns}
          searchPlaceholder="Search branches..."
          emptyMessage="No branches match your search."
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Branch' : 'Add Branch'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form id="branch-form" onSubmit={form.handleSubmit(handleSave)} className="space-y-3 py-2">
              {fields.map(({ name, label, hint }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input className="h-8 text-sm" placeholder={hint} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              ))}
            </form>
          </Form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="branch-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Branch</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete branch <strong>{deleteTarget?.code} - {deleteTarget?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
