import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from },
}));

import {
  fetchDashboardPreferences,
  upsertDashboardPreferences,
} from './dashboardPreferencesService';

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockImplementation(() => ({ maybeSingle }));
  select.mockImplementation(() => ({ eq }));
  from.mockImplementation(() => ({ select, upsert }));
});

describe('dashboardPreferencesService', () => {
  it('fetchDashboardPreferences scopes query to the user', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { user_id: 'u1' }, error: null });
    const result = await fetchDashboardPreferences('u1');
    expect(from).toHaveBeenCalledWith('dashboard_preferences');
    expect(select).toHaveBeenCalledWith(
      'user_id, selected_kpis, show_advanced_kpis, personal_dashboard',
    );
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(result.data).toEqual({ user_id: 'u1' });
  });

  it('upsertDashboardPreferences stamps updated_at and sets onConflict', async () => {
    upsert.mockResolvedValueOnce({ error: null });
    const row = {
      selected_kpis: ['a'],
      show_advanced_kpis: false,
      personal_dashboard: null,
    };
    const res = await upsertDashboardPreferences('u1', row);
    expect(res.error).toBeNull();
    const [payload, opts] = upsert.mock.calls[0];
    expect(payload.user_id).toBe('u1');
    expect(typeof payload.updated_at).toBe('string');
    expect(opts).toEqual({ onConflict: 'user_id' });
  });

  it('propagates upsert errors', async () => {
    const err = new Error('boom');
    upsert.mockResolvedValueOnce({ error: err });
    const res = await upsertDashboardPreferences('u1', {
      selected_kpis: null,
      show_advanced_kpis: null,
      personal_dashboard: null,
    });
    expect(res.error).toBe(err);
  });
});
