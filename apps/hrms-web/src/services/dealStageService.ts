import { supabase } from '@/integrations/supabase/client';
import type { DealStage } from '@/types';

function mapDealStage(row: Record<string, unknown>): DealStage {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    stageOrder: row.stage_order as number,
    color: row.color as string,
  };
}

export async function getDealStages(companyId: string): Promise<{ data: DealStage[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('deal_stages')
    .select('*')
    .eq('company_id', companyId)
    .order('stage_order');

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  return {
    data: (data ?? []).map(row => mapDealStage(row as unknown as Record<string, unknown>)),
    error: null,
  };
}
