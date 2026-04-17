import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
}

interface AuthContextType {
  user: Profile | null;
  session: Session | null;
  isAuthenticated: boolean;
  loading: boolean;
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

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        loggingService.error('Error fetching profile', { error }, 'AuthContext');
        // Create minimal profile if it doesn't exist
        if (error.code === 'PGRST116') {
          setProfile({
            id: userId,
            email: '',
            name: 'User',
            role: 'analyst',
            company_id: 'default',
            access_scope: 'self',
          });
        }
      } else if (data) {
        const p = data as unknown as Profile;
        setProfile(p);
        loggingService.setUserId(p.id);
      }
    } catch (err) {
      loggingService.error('Unexpected error fetching profile', { error: err }, 'AuthContext');
      // Set minimal profile to prevent app from breaking
      setProfile({
        id: userId,
        email: '',
        name: 'User',
        role: 'analyst',
        company_id: 'default',
        access_scope: 'self',
      });
    }
  }, []);

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
    loggingService.clearUserId();
    setProfile(null);
    setSession(null);
  }, []);

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

  return (
    <AuthContext.Provider value={{
      user: profile,
      session,
      isAuthenticated: !!session && !!profile,
      loading,
      login,
      logout,
      hasRole,
      refreshProfile,
    }}>
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
