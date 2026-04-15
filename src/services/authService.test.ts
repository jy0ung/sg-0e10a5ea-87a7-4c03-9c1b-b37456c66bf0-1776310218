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
  });

  describe('signOut', () => {
    it('returns no error on successful sign out', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

      const result = await authService.signOut();
      expect(result.error).toBeNull();
    });
  });
});