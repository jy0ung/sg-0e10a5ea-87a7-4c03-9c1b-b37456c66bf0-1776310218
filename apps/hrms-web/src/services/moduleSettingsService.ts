import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type ModuleSettingRow = Database['public']['Tables']['module_settings']['Row'];

export async function fetchModuleSettings(companyId: string): Promise<ModuleSettingRow[]> {
  const { data, error } = await supabase
    .from('module_settings')
    .select('*')
    .eq('company_id', companyId);

  if (error) throw error;
  return data ?? [];
}

export async function upsertModuleSetting(
  payload: Database['public']['Tables']['module_settings']['Insert'],
) {
  return supabase
    .from('module_settings')
    .upsert(payload, { onConflict: 'company_id,module_id' });
}
