/**
 * Auth barrel — re-exports from @flc/auth with app-local services wired in.
 * All consumers importing from '@/contexts/AuthContext' continue to work unchanged.
 */
import React from 'react';
import { AuthProvider as BaseAuthProvider } from '@flc/auth';
import { errorTrackingService, loggingService } from '@flc/platform-services';

// eslint-disable-next-line react-refresh/only-export-components
export { useAuth, ProtectedRoute } from '@flc/auth';
export type { Profile, AuthContextType, AuthLogger, AuthErrorTracker } from '@flc/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <BaseAuthProvider logger={loggingService} errorTracker={errorTrackingService}>
      {children}
    </BaseAuthProvider>
  );
}
