import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthCallbackParams,
  initializeInviteSignup,
  initializePasswordRecovery,
  isRecoverySession,
  subscribeToPasswordRecovery,
  updateInvitedUserPasswordAndMetadata,
  updateRecoveryPassword,
} from './authFlows';
import { supabase } from '@flc/supabase/client';

vi.mock('@flc/supabase/client', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      setSession: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
}));

function makeAccessToken(method: string) {
  const payload = Buffer.from(JSON.stringify({ amr: [{ method }] })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('authFlows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com',
          user_metadata: { name: 'User One' },
        },
      },
      error: null,
    } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as never);
    vi.mocked(supabase.auth.setSession).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({ error: null } as never);
  });

  it('parses auth callback params from hash and search strings', () => {
    expect(getAuthCallbackParams({
      hash: '#type=invite&token_hash=abc',
      search: '?code=ignored&error_code=otp_expired',
    } as Location)).toEqual(expect.objectContaining({
      type: 'invite',
      tokenHash: 'abc',
      code: 'ignored',
      errorCode: 'otp_expired',
    }));
  });

  it('initializes invite signup from a bare PKCE code', async () => {
    const result = await initializeInviteSignup({
      type: null,
      accessToken: null,
      refreshToken: null,
      tokenHash: null,
      code: 'invite-code',
      error: null,
      errorCode: null,
      errorDescription: null,
    });

    expect(result).toEqual({ ok: true, email: 'user@example.com', name: 'User One' });
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('invite-code');
  });

  it('initializes recovery from an already-consumed recovery session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: makeAccessToken('recovery') } },
      error: null,
    } as never);

    await expect(initializePasswordRecovery({
      type: null,
      accessToken: null,
      refreshToken: null,
      tokenHash: null,
      code: null,
      error: null,
      errorCode: null,
      errorDescription: null,
    })).resolves.toEqual({ ok: true });
  });

  it('recognizes recovery JWT sessions', () => {
    expect(isRecoverySession({ access_token: makeAccessToken('recovery') } as never)).toBe(true);
    expect(isRecoverySession({ access_token: makeAccessToken('password') } as never)).toBe(false);
  });

  it('wraps update operations with string error contracts', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({ error: { message: 'weak password' } } as never);
    await expect(updateRecoveryPassword('abc')).resolves.toEqual({ error: 'weak password' });

    await updateInvitedUserPasswordAndMetadata({ password: 'better-password', name: 'User One' });
    expect(supabase.auth.updateUser).toHaveBeenLastCalledWith({
      password: 'better-password',
      data: { name: 'User One' },
    });
  });

  it('subscribes only to password recovery auth events', () => {
    let authCallback: ((event: string) => void) | null = null;
    const unsubscribe = vi.fn();
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback as (event: string) => void;
      return { data: { subscription: { unsubscribe } } } as never;
    });
    const onRecovery = vi.fn();

    const subscription = subscribeToPasswordRecovery(onRecovery);
    authCallback?.('SIGNED_IN');
    authCallback?.('PASSWORD_RECOVERY');

    expect(onRecovery).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
