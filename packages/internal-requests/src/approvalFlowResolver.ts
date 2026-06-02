import { supabase } from '@flc/supabase';
import type { FlowEntityType } from '@flc/types';

/**
 * Resolve the best active approval flow for an entity type.
 * Priority: exact department, explicit company default, then legacy company fallback.
 */
export async function resolveApprovalFlowId(
  companyId: string,
  entityType: FlowEntityType,
  departmentId?: string | null,
): Promise<string | null> {
  const { data: flows } = await supabase
    .from('approval_flows')
    .select('id, department_id, is_default')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (!flows?.length) return null;

  if (departmentId) {
    const match = flows.find((flow) => flow.department_id === departmentId);
    if (match) return String(match.id);
  }

  const defaultFlow = flows.find((flow) => Boolean(flow.is_default) && !flow.department_id);
  if (defaultFlow) return String(defaultFlow.id);

  const fallback = flows.find((flow) => !flow.department_id);
  return fallback ? String(fallback.id) : null;
}
