import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getUserGroups, upsertUserGroup, deleteUserGroup } from '@/services/masterDataService';
import { UserGroup } from '@/types';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const userGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

type UserGroupFormValues = z.infer<typeof userGroupSchema>;

const empty: UserGroupFormValues = { name: '', status: 'Active' };

export default function UserGroups() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();

  const queryClient = useQueryClient();
  const { data: groups = [], isPending: loading, isError, error, refetch } = useQuery({
    queryKey: ['user-groups', companyId],
    queryFn: async () => { const { data } = await getUserGroups(companyId); return data; },
    enabled: !!companyId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const form = useForm<UserGroupFormValues>({
    resolver: zodResolver(userGroupSchema),
    defaultValues: empty,
    mode: 'onChange',
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserGroup | null>(null);

  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;

  const openAdd = () => {
    setEditId(null);
    form.reset(empty);
    setDialogOpen(true);
  };

  const openEdit = (g: UserGroup) => {
    setEditId(g.id);
    form.reset({ name: g.name, status: g.status });
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditId(null);
      form.reset(empty);
    }
  };

  const handleSave = async (values: UserGroupFormValues) => {
    setSaving(true);
    try {
      const { error: saveError } = await upsertUserGroup(companyId, { id: editId ?? undefined, name: values.name.trim(), status: values.status });
      if (saveError) {
        toast({ title: 'Error', description: saveError.message, variant: 'destructive' });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['user-groups', companyId] });
      handleDialogOpenChange(false);
      toast({ title: editId ? 'Group updated' : 'Group created' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error: deleteError } = await deleteUserGroup(companyId, deleteTarget.id);
    if (deleteError) {
      toast({ title: 'Error', description: deleteError.message, variant: 'destructive' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['user-groups', companyId] });
    setDeleteTarget(null);
    toast({ title: 'User group deleted' });
  };

  const columns: StandardTableColumn<UserGroup>[] = [
    { key: 'name', label: 'Group Name', render: group => <span className="font-medium">{group.name}</span> },
    {
      key: 'status',
      label: 'Status',
      render: group => <Badge variant={group.status === 'Active' ? 'default' : 'secondary'}>{group.status}</Badge>,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      className: 'text-right',
      render: group => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(group)} aria-label={`Edit user group ${group.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(group)}
            aria-label={`Delete user group ${group.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const header = (
    <PageHeader
      title="User Groups"
      description="Define groups for user access and permissions"
      breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin/settings' }, { label: 'User Groups' }]}
      actions={<Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Add Group</Button>}
    />
  );

  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <PageErrorState title="Unable to load user groups" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {loading ? (
        <TableSkeleton rows={5} cols={3} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No user groups found"
          description="Create user groups before assigning users to them."
          icon={<Users className="h-5 w-5" aria-hidden />}
          action={<Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Add Group</Button>}
        />
      ) : (
        <StandardTable
          data={groups}
          columns={columns}
          searchPlaceholder="Search user groups..."
          emptyMessage="No user groups match your search."
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Edit User Group' : 'Add User Group'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form id="user-group-form" onSubmit={form.handleSubmit(handleSave)} className="grid gap-4 py-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Sales Manager" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
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
            <Button type="submit" form="user-group-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Group</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
