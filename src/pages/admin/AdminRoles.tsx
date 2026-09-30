import { useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { RoleManagementPanel } from '@/components/admin/RoleManagementPanel';
import { PageHeader } from '@/components/shared/PageHeader';
import { useBeforeUnloadWarning } from '@/hooks/useBeforeUnloadWarning';
import { useDiagnosticForm, useDiagnosticMount } from '@/hooks/useLifecycleDiagnostics';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AdminRoles() {
  const pageMountId = useDiagnosticMount('roles');
  const [dirty, setDirty] = useState(false);
  useDiagnosticForm('admin-roles', dirty, pageMountId);
  useBeforeUnloadWarning(dirty);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  return (
    <div className="space-y-6 motion-safe:animate-fade-in">
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved role changes</AlertDialogTitle>
            <AlertDialogDescription>The role matrix draft will be lost if you leave this page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay and save</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageHeader
        title="Roles & Permissions"
        description="Review system roles and manage their company section access."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin' }, { label: 'Roles & Permissions' }]}
      />
      <RoleManagementPanel embedded onDirtyChange={setDirty} />
    </div>
  );
}
