import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from './SignUpPage';

const mockExchangeCodeForSession = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSetSession = vi.fn();
const mockGetSession = vi.fn();
const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@flc/supabase/client', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
      verifyOtp: (params: unknown) => mockVerifyOtp(params),
      setSession: (session: unknown) => mockSetSession(session),
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
      updateUser: (params: unknown) => mockUpdateUser(params),
      signOut: () => mockSignOut(),
    },
  },
}));

vi.mock('@flc/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flc/auth')>()),
  updateOwnProfileName: vi.fn().mockResolvedValue({ error: null }),
}));

function renderPage(path = '/signup') {
  window.history.pushState({}, '', path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SignUpPage />
    </MemoryRouter>,
  );
}

describe('SignUpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockSetSession.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: 'invited@example.com',
          user_metadata: { name: 'Invited User' },
        },
      },
    });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it('exchanges a bare PKCE invite code returned by GoTrue verify', async () => {
    renderPage('/signup?code=invite-code');

    expect(await screen.findByText('Complete your account setup')).toBeInTheDocument();
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('invite-code');
  });

  it('verifies an invite token_hash callback before showing setup', async () => {
    renderPage('/signup#type=invite&token_hash=invite-token');

    expect(await screen.findByText('Complete your account setup')).toBeInTheDocument();
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'invite',
      token_hash: 'invite-token',
    });
  });
});
