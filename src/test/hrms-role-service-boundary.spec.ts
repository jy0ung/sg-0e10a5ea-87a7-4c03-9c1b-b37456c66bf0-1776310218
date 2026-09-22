import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HRMS role service boundary', () => {
  it('keeps HRMS role data access inside @flc/hrms-services', () => {
    const rootAdapter = readFileSync(
      resolve(process.cwd(), 'src/services/hrmsRoleService.ts'),
      'utf8',
    );

    expect(rootAdapter).toContain("from '@flc/hrms-services'");
    expect(rootAdapter).not.toMatch(/\.from\(\s*['"]hrms_roles['"]\s*\)/);
    expect(rootAdapter).not.toMatch(
      /\.from\(\s*['"]employee_hrms_role_assignments['"]\s*\)/,
    );
    expect(rootAdapter).not.toContain(
      "rpc('replace_hrms_role_employee_assignments'",
    );
  });

  it('keeps HRMS-web as a compatibility re-export', () => {
    const webAdapter = readFileSync(
      resolve(process.cwd(), 'apps/hrms-web/src/services/hrmsRoleService.ts'),
      'utf8',
    ).trim();

    expect(webAdapter).toBe(
      "export * from '../../../../src/services/hrmsRoleService';",
    );
  });
});
