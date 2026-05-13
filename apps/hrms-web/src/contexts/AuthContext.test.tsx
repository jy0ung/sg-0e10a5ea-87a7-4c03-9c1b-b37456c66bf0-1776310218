import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock supabase before importing AuthContext
const mockGetSession = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockFromSelect = vi.fn();
const mockLogError = vi.fn();
const mockTrackSetUser = vi.fn();
const mockTrackClearUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInWithPassword: (creds: unknown) => mockSignInWithPassword(creds),
      signOut: () => mockSignOut(),
      onAuthStateChange: (cb: unknown) => mockOnAuthStateChange(cb),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () => mockFromSelect(table),
        }),
      }),
    }),
  },
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
  Navigate: ({ to }: { to: string }) => React.createElement('div', { 'data-testid': 'navigate', 'data-to': to }),
}));

vi.mock('@/services/loggingService', () => ({
  loggingService: {
    error: (...args: unknown[]) => mockLogError(...args),
    warn: vi.fn(),
    setUserId: vi.fn(),
    clearUserId: vi.fn(),
  },
}));

vi.mock('@/services/errorTrackingService', () => ({
  errorTrackingService: {
    setUser: (...args: unknown[]) => mockTrackSetUser(...args),
    clearUser: (...args: unknown[]) => mockTrackClearUser(...args),
  },
}));

import { AuthProvider, useAuth } from './AuthContext';

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthProvider, null, children);
}

const mockProfile = {
  id: 'user-1',
  email: 'admin@test.com',
  name: 'Admin User',
  role: 'company_admin' as const,
  company_id: 'comp-1',
  branch_id: null,
  avatar_url: null,
  access_scope: 'company' as const,
  employee_id: null,
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no session
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockSignOut.mockResolvedValue({ error: null });
  });

  describe('useAuth', () => {
    it('throws when used outside AuthProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        expect(() => renderHook(() => useAuth())).toThrow(
          'useAuth must be used within AuthProvider'
        );
      } finally {
        consoleError.mockRestore();
      }
    });

    it('returns unauthenticated state initially', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('returns authenticated state when session exists', async () => {
      const session = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session } });
      mockFromSelect.mockResolvedValue({ data: mockProfile, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeTruthy();
      expect(result.current.user?.name).toBe('Admin User');
      expect(result.current.user?.companyId).toBe('comp-1');
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockTrackSetUser).toHaveBeenCalledWith('user-1');
    });

    it('maps the linked employee id onto the auth user', async () => {
      const session = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session } });
      mockFromSelect.mockResolvedValue({
        data: { ...mockProfile, employee_id: 'emp-1' },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      expect(result.current.user?.employeeId).toBe('emp-1');
    });
  });

  describe('hasRole', () => {
    it('returns false when user is not authenticated', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasRole(['company_admin'])).toBe(false);
    });

    it('returns true when user has the required role', async () => {
      const session = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session } });
      mockFromSelect.mockResolvedValue({ data: mockProfile, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      expect(result.current.hasRole(['company_admin'])).toBe(true);
      expect(result.current.hasRole(['director', 'company_admin'])).toBe(true);
    });

    it('returns false when user lacks the required role', async () => {
      const session = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session } });
      mockFromSelect.mockResolvedValue({ data: mockProfile, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      expect(result.current.hasRole(['super_admin'])).toBe(false);
      expect(result.current.hasRole(['director', 'manager'])).toBe(false);
    });

    it('super_admin bypasses all role checks', async () => {
      const session = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session } });
      mockFromSelect.mockResolvedValue({
        data: { ...mockProfile, role: 'super_admin' },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      expect(result.current.hasRole(['director'])).toBe(true);
      expect(result.current.hasRole(['sales'])).toBe(true);
      expect(result.current.hasRole(['analyst'])).toBe(true);
    });
  });

  describe('login', () => {
    it('calls signInWithPassword with credentials', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let loginResult: { error: string | null } = { error: null };
      await act(async () => {
        loginResult = await result.current.login('test@test.com', 'password');
      });

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'password',
      });
      expect(loginResult.error).toBeNull();
    });

    it('returns error message on failed login', async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: 'Invalid credentials' },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let loginResult: { error: string | null } = { error: null };
      await act(async () => {
        loginResult = await result.current.login('bad@test.com', 'wrong');
      });

      expect(loginResult.error).toBe('Invalid credentials');
    });

    it('returns a safe error when login throws unexpectedly', async () => {
      mockSignInWithPassword.mockRejectedValue(new Error('network failed'));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let loginResult: { error: string | null } = { error: null };
      await act(async () => {
        loginResult = await result.current.login('test@test.com', 'password');
      });

      expect(loginResult.error).toBe('An unexpected error occurred during sign in');
      expect(mockLogError).toHaveBeenCalledWith(
        'Unexpected sign-in error',
        { error: expect.any(Error) },
        'AuthContext',
      );
    });
  });

  describe('logout', () => {
    it('clears user state on logout', async () => {
      const session = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session } });
      mockFromSelect.mockResolvedValue({ data: mockProfile, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(mockSignOut).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});
