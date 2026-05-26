import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type { AppRole } from '@/types';

export interface KpiDefinition {
  id: string;
  companyId: string | null;
  code: string;
  label: string;
  description: string | null;
  formula: Record<string, unknown>;
  /**
   * Optional deep-link target for the Role-aware Home card. Persisted in
   * kpi_definitions.landing_route (added by Phase 5a migration). When
   * absent, the Home page falls back to its hardcoded route map and
   * finally to /dashboard.
   */
  landingRoute: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Slim KPI projection returned by get_role_home_kpis.
 *
 * Cards on the Role-aware Home are navigational only — the `formula` field
 * is carried through for future use (Phase 6 reporting) but is not
 * evaluated client-side in Phase 5. Each card's value lives on its
 * destination page, which is reached via `landingRoute` (preferred) or
 * the legacy hardcoded map in Home.tsx.
 */
export interface RoleHomeKpi {
  code: string;
  label: string;
  description: string | null;
  formula: Record<string, unknown>;
  landingRoute: string | null;
  position: number;
}

function mapDefinition(row: Record<string, unknown>): KpiDefinition {
  return {
    id:           String(row.id ?? ''),
    companyId:    row.company_id == null ? null : String(row.company_id),
    code:         String(row.code ?? ''),
    label:        String(row.label ?? ''),
    description:  row.description == null ? null : String(row.description),
    formula:      (row.formula as Record<string, unknown>) ?? {},
    landingRoute: row.landing_route == null ? null : String(row.landing_route),
    version:      Number(row.version ?? 1),
    isActive:     Boolean(row.is_active ?? true),
    createdAt:    String(row.created_at ?? ''),
    updatedAt:    String(row.updated_at ?? ''),
  };
}

function mapHomeKpi(row: Record<string, unknown>): RoleHomeKpi {
  return {
    code:         String(row.code ?? ''),
    label:        String(row.label ?? ''),
    description:  row.description == null ? null : String(row.description),
    formula:      (row.formula as Record<string, unknown>) ?? {},
    landingRoute: row.landing_route == null ? null : String(row.landing_route),
    position:     Number(row.position ?? 0),
  };
}

/**
 * Curated KPI catalogue. Returns active definitions visible to the company,
 * blending per-company overrides with global defaults. Per-company rows win
 * by virtue of the unique partial index on (company_id, code).
 */
export async function listKpiDefinitions(
  companyId: string,
): Promise<{ data: KpiDefinition[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('kpi_definitions')
    .select('*')
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .eq('is_active', true)
    .order('label');
  if (error) {
    loggingService.error('listKpiDefinitions failed', { companyId, error }, 'kpiHomeService');
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data ?? []).map(mapDefinition), error: null };
}

/**
 * Resolve the curated KPI set for a (company, role) tuple. The RPC handles
 * per-company override > global default fallback in a single round-trip.
 */
export async function getRoleHomeKpis(
  companyId: string,
  role: AppRole,
): Promise<{ data: RoleHomeKpi[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_role_home_kpis', {
    p_company_id: companyId,
    p_role:       role,
  });
  if (error) {
    loggingService.error('getRoleHomeKpis failed', { companyId, role, error }, 'kpiHomeService');
    return { data: [], error: new Error(error.message) };
  }
  return {
    data: (data as Record<string, unknown>[]).map(mapHomeKpi),
    error: null,
  };
}

/** Admin upsert for the studio. */
export async function upsertRoleKpiDefaults(
  companyId: string,
  role: AppRole,
  kpiCodes: string[],
): Promise<{ id: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('upsert_role_kpi_defaults', {
    p_company_id: companyId,
    p_role:       role,
    p_kpi_codes:  kpiCodes,
  });
  if (error) {
    loggingService.error('upsertRoleKpiDefaults failed', { companyId, role, kpiCodes, error }, 'kpiHomeService');
    return { id: null, error: new Error(error.message) };
  }
  return { id: data as string, error: null };
}
