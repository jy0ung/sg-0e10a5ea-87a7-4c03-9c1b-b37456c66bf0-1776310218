import { afterEach, describe, expect, it, vi } from 'vitest';
import { loggingService } from './loggingService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

describe('loggingService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive context before buffering logs', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    loggingService.error('Failed for admin@example.com', {
      email: 'admin@example.com',
      phone: '+60123456789',
      nested: {
        token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',
        safe: 'kept',
      },
      error: new Error('User admin@example.com failed'),
    });

    const entry = loggingService.getLogs().at(-1);
    expect(entry?.message).toBe('Failed for [redacted]');
    expect(entry?.context).toMatchObject({
      email: '[redacted]',
      phone: '[redacted]',
      nested: {
        token: '[redacted]',
        safe: 'kept',
      },
      error: {
        message: 'User [redacted] failed',
      },
    });
  });
});
