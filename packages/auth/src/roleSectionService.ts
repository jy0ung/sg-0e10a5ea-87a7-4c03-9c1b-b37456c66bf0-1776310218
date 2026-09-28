import { supabase, type Json } from '@flc/supabase';
import { loggingService } from '@flc/platform-services';
import { ALL_SECTIONS, DEFAULT_ROLE_SECTIONS, type SectionName } from './rolePermissions';
import { APP_ROLES, type AppRole } from '@flc/types';

/**
 * Role-section service — reads the `role_sections` table that replaces the
 * legacy `src/config/rolePermissions.ts` localStorage matrix (Phase 2 #15).
 *
 * Runtime navigation reads ordinary tenant-visible rows. Admin edits use
 * versioned RPCs that validate and save the complete matrix atomically.
 */

export interface RoleSectionRow {
  id: string;
  company_id: string;
  role: AppRole;
  section: SectionName;
  allowed: boolean;
}

type RoleSectionsClient = {
  from: (table: 'role_sections') => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{
        data: RoleSectionRow[] | null;
        error: Error | null;
      }>;
    };
  };
};

const client = supabase as unknown as RoleSectionsClient;

export type RoleSectionsMatrix = Record<AppRole, SectionName[]>;

/**
 * Load the company's role-section matrix from the DB and shape it into
 * `Record<AppRole, SectionName[]>` — the same shape the legacy helper uses,
 * so downstream consumers don't need to change.
 */
export async function fetchRoleSections(
  companyId: string,
): Promise<{ data: RoleSectionsMatrix | null; error: Error | null }> {
  try {
    const { data, error } = await client
      .from('role_sections')
      .select('role, section, allowed')
      .eq('company_id', companyId);

    if (error) throw error;

    // No rows means the company hasn't configured role sections yet — return
    // null so callers fall back to DEFAULT_ROLE_SECTIONS instead of treating
    // every section as denied.
    if (!data || data.length === 0) return { data: null, error: null };

    const matrix: Partial<RoleSectionsMatrix> = {};
    for (const row of data) {
      if (!matrix[row.role]) matrix[row.role] = [];
      if (row.allowed) matrix[row.role]!.push(row.section);
    }
    return { data: matrix as RoleSectionsMatrix, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load role sections');
    loggingService.error(
      'Failed to load role_sections',
      { error: error.message, companyId },
      'RoleSectionService',
    );
    return { data: null, error };
  }
}

export interface RoleSectionMatrixSnapshot {
  matrix: RoleSectionsMatrix;
  version: number;
}

function normalizeMatrix(raw: Record<string, unknown>): RoleSectionsMatrix {
  const matrix = {} as RoleSectionsMatrix;
  for (const role of APP_ROLES) {
    const entries = raw[role];
    matrix[role] = Array.isArray(entries)
      ? entries.filter((section): section is SectionName => ALL_SECTIONS.includes(section as SectionName))
      : [...DEFAULT_ROLE_SECTIONS[role]];
  }
  return matrix;
}

/** Admin: read the matrix and its compare-and-swap version in one snapshot. */
export async function fetchRoleSectionMatrix(
  companyId: string,
): Promise<{ data: RoleSectionMatrixSnapshot | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_role_section_matrix', {
    p_company_id: companyId,
  });
  if (error) {
    loggingService.error('Failed to load role matrix', { companyId, error }, 'RoleSectionService');
    return { data: null, error: new Error(error.message) };
  }
  const result = data as { version?: number; matrix?: Record<string, unknown> } | null;
  if (!result || typeof result.version !== 'number' || !result.matrix) {
    return { data: null, error: new Error('Invalid role matrix response') };
  }
  return { data: { version: result.version, matrix: normalizeMatrix(result.matrix) }, error: null };
}

/** Admin: save every role/section in one audited transaction at the loaded version. */
export async function saveRoleSectionMatrix(
  companyId: string,
  expectedVersion: number,
  matrix: RoleSectionsMatrix,
): Promise<{ version: number | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('save_role_section_matrix', {
    p_company_id: companyId,
    p_expected_version: expectedVersion,
    p_matrix: matrix as unknown as Json,
  });
  if (error) {
    loggingService.error('Failed to save role matrix', { companyId, error }, 'RoleSectionService');
    return { version: null, error: new Error(error.message) };
  }
  return { version: Number(data), error: null };
}
