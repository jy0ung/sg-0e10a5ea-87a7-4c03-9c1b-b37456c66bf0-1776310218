import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, AccessScope } from '@/types';
import { useLocation, Navigate } from 'react-router-dom';
import { loggingService } from '@/services/loggingService';
import { errorTrackingService } from '@/services/errorTrackingService';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  company_id: string;
  companyId: string;
  branch_id?: string | null;
  branchId?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  access_scope: AccessScope;
  accessScope: AccessScope;
  status?: 'active' | 'inactive' | 'resigned' | 'pending';
  employee_id?: string | null;
  employeeId?: string | null;
}

function rowToProfile(row: Record<string, unknown>): Profile {
  const companyId = String(row.company_id ?? '');
  const branchId = row.branch_id ? String(row.branch_id) : null;
  const avatarUrl = row.avatar_url ? String(row.avatar_url) : null;
  const accessScope = (row.access_scope as AccessScope) ?? 'self';
  const employeeId = row.employee_id ? String(row.employee_id) : null;

  return {
    id: String(row.id ?? ''),
    email: String(row.email ?? ''),
    name: String(row.name ?? ''),
    role: (row.role as AppRole) ?? 'analyst',
    company_id: companyId,
    companyId,
    branch_id: branchId,
    branchId,
    avatar_url: avatarUrl,
    avatarUrl,
    access_scope: accessScope,
    accessScope,
    status: row.status as Profile['status'],
    employee_id: employeeId,
    employeeId,
  };
}

interface AuthContextType {
  user: Profile | null;
  session: Session | null;
  isAuthenticated: boolean;
  loading: boolean;
  profileError: string | null;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  hasRole: (roles: AppRole[]) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const clearSessionArtifacts = useCallback(() => {
    setProfile(null);
    setSession(null);
    loggingService.clearUserId();
    errorTrackingService.clearUser();
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    // Signup / password-reset flows establish a short-lived session from an
    // invite or recovery token so the user can set their password. During
    // that window they may have no profile row yet (or a pending one) and we
    // MUST NOT sign them out — doing so kills the very session they need to
    // call auth.updateUser().
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const isOnboardingRoute = pathname === '/signup' || pathname === '/reset-password';
    const isPendingRoute = pathname === '/account-pending';

    // Helper: keep the session alive, clear profile, and send the user to
    // /account-pending. Admins will see them in User Management and activate
    // them; this avoids the login-loop they'd otherwise hit when AuthContext
    // signs them out repeatedly.
    const sendToPending = (reason: string) => {
      loggingService.warn(reason, { userId }, 'AuthContext');
      setProfile(null);
      setProfileError(null);
      if (typeof window !== 'undefined' && !isPendingRoute && !isOnboardingRoute) {
        window.location.replace('/account-pending');
      }
    };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        loggingService.error('Error fetching profile', { error }, 'AuthContext');
        if (isOnboardingRoute) {
          // Preserve the session so signup/reset can complete.
          return;
        }
        setProfileError('We could not load your account profile. Please contact your administrator.');
        await supabase.auth.signOut();
        clearSessionArtifacts();
        return;
      }

      if (!data) {
        // No profile row — the account was never provisioned by an admin.
        // Do NOT invent a synthetic profile; that would attach the session to
        // a fake tenant and defeat RLS scoping.
        if (isOnboardingRoute) {
          // User is mid-signup; profile will be created after they finish.
          return;
        }
        sendToPending('No profile row for user; sending to /account-pending');
        return;
      }

      const p = rowToProfile(data as Record<string, unknown>);

      if (!p.company_id || p.status === 'pending') {
        if (isOnboardingRoute) {
          // Pending profile is expected during signup completion.
          return;
        }
        sendToPending('Profile pending activation; sending to /account-pending');
        return;
      }

      if (p.status === 'inactive' || p.status === 'resigned') {
        setProfileError('Your account is no longer active. Please contact your administrator.');
        await supabase.auth.signOut();
        clearSessionArtifacts();
        return;
      }

      setProfileError(null);
      setProfile(p);
      loggingService.setUserId(p.id);
      errorTrackingService.setUser(p.id);
    } catch (err) {
      loggingService.error('Unexpected error fetching profile', { error: err }, 'AuthContext');
      setProfileError('Unexpected error loading your profile. Please sign in again.');
      await supabase.auth.signOut();
      clearSessionArtifacts();
    }
  }, [clearSessionArtifacts]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          // Keep loading true while the profile is being fetched so that
          // ProtectedRoute does not redirect before the profile arrives.
          setLoading(true);
          // Use setTimeout to avoid Supabase client deadlock
          setTimeout(() => {
            fetchProfile(newSession.user.id).finally(() => {
              setLoading(false);
            });
          }, 0);
        } else {
          clearSessionArtifacts();
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      if (existingSession?.user) {
        fetchProfile(existingSession.user.id).finally(() => {
          setLoading(false);
        });
      } else {
        clearSessionArtifacts();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [clearSessionArtifacts, fetchProfile]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message || null };
    } catch (err) {
      loggingService.error('Unexpected sign-in error', { error: err }, 'AuthContext');
      return { error: 'An unexpected error occurred during sign in' };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearSessionArtifacts();
    setProfileError(null);
  }, [clearSessionArtifacts]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  }, [session?.user, fetchProfile]);

  const hasRole = useCallback((roles: AppRole[]): boolean => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return true;
    return roles.includes(profile.role);
  }, [profile]);

  const contextValue = useMemo<AuthContextType>(() => ({
    user: profile,
    session,
    isAuthenticated: !!session && !!profile,
    loading,
    profileError,
    login,
    logout,
    hasRole,
    refreshProfile,
  }), [profile, session, loading, profileError, login, logout, hasRole, refreshProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

type RedirectTarget = string | ((pathname: string) => string);

function resolveRedirect(redirectTo: RedirectTarget, pathname: string): string {
  return typeof redirectTo === 'function' ? redirectTo(pathname) : redirectTo;
}

export function ProtectedRoute({
  children,
  redirectTo = '/login',
}: {
  children: React.ReactNode;
  redirectTo?: RedirectTarget;
}) {
  const { isAuthenticated, loading, session, profileError } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // A Supabase session alone is not enough for enterprise access. The user
  // must also have an active, company-scoped profile loaded from `profiles`;
  // otherwise pending/provisioning accounts can briefly navigate into the
  // shell during auth listener/profile-fetch races.
  if (session && !isAuthenticated && !profileError) {
    return <Navigate to="/account-pending" state={{ from: location }} replace />;
  }
  
  if (!isAuthenticated) {
    const target = resolveRedirect(redirectTo, location.pathname);
    return <Navigate to={target} state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
}
