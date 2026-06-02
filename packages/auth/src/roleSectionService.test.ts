import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_SECTIONS } from './rolePermissions';
import { fetchRoleSections, saveRoleSections } from './roleSectionService';

const fromMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('@flc/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
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

  it('writes every known section for a role so revoked sections are persisted', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValueOnce({ upsert });

    const result = await saveRoleSections('company-1', 'manager', ['Auto Aging', 'Sales']);

    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      ALL_SECTIONS.map((section) => ({
        company_id: 'company-1',
        role: 'manager',
        section,
        allowed: section === 'Auto Aging' || section === 'Sales',
      })),
      { onConflict: 'company_id,role,section' },
    );
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
