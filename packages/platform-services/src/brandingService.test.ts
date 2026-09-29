import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBranding, uploadBrandingAsset } from './brandingService';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('@flc/supabase', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('company branding write path', () => {
  it('reads only the requested company', async () => {
    const row = { company_id: 'company-1', company_name: 'FLC' };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    expect(await fetchBranding('company-1')).toEqual({ data: row, error: null });
    expect(mocks.from).toHaveBeenCalledWith('company_branding');
    expect(eq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('persists the uploaded asset path to the company branding row', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn();
    mocks.storageFrom.mockReturnValue({ upload, remove });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upsert });

    const result = await uploadBrandingAsset('company-1', 'logo', new File(['image'], 'logo.png', { type: 'image/png' }));
    expect(result.error).toBeNull();
    expect(result.path).toMatch(/^company-1\/logo\/[a-f0-9-]+\.png$/);
    expect(upload).toHaveBeenCalledWith(result.path, expect.any(File), { contentType: 'image/png' });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      company_id: 'company-1', logo_path: result.path,
    }), { onConflict: 'company_id' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes an unreferenced new asset when saving its path fails', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    mocks.storageFrom.mockReturnValue({ upload, remove });
    mocks.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: 'denied' } }) });

    const result = await uploadBrandingAsset('company-1', 'favicon', new File(['icon'], 'icon.ico', { type: 'image/x-icon' }));
    expect(result).toEqual({ path: null, error: 'denied' });
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^company-1\/favicon\//)]);
  });
});
