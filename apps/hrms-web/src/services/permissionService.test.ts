import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { setUserColumnPermissions } from './permissionService';
import { logPermissionChange } from './auditService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./auditService', () => ({
  logPermissionChange: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

function createQueryBuilder(result: { data?: unknown; error?: Error | null }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    then: (resolve: (value: { data?: unknown; error: Error | null }) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  };
  return builder;
}

describe('permissionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes column permission updates to the actor company and audits the change', async () => {
    const targetProfile = createQueryBuilder({ data: { id: 'target-1' } });
    const existingPermissions = createQueryBuilder({
      data: [{ column_name: 'remark', permission_level: 'view' }],
    });
    const deleteBuilder = createQueryBuilder({ data: null });
    const insertBuilder = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(supabase.from)
      .mockReturnValueOnce(targetProfile as never)
      .mockReturnValueOnce(existingPermissions as never)
      .mockReturnValueOnce(deleteBuilder as never)
      .mockReturnValueOnce(insertBuilder as never);

    const permissions = [{ column_name: 'customer_name', permission_level: 'view' as const }];
    const result = await setUserColumnPermissions('target-1', permissions, 'vehicles', {
      actorId: 'actor-1',
      companyId: 'company-1',
    });

    expect(result.error).toBeNull();
    expect(targetProfile.eq).toHaveBeenNthCalledWith(1, 'id', 'target-1');
    expect(targetProfile.eq).toHaveBeenNthCalledWith(2, 'company_id', 'company-1');
    expect(deleteBuilder.eq).toHaveBeenNthCalledWith(1, 'user_id', 'target-1');
    expect(deleteBuilder.eq).toHaveBeenNthCalledWith(2, 'table_name', 'vehicles');
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      {
        user_id: 'target-1',
        table_name: 'vehicles',
        column_name: 'customer_name',
        permission_level: 'view',
      },
    ]);
    expect(logPermissionChange).toHaveBeenCalledWith('actor-1', 'target-1', {
      column_permissions: {
        before: [{ column_name: 'remark', permission_level: 'view' }],
        after: permissions,
      },
      table_name: {
        before: 'vehicles',
        after: 'vehicles',
      },
    });
  });

  it('blocks permission updates for users outside the actor company scope', async () => {
    const targetProfile = createQueryBuilder({ data: null });
    vi.mocked(supabase.from).mockReturnValueOnce(targetProfile as never);

    const result = await setUserColumnPermissions('target-1', [], 'vehicles', {
      actorId: 'actor-1',
      companyId: 'company-1',
    });

    expect(result.error?.message).toBe('Target user is outside the current company scope');
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(logPermissionChange).not.toHaveBeenCalled();
  });
});
