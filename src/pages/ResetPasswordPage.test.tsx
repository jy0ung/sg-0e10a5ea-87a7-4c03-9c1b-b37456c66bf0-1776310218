import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from './ResetPasswordPage';

const mockGetSession = vi.fn();
const mockSetSession = vi.fn();
const mockExchangeCodeForSession = vi.fn();
const mockVerifyOtp = vi.fn();
const mockUpdateUser = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      setSession: (session: unknown) => mockSetSession(session),
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
      verifyOtp: (params: unknown) => mockVerifyOtp(params),
      updateUser: (params: unknown) => mockUpdateUser(params),
      onAuthStateChange: (callback: unknown) => mockOnAuthStateChange(callback),
    },
  },
}));

function makeAccessToken(method: string) {
  const payload = Buffer.from(JSON.stringify({ amr: [{ method }] })).toString('base64url');
  return `header.${payload}.signature`;
}

function renderPage(path = '/reset-password') {
  window.history.pushState({}, '', path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSetSession.mockResolvedValue({ error: null });
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('accepts a recovery session already consumed by Supabase auth initialization', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeAccessToken('recovery'),
        },
      },
    });

    renderPage();

    expect(await screen.findByText('Set your new password')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid or expired reset link/i)).not.toBeInTheDocument();
  });

  it('exchanges a recovery code callback before showing the reset form', async () => {
    renderPage('/reset-password?type=recovery&code=recovery-code');

    expect(await screen.findByText('Set your new password')).toBeInTheDocument();
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('recovery-code');
  });

  it('verifies a recovery token hash callback before showing the reset form', async () => {
    renderPage('/reset-password?type=recovery&token_hash=recovery-token');

    expect(await screen.findByText('Set your new password')).toBeInTheDocument();
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'recovery',
      token_hash: 'recovery-token',
    });
  });

  it('rejects a direct visit without a recovery callback or recovery session', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Invalid or expired reset link/i)).toBeInTheDocument();
    });
  });
});