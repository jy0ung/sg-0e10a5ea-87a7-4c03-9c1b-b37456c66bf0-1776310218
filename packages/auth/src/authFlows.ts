import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@flc/supabase/client';

export const invalidResetLinkMessage = 'Invalid or expired reset link. Request a new password reset email and try again.';
export const expiredResetLinkMessage = 'This reset link is invalid or has expired. Request a new password reset email and use the newest link.';
export const resetLinkTimeoutMessage = 'We could not validate this reset link. Check your connection and request a new password reset email if the problem continues.';

const authOperationTimeoutMs = 8000;

export type AuthCallbackParams = {
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

export interface InviteInitializationResult {
  ok: boolean;
  email?: string;
  name?: string;
  error?: string;
}

export interface PasswordRecoveryInitializationResult {
  ok: boolean;
  error?: string;
}

export function getAuthCallbackParams(location: Pick<Location, 'hash' | 'search'>): AuthCallbackParams {
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(location.search);

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
}

function getAuthErrorMessage(error: AuthErrorLike | null | undefined) {
  if (!error) return invalidResetLinkMessage;
  if (error.code === 'otp_expired' || /expired/i.test(error.message ?? '')) return expiredResetLinkMessage;
  if (error.message) return error.message;
  return invalidResetLinkMessage;
}

export function getCallbackErrorMessage(params: AuthCallbackParams) {
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

export function isRecoverySession(session: Session | null) {
  const payload = session?.access_token ? decodeJwtPayload(session.access_token) : null;
  return Array.isArray(payload?.amr) && payload.amr.some((entry) => entry.method === 'recovery');
}

function userToInviteResult(user: User | null): InviteInitializationResult {
  if (!user) {
    return {
      ok: false,
      error: 'Could not verify your invitation. Please ask your administrator to resend it.',
    };
  }

  return {
    ok: true,
    email: user.email || '',
    name: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '',
  };
}

export async function initializeInviteSignup(params: AuthCallbackParams): Promise<InviteInitializationResult> {
  const { type, accessToken, refreshToken, tokenHash, code } = params;
  const callbackType = type || ((code || tokenHash) ? 'invite' : null);
  const isInviteCallback =
    (callbackType === 'invite' || callbackType === 'signup' || callbackType === 'magiclink') &&
    !!(accessToken || tokenHash || code);

  if (!isInviteCallback) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return userToInviteResult(session.user);
    return {
      ok: false,
      error: 'Invalid or expired invitation link. Please ask your administrator to resend the invitation.',
    };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return {
        ok: false,
        error: 'Invalid or expired invitation link. Please ask your administrator to resend the invitation.',
      };
    }
  }

  if (tokenHash && callbackType) {
    const { error } = await supabase.auth.verifyOtp({
      type: callbackType as 'invite' | 'signup' | 'magiclink',
      token_hash: tokenHash,
    });
    if (error) {
      return {
        ok: false,
        error: 'Invalid or expired invitation link. Please ask your administrator to resend the invitation.',
      };
    }
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return {
        ok: false,
        error: 'Invalid or expired invitation link. Please ask your administrator to resend the invitation.',
      };
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  return userToInviteResult(user);
}

export async function updateInvitedUserPasswordAndMetadata(input: { password: string; name: string }): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({
    password: input.password,
    data: { name: input.name },
  });
  return { error: error?.message ?? null };
}

export async function getCurrentAuthUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOutAuthSession(): Promise<void> {
  await supabase.auth.signOut();
}

export async function initializePasswordRecovery(params: AuthCallbackParams): Promise<PasswordRecoveryInitializationResult> {
  const { type, accessToken, refreshToken, tokenHash, code } = params;
  const callbackErrorMessage = getCallbackErrorMessage(params);

  if (callbackErrorMessage) {
    return { ok: false, error: callbackErrorMessage };
  }

  const hasSessionTokens = !!(accessToken && refreshToken);
  const isRecoveryCallback = type === 'recovery' || (!type && !!(code || tokenHash || hasSessionTokens));
  const hasRecoveryCallback = isRecoveryCallback && !!(hasSessionTokens || tokenHash || code);

  if (!hasRecoveryCallback) {
    const { data: { session }, error } = await withTimeout(supabase.auth.getSession());
    if (!error && isRecoverySession(session)) return { ok: true };
    return { ok: false, error: invalidResetLinkMessage };
  }

  if (code) {
    const { error } = await withTimeout(supabase.auth.exchangeCodeForSession(code));
    if (error) return { ok: false, error: getAuthErrorMessage(error) };
  }

  if (tokenHash) {
    const { error } = await withTimeout(supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    }));
    if (error) return { ok: false, error: getAuthErrorMessage(error) };
  }

  if (accessToken && refreshToken) {
    const { error } = await withTimeout(supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    }));
    if (error) return { ok: false, error: getAuthErrorMessage(error) };
  }

  return { ok: true };
}

export function subscribeToPasswordRecovery(callback: () => void): { unsubscribe: () => void } {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback();
  });
  return subscription;
}

export async function updateRecoveryPassword(password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error?.message ?? null };
}
