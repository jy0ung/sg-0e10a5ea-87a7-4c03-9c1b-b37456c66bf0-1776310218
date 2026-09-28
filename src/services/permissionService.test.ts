import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@flc/supabase';
import { setUserColumnPermissions } from './permissionService';

vi.mock('@flc/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@flc/platform-services', () => ({
  loggingService: { error: vi.fn() },
}));

function createQueryBuilder(result: { data?: unknown; error?: Error | null }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    single: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    then: (resolve: (value: { data?: unknown; error: Error | null }) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  };
  return builder;
}

describe('permissionService legacy adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates a scoped Vehicle update to the atomic command with stored general flags', async () => {
    const target = createQueryBuilder({ data: { id: 'target-1' } });
    const profile = createQueryBuilder({ data: {
      can_edit_vehicles: true,
      can_bulk_edit_vehicles: false,
      can_view_vehicle_details: true,
    } });
    const columns = createQueryBuilder({ data: [{ column_name: 'remark', permission_level: 'view' }] });
    vi.mocked(supabase.from)
      .mockReturnValueOnce(target as never)
      .mockReturnValueOnce(profile as never)
      .mockReturnValueOnce(columns as never);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

    const result = await setUserColumnPermissions('target-1', [
      { column_name: 'customer_name', permission_level: 'view' },
    ], 'vehicles', { actorId: 'actor-1', companyId: 'company-1' });

    expect(result.error).toBeNull();
    expect(target.eq).toHaveBeenNthCalledWith(1, 'id', 'target-1');
    expect(target.eq).toHaveBeenNthCalledWith(2, 'company_id', 'company-1');
    expect(supabase.rpc).toHaveBeenCalledWith('save_vehicle_user_permissions', {
      p_user_id: 'target-1',
      p_can_edit: true,
      p_can_bulk_edit: false,
      p_can_view_details: true,
      p_columns: { customer_name: 'view' },
    });
  });

  it('blocks users outside the actor company before attempting a save', async () => {
    const target = createQueryBuilder({ data: null });
    vi.mocked(supabase.from).mockReturnValueOnce(target as never);

    const result = await setUserColumnPermissions('target-1', [], 'vehicles', {
      actorId: 'actor-1', companyId: 'company-1',
    });

    expect(result.error?.message).toBe('Target user is outside the current company scope');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects permission tables without an atomic domain command', async () => {
    const result = await setUserColumnPermissions('target-1', [], 'other_table');
    expect(result.error?.message).toContain('domain-specific atomic command');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
