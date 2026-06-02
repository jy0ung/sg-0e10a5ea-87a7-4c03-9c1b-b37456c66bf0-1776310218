import React from 'react';
import type { AppRole } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

/**
 * Route-level guard that renders children only when the current user
 * holds one of the required shared app roles. RLS remains authoritative;
 * this guard only keeps unsupported HRMS surfaces out of the UI path.
 */
export function RequireRole({ roles, children }: { roles: readonly AppRole[]; children: React.ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) return <UnauthorizedAccess />;
  return <>{children}</>;
}
