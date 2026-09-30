import { useEffect, useState } from 'react';
import {
  newDiagnosticMountId, recordMount, recordRoute,
  registerDiagnosticForm, setDiagnosticFormDirty, unregisterDiagnosticForm,
  type DiagnosticFormId,
} from '@/lib/lifecycleDiagnostics';

type Boundary = 'shell' | 'profile' | 'roles' | 'organization';

export function useDiagnosticMount(boundary: Boundary): string {
  const [mountId] = useState(newDiagnosticMountId);
  useEffect(() => {
    recordMount(boundary, mountId, true);
    return () => recordMount(boundary, mountId, false);
  }, [boundary, mountId]);
  return mountId;
}

export function useDiagnosticRoute(pathname: string, locationKey: string): void {
  useEffect(() => recordRoute(pathname, locationKey), [pathname, locationKey]);
}

export function useDiagnosticForm(formId: DiagnosticFormId, dirty: boolean, pageMountId: string): void {
  const [formMountId] = useState(newDiagnosticMountId);
  useEffect(() => {
    registerDiagnosticForm(formId, formMountId, pageMountId);
    return () => unregisterDiagnosticForm(formId, formMountId);
  }, [formId, formMountId, pageMountId]);
  useEffect(() => {
    setDiagnosticFormDirty(formId, formMountId, dirty);
  }, [formId, formMountId, dirty, pageMountId]);
}
