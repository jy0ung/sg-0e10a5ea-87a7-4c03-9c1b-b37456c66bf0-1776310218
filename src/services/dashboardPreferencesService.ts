/**
 * Dashboard preferences service — typed wrappers over the
 * `dashboard_preferences` table used by the Executive Dashboard.
 *
 * Centralizing these reads/writes here removes the direct supabase client
 * usage from the page and gives us one place to debounce / batch / audit
 * preference updates.
 */
import { supabase } from '@/integrations/supabase/client';
import type { PersonalDashboardPreferences } from '@/lib/personalDashboard';

export interface DashboardPreferencesRow {
  user_id: string;
  selected_kpis: string[] | null;
  show_advanced_kpis: boolean | null;
  personal_dashboard: PersonalDashboardPreferences | null;
  updated_at?: string;
}

// The generated Database type may not yet include dashboard_preferences;
// isolate the cast here so callers stay typed.
type DashboardPrefsClient = {
  from: (table: 'dashboard_preferences') => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: DashboardPreferencesRow | null;
          error: Error | null;
        }>;
      };
    };
    upsert: (
      row: DashboardPreferencesRow,
      opts?: { onConflict?: string },
    ) => Promise<{ data: unknown; error: Error | null }>;
  };
};

const client = supabase as unknown as DashboardPrefsClient;

export async function fetchDashboardPreferences(
  userId: string,
): Promise<{ data: DashboardPreferencesRow | null; error: Error | null }> {
  return client
    .from('dashboard_preferences')
    .select('user_id, selected_kpis, show_advanced_kpis, personal_dashboard')
    .eq('user_id', userId)
    .maybeSingle();
}

export async function upsertDashboardPreferences(
  row: DashboardPreferencesRow,
): Promise<{ error: Error | null }> {
  const { error } = await client
    .from('dashboard_preferences')
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  return { error };
}
