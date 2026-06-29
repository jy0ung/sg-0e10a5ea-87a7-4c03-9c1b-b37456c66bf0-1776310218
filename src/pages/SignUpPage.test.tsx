import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from './SignUpPage';

const mockExchangeCodeForSession = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSetSession = vi.fn();
const mockGetSession = vi.fn();
const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();
const mockUpdateOwnProfileName = vi.fn();

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
  updateOwnProfileName: (...args: unknown[]) => mockUpdateOwnProfileName(...args),
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
    mockUpdateOwnProfileName.mockResolvedValue({ error: null });
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

  it('activates the invited profile after password setup succeeds', async () => {
    mockGetUser
      .mockResolvedValueOnce({
        data: {
          user: {
            email: 'invited@example.com',
            user_metadata: { name: 'Invited User' },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'user-1',
            email: 'invited@example.com',
            user_metadata: { name: 'Invited User' },
          },
        },
      });

    renderPage('/signup?code=invite-code');

    await screen.findByText('Complete your account setup');
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Invited User' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'newpassword' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword' } });
    const submit = screen.getByRole('button', { name: /complete sign up/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mockUpdateOwnProfileName).toHaveBeenCalledWith('user-1', 'Invited User', { activateInvite: true });
    });
  });
});
