import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_SECTIONS } from './rolePermissions';
import { fetchRoleSections, fetchRoleSectionMatrix, saveRoleSectionMatrix } from './roleSectionService';

const fromMock = vi.fn();
const rpcMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('@flc/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock('@flc/platform-services', () => ({
  loggingService: {
    error: (...args: unknown[]) => logErrorMock(...args),
  },
}));

function selectBuilder(result: { data?: unknown; error?: Error | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
  };
}

describe('roleSectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no role sections are configured so callers can use defaults', async () => {
    const builder = selectBuilder({ data: [] });
    fromMock.mockReturnValueOnce(builder);

    const result = await fetchRoleSections('company-1');

    expect(result).toEqual({ data: null, error: null });
    expect(fromMock).toHaveBeenCalledWith('role_sections');
    expect(builder.select).toHaveBeenCalledWith('role, section, allowed');
    expect(builder.eq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('shapes allowed rows into a role-to-section matrix', async () => {
    fromMock.mockReturnValueOnce(selectBuilder({
      data: [
        { role: 'company_admin', section: 'Admin', allowed: true },
        { role: 'company_admin', section: 'Sales', allowed: false },
        { role: 'manager', section: 'Auto Aging', allowed: true },
      ],
    }));

    const result = await fetchRoleSections('company-1');

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      company_admin: ['Admin'],
      manager: ['Auto Aging'],
    });
  });

  it('keeps a role explicitly denied when all its rows are false', async () => {
    fromMock.mockReturnValueOnce(selectBuilder({
      data: [{ role: 'manager', section: 'Sales', allowed: false }],
    }));
    const result = await fetchRoleSections('company-1');
    expect(result.data?.manager).toEqual([]);
  });

  it('loads a versioned admin snapshot and saves the full matrix in one RPC', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { version: 4, matrix: { manager: [] } }, error: null,
    });
    const loaded = await fetchRoleSectionMatrix('company-1');
    expect(loaded.data?.version).toBe(4);
    expect(loaded.data?.matrix.manager).toEqual([]);
    expect(loaded.data?.matrix.sales).toEqual(DEFAULT_ROLE_SECTIONS.sales);
    expect(rpcMock).toHaveBeenCalledWith('get_role_section_matrix', { p_company_id: 'company-1' });

    rpcMock.mockResolvedValueOnce({ data: 5, error: null });
    const saved = await saveRoleSectionMatrix('company-1', 4, loaded.data!.matrix);
    expect(saved).toEqual({ version: 5, error: null });
    expect(rpcMock).toHaveBeenCalledWith('save_role_section_matrix', {
      p_company_id: 'company-1', p_expected_version: 4, p_matrix: loaded.data!.matrix,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('logs and returns load errors without throwing', async () => {
    const error = new Error('network down');
    fromMock.mockReturnValueOnce(selectBuilder({ error }));

    const result = await fetchRoleSections('company-1');

    expect(result.data).toBeNull();
    expect(result.error).toBe(error);
    expect(logErrorMock).toHaveBeenCalledWith(
      'Failed to load role_sections',
      { error: 'network down', companyId: 'company-1' },
      'RoleSectionService',
    );
  });
});
