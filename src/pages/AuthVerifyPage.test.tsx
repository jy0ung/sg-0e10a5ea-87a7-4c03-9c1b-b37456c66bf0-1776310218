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

  it('falls back to reset-password when recovery verify fetch fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network unavailable'));

    await expect(
      resolveAuthVerifyRedirect(
        'https://ubs.protonfookloi.com/auth/v1/verify?token=pkce-token&type=recovery&redirect_to=https://ubs.protonfookloi.com/reset-password',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toMatch(/^\/reset-password\?error=access_denied/);
  });

  it('falls back to reset-password when recovery verify fetch times out', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockImplementation((_, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    const redirect = resolveAuthVerifyRedirect(
      'https://ubs.protonfookloi.com/auth/v1/verify?token=pkce-token&type=recovery',
      fetchImpl as unknown as typeof fetch,
      1,
    );

    await vi.advanceTimersByTimeAsync(1);
    await expect(redirect).resolves.toMatch(/^\/reset-password\?error=access_denied/);
    vi.useRealTimers();
  });
});
