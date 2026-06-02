import { supabase } from '@flc/supabase/client';
import type { Session } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface AuthError {
  message: string;
  code?: string;
}

const RESET_PASSWORD_PATH = 'reset-password';

function getBasePath() {
  const basePath = import.meta.env.BASE_URL || '/';
  const normalized = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return normalized === '/' ? '' : normalized.replace(/^\/+/, '');
}

const getConfiguredURL = () => {
  let url = import.meta.env.VITE_APP_URL
    ?? import.meta.env.VITE_VERCEL_URL
    ?? import.meta.env.NEXT_PUBLIC_VERCEL_URL
    ?? import.meta.env.VITE_SITE_URL
    ?? import.meta.env.NEXT_PUBLIC_SITE_URL
    ?? 'http://localhost:3000';

  if (!url) {
    url = 'http://localhost:3000';
  }

  url = url.startsWith('http') ? url : `https://${url}`;
  url = url.endsWith('/') ? url : `${url}/`;

  return url;
};

function getCurrentOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return new URL(getConfiguredURL()).origin;
}

export function getResetPasswordRedirectUrl() {
  return new URL(`${getBasePath()}${RESET_PASSWORD_PATH}`, `${getCurrentOrigin()}/`).toString();
}

export const authService = {
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user ? {
      id: user.id,
      email: user.email || '',
      user_metadata: user.user_metadata,
      created_at: user.created_at,
    } : null;
  },

  async getCurrentSession(): Promise<Session | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async signUp(email: string, password: string): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    void email;
    void password;
    return {
      user: null,
      error: { message: 'Self-service signup is disabled. Contact an administrator to create your account.' },
    };
  },

  async signIn(email: string, password: string): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { user: null, error: { message: error.message, code: error.status?.toString() } };
      }

      const authUser = data.user ? {
        id: data.user.id,
        email: data.user.email || '',
        user_metadata: data.user.user_metadata,
        created_at: data.user.created_at,
      } : null;

      return { user: authUser, error: null };
    } catch {
      return {
        user: null,
        error: { message: 'An unexpected error occurred during sign in' },
      };
    }
  },

  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch {
      return {
        error: { message: 'An unexpected error occurred during sign out' },
      };
    }
  },

  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetPasswordRedirectUrl(),
      });

      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch {
      return {
        error: { message: 'An unexpected error occurred during password reset' },
      };
    }
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
