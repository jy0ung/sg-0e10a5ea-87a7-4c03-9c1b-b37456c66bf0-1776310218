import { describe, expect, it, vi } from 'vitest';
import { resolveAuthVerifyRedirect } from '@/lib/authVerifyRedirect';

describe('resolveAuthVerifyRedirect', () => {
  it('uses the final same-origin Supabase redirect URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      redirected: true,
      url: 'https://ubs.protonfookloi.com/reset-password?code=recovery-code',
    });

    await expect(
      resolveAuthVerifyRedirect(
        'https://ubs.protonfookloi.com/auth/v1/verify?token=pkce-token&type=recovery&redirect_to=https://ubs.protonfookloi.com/reset-password',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBe('/reset-password?code=recovery-code');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ubs.protonfookloi.com/auth/v1/verify?token=pkce-token&type=recovery&redirect_to=https://ubs.protonfookloi.com/reset-password',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'follow',
      }),
    );
  });

  it('falls back to reset-password for an unredirected recovery verify response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      redirected: false,
      url: 'https://ubs.protonfookloi.com/auth/v1/verify',
    });

    await expect(
      resolveAuthVerifyRedirect(
        'https://ubs.protonfookloi.com/auth/v1/verify?token=pkce-token&type=recovery',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toMatch(/^\/reset-password\?error=access_denied/);
  });
});
