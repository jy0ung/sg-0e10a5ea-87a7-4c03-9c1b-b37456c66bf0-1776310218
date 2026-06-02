import { supabase } from '@flc/supabase';
import type { Database } from '@flc/supabase/types';

export type ModuleSettingRow = Database['public']['Tables']['module_settings']['Row'];
export type ModuleSettingInsert = Database['public']['Tables']['module_settings']['Insert'];

export async function fetchModuleSettings(companyId: string): Promise<ModuleSettingRow[]> {
  const { data, error } = await supabase
    .from('module_settings')
    .select('*')
    .eq('company_id', companyId);

  if (error) throw error;
  return data ?? [];
}

export async function upsertModuleSetting(payload: ModuleSettingInsert) {
  return supabase
    .from('module_settings')
    .upsert(payload, { onConflict: 'company_id,module_id' });
}
