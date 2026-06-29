import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROLES, ROLE_DEFAULT_SCOPE } from '@flc/types';
import { DEFAULT_ROLE_SECTIONS, ROLE_LABELS, UBS_DEFAULT_ROLE_SECTIONS } from '../../packages/auth/src/rolePermissions';

function extractProfilesRoleCheckRoles(sql: string): string[] {
  const match = sql.match(/ADD CONSTRAINT profiles_role_check[\s\S]*?CHECK\s*\(role IN\s*\(([\s\S]*?)\)\s*\)/);
  if (!match) throw new Error('profiles_role_check constraint not found in role migration');
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, role]) => role);
}

describe('role model', () => {
  it('keeps app role records exhaustive', () => {
    const expectedRoles = [...APP_ROLES].sort();

    expect(Object.keys(ROLE_DEFAULT_SCOPE).sort()).toEqual(expectedRoles);
    expect(Object.keys(DEFAULT_ROLE_SECTIONS).sort()).toEqual(expectedRoles);
    expect(Object.keys(UBS_DEFAULT_ROLE_SECTIONS).sort()).toEqual(expectedRoles);
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(expectedRoles);
  });

  it('keeps profiles_role_check aligned with canonical app roles', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260628141000_allow_portal_roles_in_profiles.sql'),
      'utf8',
    );

    expect(extractProfilesRoleCheckRoles(migration)).toEqual([...APP_ROLES]);
  });
});
