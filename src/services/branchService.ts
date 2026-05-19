import { supabase } from '@/integrations/supabase/client';

export interface BranchRecord {
  id: string;
  code: string;
  name: string;
}

/**
 * List all branches for a company, ordered by name.
 */
export async function listBranches(companyId: string): Promise<BranchRecord[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, code, name')
    .eq('company_id', companyId)
    .order('name');

  if (error) return [];
  return (data ?? []) as BranchRecord[];
}

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
