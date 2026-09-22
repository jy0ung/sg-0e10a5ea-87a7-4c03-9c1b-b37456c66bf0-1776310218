import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const adapters = [
  'src/services/hrmsAdminService.ts',
  'apps/hrms-web/src/services/hrmsAdminService.ts',
];

describe('HRMS Leave Type service boundary', () => {
  it('keeps Leave Type and balance table access out of app-local admin services', () => {
    for (const relativePath of adapters) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source).toContain("from '@flc/hrms-services'");
      expect(source).not.toMatch(/\.from\(\s*['"]leave_types['"]\s*\)/);
      expect(source).not.toMatch(/\.from\(\s*['"]leave_balances['"]\s*\)/);
    }
  });
});
