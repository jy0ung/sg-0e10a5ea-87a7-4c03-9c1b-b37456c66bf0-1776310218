import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchModuleSettings, upsertModuleSetting } from './moduleSettingsService';

const fromMock = vi.fn();

vi.mock('@flc/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

function selectBuilder(result: { data?: unknown; error?: Error | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
  };
}

describe('moduleSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches settings scoped to a company', async () => {
    const rows = [{ id: 'setting-1', company_id: 'company-1', module_id: 'sales', is_active: true }];
    const builder = selectBuilder({ data: rows });
    fromMock.mockReturnValueOnce(builder);

    const result = await fetchModuleSettings('company-1');

    expect(result).toBe(rows);
    expect(fromMock).toHaveBeenCalledWith('module_settings');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('throws fetch errors so React Query can surface the failed gate load', async () => {
    const error = new Error('schema drift');
    fromMock.mockReturnValueOnce(selectBuilder({ error }));

    await expect(fetchModuleSettings('company-1')).rejects.toBe(error);
  });

  it('upserts settings through the company/module conflict key', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValueOnce({ upsert });

    const payload = {
      company_id: 'company-1',
      module_id: 'sales',
      is_active: false,
      updated_at: '2026-06-01T00:00:00.000Z',
      updated_by: 'user-1',
    };
    const result = await upsertModuleSetting(payload);

    expect(result).toEqual({ data: null, error: null });
    expect(fromMock).toHaveBeenCalledWith('module_settings');
    expect(upsert).toHaveBeenCalledWith(payload, { onConflict: 'company_id,module_id' });
  });
});
