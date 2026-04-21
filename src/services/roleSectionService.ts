import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type { SectionName } from '@/config/rolePermissions';
import type { AppRole } from '@/types';

/**
 * Role-section service — reads the `role_sections` table that replaces the
 * legacy `src/config/rolePermissions.ts` localStorage matrix (Phase 2 #15).
 *
 * The generated Database type hasn't been regenerated yet, so we declare a
 * local shape. The cast is isolated here — callers see a fully-typed API.
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
    upsert: (
      rows: Omit<RoleSectionRow, 'id'>[],
      opts?: { onConflict?: string },
    ) => Promise<{ data: unknown; error: Error | null }>;
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

    const matrix: Partial<RoleSectionsMatrix> = {};
    for (const row of data ?? []) {
      if (!row.allowed) continue;
      if (!matrix[row.role]) matrix[row.role] = [];
      matrix[row.role]!.push(row.section);
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

/**
 * Write-through update for a single role's allowed sections. Called by the
 * admin role matrix editor. The caller must have `super_admin`, `company_admin`,
 * `director`, or `general_manager` — enforced by RLS.
 */
export async function saveRoleSections(
  companyId: string,
  role: AppRole,
  sections: SectionName[],
): Promise<{ error: Error | null }> {
  try {
    const rows: Omit<RoleSectionRow, 'id'>[] = sections.map((section) => ({
      company_id: companyId,
      role,
      section,
      allowed: true,
    }));
    const { error } = await client.from('role_sections').upsert(rows, {
      onConflict: 'company_id,role,section',
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to save role sections');
    loggingService.error(
      'Failed to save role_sections',
      { error: error.message, companyId, role },
      'RoleSectionService',
    );
    return { error };
  }
}
