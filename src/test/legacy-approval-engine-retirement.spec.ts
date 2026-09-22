import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('legacy approval engine retirement', () => {
  it('keeps the retired app-local legacy engines absent', () => {
    expect(existsSync(resolve(process.cwd(), 'src/services/approvalEngineService.ts'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'apps/hrms-web/src/services/approvalEngineService.ts'))).toBe(false);
  });

  it('keeps approval_requests limited to explicit release compatibility coverage', () => {
    const boundary = readFileSync(
      resolve(process.cwd(), 'scripts/check-workflow-boundary.ts'),
      'utf8',
    );

    expect(boundary).toContain("'src/test/release-workflows.spec.ts'");
    expect(boundary).not.toContain("'src/services/approvalEngineService.ts'");
    expect(boundary).not.toContain("'apps/hrms-web/src/services/approvalEngineService.ts'");
  });
});
