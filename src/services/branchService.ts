import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve a branch UUID (profile.branch_id) to the corresponding short code
 * (branches.code) used in vehicles.branch_code and sales_orders.branch_code.
 */
export async function resolveBranchCode(branchId: string): Promise<string | null> {
  const { data } = await supabase
    .from('branches')
    .select('code')
    .eq('id', branchId)
    .maybeSingle();
  return (data as { code: string } | null)?.code ?? null;
}
