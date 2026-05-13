import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { brandAssets, brandName } from '@/config/brand';

const invalidResetLinkMessage = 'Invalid or expired reset link. Request a new password reset email and try again.';
const expiredResetLinkMessage = 'This reset link is invalid or has expired. Request a new password reset email and use the newest link.';
const resetLinkTimeoutMessage = 'We could not validate this reset link. Check your connection and request a new password reset email if the problem continues.';
const authOperationTimeoutMs = 8000;

type AuthCallbackParams = {
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenHash: string | null;
  code: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

function getAuthErrorMessage(error: AuthErrorLike | null | undefined) {
  if (!error) return invalidResetLinkMessage;
  if (error.code === 'otp_expired' || /expired/i.test(error.message ?? '')) return expiredResetLinkMessage;
  if (error.message) return error.message;
  return invalidResetLinkMessage;
}

function getCallbackErrorMessage(params: AuthCallbackParams) {
  if (!params.error && !params.errorCode && !params.errorDescription) return '';
  if (params.errorCode === 'otp_expired') return expiredResetLinkMessage;
  if (params.errorDescription) return params.errorDescription.replace(/\+/g, ' ');
  return invalidResetLinkMessage;
}

function withTimeout<T>(operation: Promise<T>, timeoutMessage = resetLinkTimeoutMessage): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), authOperationTimeoutMs);
  });

  return Promise.race([operation, timeout]).finally(() => clearTimeout(timeoutId));
}

function decodeJwtPayload(accessToken: string) {
  const [, payload] = accessToken.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=');
    return JSON.parse(globalThis.atob(padded)) as { amr?: Array<{ method?: string }> };
  } catch {
    return null;
  }
}

function isRecoverySession(session: Session | null) {
  const payload = session?.access_token ? decodeJwtPayload(session.access_token) : null;
  return Array.isArray(payload?.amr) && payload.amr.some((entry) => entry.method === 'recovery');
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    let isMounted = true;

    const getCallbackParams = (): AuthCallbackParams => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const searchParams = new URLSearchParams(window.location.search);

      return {
        type: hashParams.get('type') || searchParams.get('type'),
        accessToken: hashParams.get('access_token') || searchParams.get('access_token'),
        refreshToken: hashParams.get('refresh_token') || searchParams.get('refresh_token'),
        tokenHash: hashParams.get('token_hash') || searchParams.get('token_hash'),
        code: hashParams.get('code') || searchParams.get('code'),
        error: hashParams.get('error') || searchParams.get('error'),
        errorCode: hashParams.get('error_code') || searchParams.get('error_code'),
        errorDescription: hashParams.get('error_description') || searchParams.get('error_description'),
      };
    };

    const initializeRecovery = async () => {
      const params = getCallbackParams();
      const { type, accessToken, refreshToken, tokenHash, code } = params;
      const callbackErrorMessage = getCallbackErrorMessage(params);

      if (callbackErrorMessage) {
        if (isMounted) {
          setError(callbackErrorMessage);
          setInitializing(false);
        }
        return;
      }

      // Supabase PKCE email links verify at /auth/v1/verify and then redirect
      // back with ?code=...; that redirect does not always preserve type.
      // Since this page is only for password recovery, a bare code/token_hash
      // here is treated as a recovery callback.
      const hasSessionTokens = !!(accessToken && refreshToken);
      const isRecoveryCallback = type === 'recovery' || (!type && !!(code || tokenHash || hasSessionTokens));
      const hasRecoveryCallback = isRecoveryCallback && !!(hasSessionTokens || tokenHash || code);

      if (!hasRecoveryCallback) {
        const { data: { session }, error: sessionError } = await withTimeout(supabase.auth.getSession());
        if (!sessionError && isRecoverySession(session)) {
          if (isMounted) {
            setIsRecovery(true);
            setError('');
            setInitializing(false);
          }
          return;
        }

        if (isMounted) {
          setError(invalidResetLinkMessage);
          setInitializing(false);
        }
        return;
      }

      if (code) {
        const { error: codeError } = await withTimeout(supabase.auth.exchangeCodeForSession(code));
        if (codeError) {
          if (isMounted) {
            setError(getAuthErrorMessage(codeError));
            setInitializing(false);
          }
          return;
        }
      }

      if (tokenHash) {
        const { error: tokenError } = await withTimeout(supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        }));

        if (tokenError) {
          if (isMounted) {
            setError(getAuthErrorMessage(tokenError));
            setInitializing(false);
          }
          return;
        }
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await withTimeout(supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }));

        if (sessionError) {
          if (isMounted) {
            setError(getAuthErrorMessage(sessionError));
            setInitializing(false);
          }
          return;
        }
      }

      if (isMounted) {
        setIsRecovery(true);
        setInitializing(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && isMounted) {
        setIsRecovery(true);
        setError('');
        setInitializing(false);
      }
    });

    void initializeRecovery().catch((err) => {
      if (isMounted) {
        setError(err instanceof Error ? err.message : resetLinkTimeoutMessage);
        setInitializing(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (data: ResetPasswordFormData) => {
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: data.password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center executive-gradient">
        <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center executive-gradient">
        <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center">
          <p className="text-muted-foreground">{error || 'Invalid or expired reset link.'}</p>
          <Button className="mt-4" onClick={() => navigate('/login')}>
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center executive-gradient">
      <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <img src={brandAssets.compactLogo} alt="Fook Loi Group" className="h-11 w-11 rounded-md object-contain" />
            <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
          </div>
          <p className="text-muted-foreground text-sm">Set your new password</p>
        </div>

        {success ? (
          <div className="text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="text-primary text-sm font-medium">Password updated successfully!</p>
            <p className="text-muted-foreground text-xs">Redirecting to sign in...</p>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">New Password</Label>
              <Input
                id="password"
                type="password"
                {...form.register('password')}
                className={form.formState.errors.password ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Enter new password"
              />
              {form.formState.errors.password && (
                <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-foreground">Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                {...form.register('confirmPassword')}
                className={form.formState.errors.confirmPassword ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Confirm new password"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-destructive text-xs">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !form.formState.isValid}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating password...</>
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
