import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, AccessScope } from '@/types';
import { useLocation, Navigate } from 'react-router-dom';
import { loggingService } from '@/services/loggingService';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  company_id: string;
  branch_id?: string | null;
  avatar_url?: string | null;
  access_scope: AccessScope;
  status?: 'active' | 'inactive' | 'resigned' | 'pending';
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
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        loggingService.error('Error fetching profile', { error }, 'AuthContext');
        setProfileError('We could not load your account profile. Please contact your administrator.');
        await supabase.auth.signOut();
        clearSessionArtifacts();
        return;
      }

      if (!data) {
        // No profile row — the account was never provisioned by an admin.
        // Do NOT invent a synthetic profile; that would attach the session to
        // a fake tenant and defeat RLS scoping.
        loggingService.warn('No profile row for user; signing out', { userId }, 'AuthContext');
        setProfileError('Your account has not been activated yet. Please contact your administrator.');
        await supabase.auth.signOut();
        clearSessionArtifacts();
        return;
      }

      const p = data as unknown as Profile;

      if (!p.company_id || p.status === 'pending') {
        setProfileError('Your account is pending activation by your administrator.');
        await supabase.auth.signOut();
        clearSessionArtifacts();
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
          setProfile(null);
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
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
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
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    const target = resolveRedirect(redirectTo, location.pathname);
    return <Navigate to={target} state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
}
