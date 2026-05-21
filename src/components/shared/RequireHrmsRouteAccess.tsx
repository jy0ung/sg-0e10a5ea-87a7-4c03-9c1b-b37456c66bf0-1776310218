import React from 'react';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import type { HrmsRouteAccessKey } from '@/lib/hrms/access';

export function RequireHrmsRouteAccess({
  access,
  children,
}: {
  access: HrmsRouteAccessKey;
  children: React.ReactNode;
}) {
  const hrmsAccess = useHrmsAccess();

  if (hrmsAccess.loading) return <PageSpinner />;
  if (!hrmsAccess.canAccessRoute(access)) return <UnauthorizedAccess />;
  return <>{children}</>;
}
