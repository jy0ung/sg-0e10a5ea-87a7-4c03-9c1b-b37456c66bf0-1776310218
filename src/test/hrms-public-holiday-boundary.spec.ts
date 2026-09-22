import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HRMS admin Public Holiday boundary', () => {
  it('keeps Public Holiday admin table access inside @flc/hrms-services', () => {
    const rootAdapter = readFileSync(
      resolve(process.cwd(), 'src/services/hrmsAdminService.ts'),
      'utf8',
    );

    expect(rootAdapter).toContain("from '@flc/hrms-services'");
    expect(rootAdapter).not.toMatch(/\.from\(\s*['"]public_holidays['"]\s*\)/);
  });

  it('keeps HRMS-web admin service as a compatibility re-export', () => {
    const webAdapter = readFileSync(
      resolve(process.cwd(), 'apps/hrms-web/src/services/hrmsAdminService.ts'),
      'utf8',
    ).trim();

    expect(webAdapter).toBe(
      "export * from '../../../../src/services/hrmsAdminService';",
    );
  });

  it('leaves Leave holiday consumption outside the admin boundary', () => {
    const leaveService = readFileSync(
      resolve(process.cwd(), 'packages/hrms-services/src/leave/leaveService.ts'),
      'utf8',
    );

    expect(leaveService).toMatch(/\.from\(\s*['"]public_holidays['"]\s*\)/);
  });
});
