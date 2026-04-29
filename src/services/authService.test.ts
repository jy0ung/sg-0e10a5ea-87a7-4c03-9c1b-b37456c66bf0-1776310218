import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from './authService';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      verifyOtp: vi.fn(),
      onAuthStateChange: vi.fn()
    }
  }
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('BASE_URL', '/');
    vi.stubEnv('VITE_APP_URL', 'http://localhost:3000');
  });

  describe('signUp', () => {
    it('returns a disabled message for self-service signup', async () => {
      const result = await authService.signUp('test@test.com', 'password123');

      expect(result.user).toBeNull();
      expect(result.error?.message).toMatch(/self-service signup is disabled/i);
      expect(supabase.auth.signUp).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('returns user when authenticated', async () => {
      const mockUser = { id: '123', email: 'test@test.com' };
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser as any },
        error: null
      });

      const user = await authService.getCurrentUser();
      expect(user).toBeDefined();
      expect(user?.id).toBe('123');
      expect(user?.email).toBe('test@test.com');
    });

    it('returns null when not authenticated', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null
      });

      const user = await authService.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('signIn', () => {
    it('returns user on successful sign in', async () => {
      const mockUser = { id: '123', email: 'test@test.com' };
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: mockUser as any, session: null },
        error: null
      });

      const result = await authService.signIn('test@test.com', 'password123');
      expect(result.error).toBeNull();
      expect(result.user?.id).toBe('123');
    });

    it('returns error on failed sign in', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials', name: 'AuthError', status: 400 } as any
      });

      const result = await authService.signIn('test@test.com', 'wrong');
      expect(result.user).toBeNull();
      expect(result.error?.message).toBe('Invalid credentials');
    });

    it('returns a safe error when sign in throws unexpectedly', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockRejectedValue(new Error('network failed'));

      const result = await authService.signIn('test@test.com', 'password123');

      expect(result.user).toBeNull();
      expect(result.error?.message).toBe('An unexpected error occurred during sign in');
    });
  });

  describe('signOut', () => {
    it('returns no error on successful sign out', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

      const result = await authService.signOut();
      expect(result.error).toBeNull();
    });

    it('returns a safe error when sign out throws unexpectedly', async () => {
      vi.mocked(supabase.auth.signOut).mockRejectedValue(new Error('network failed'));

      const result = await authService.signOut();

      expect(result.error?.message).toBe('An unexpected error occurred during sign out');
    });
  });

  describe('resetPassword', () => {
    it('uses the canonical reset-password route', async () => {
      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null } as any);

      const result = await authService.resetPassword('test@test.com');

      expect(result.error).toBeNull();
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('test@test.com', {
        redirectTo: 'http://localhost:3000/reset-password',
      });
    });

    it('includes the HRMS app base path when the app is mounted under /hrms/', async () => {
      vi.stubEnv('BASE_URL', '/hrms/');
      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null } as any);

      const result = await authService.resetPassword('hrms@test.com');

      expect(result.error).toBeNull();
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('hrms@test.com', {
        redirectTo: 'http://localhost:3000/hrms/reset-password',
      });
    });

    it('returns a safe error when password reset throws unexpectedly', async () => {
      vi.mocked(supabase.auth.resetPasswordForEmail).mockRejectedValue(new Error('network failed'));

      const result = await authService.resetPassword('test@test.com');

      expect(result.error?.message).toBe('An unexpected error occurred during password reset');
    });
  });
});
