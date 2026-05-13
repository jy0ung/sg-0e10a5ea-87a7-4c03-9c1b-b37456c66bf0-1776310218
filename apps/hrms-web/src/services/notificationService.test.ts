import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { markAsRead } from './notificationService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes markAsRead by notification id and current user id', async () => {
    const builder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: { error: Error | null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    vi.mocked(supabase.from).mockReturnValue(builder as never);

    const result = await markAsRead('notification-1', 'user-1');

    expect(result.error).toBeNull();
    expect(builder.update).toHaveBeenCalledWith({ read: true });
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'id', 'notification-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'user_id', 'user-1');
  });
});
