import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeRecoveryAdmin } from './auth.js';

afterEach(() => vi.unstubAllGlobals());

describe('recovery administrator authorization', () => {
  it('checks both the signed-in user and the current server-side role', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'super_admin', status: 'active',
      }] });
    vi.stubGlobal('fetch', fetchMock);
    await expect(authorizeRecoveryAdmin('token', { supabaseUrl: 'https://example.test', anonKey: 'public-key', serviceRoleKey: 'server-secret' }))
      .resolves.toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.test/auth/v1/user', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token', apikey: 'public-key' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/rest/v1/profiles'), expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer server-secret' }),
    }));
  });

  it('rejects a non-admin even with a valid access token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'company_admin', status: 'active',
      }] }));
    await expect(authorizeRecoveryAdmin('token', { supabaseUrl: 'https://example.test', anonKey: 'public-key', serviceRoleKey: 'server-secret' }))
      .resolves.toBeNull();
  });
});
