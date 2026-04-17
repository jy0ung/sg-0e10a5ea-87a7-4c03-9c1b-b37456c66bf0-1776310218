import React from 'react';
import { AppRole } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

/**
 * Route-level guard that renders children only when the current user
 * holds one of the required roles.  Falls back to <UnauthorizedAccess />.
 */
export function RequireRole({ roles, children }: { roles: AppRole[]; children: React.ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) return <UnauthorizedAccess />;
  return <>{children}</>;
}
