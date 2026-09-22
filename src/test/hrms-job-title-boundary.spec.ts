import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HRMS Job Title service boundary', () => {
  it('keeps Job Title table access out of the root admin adapter', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/services/hrmsAdminService.ts'),
      'utf8',
    );
    expect(source).toContain("from '@flc/hrms-services'");
    expect(source).not.toMatch(/\.from\(\s*['"]job_titles['"]\s*\)/);
    expect(source).not.toContain('profiles_department_id_fkey');
  });

  it('keeps HRMS-web admin as a compatibility re-export', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'apps/hrms-web/src/services/hrmsAdminService.ts'),
      'utf8',
    ).trim();
    expect(source).toBe(
      "export * from '../../../../src/services/hrmsAdminService';",
    );
  });
});
