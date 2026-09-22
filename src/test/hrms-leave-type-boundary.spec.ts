import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HRMS Leave Type service boundary', () => {
  it('keeps Leave Type and balance table access out of the root admin adapter', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/services/hrmsAdminService.ts'),
      'utf8',
    );
    expect(source).toContain("from '@flc/hrms-services'");
    expect(source).not.toMatch(/\.from\(\s*['"]leave_types['"]\s*\)/);
    expect(source).not.toMatch(/\.from\(\s*['"]leave_balances['"]\s*\)/);
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
