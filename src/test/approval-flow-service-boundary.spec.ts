import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Approval Flow admin service boundary', () => {
  it('keeps workflow table/RPC access inside @flc/hrms-services', () => {
    const rootAdapter = readFileSync(
      resolve(process.cwd(), 'src/services/approvalFlowService.ts'),
      'utf8',
    );

    expect(rootAdapter).toContain("from '@flc/hrms-services'");
    expect(rootAdapter).not.toMatch(/\.from\(\s*['"]approval_flows['"]\s*\)/);
    expect(rootAdapter).not.toMatch(/\.from\(\s*['"]approval_steps['"]\s*\)/);
    expect(rootAdapter).not.toContain("rpc('save_approval_flow_with_steps'");
  });

  it('keeps HRMS-web as a compatibility re-export', () => {
    const webAdapter = readFileSync(
      resolve(process.cwd(), 'apps/hrms-web/src/services/approvalFlowService.ts'),
      'utf8',
    ).trim();

    expect(webAdapter).toBe(
      "export * from '../../../../src/services/approvalFlowService';",
    );
  });

  it('keeps generic HRMS settings free of Approval Flow data access', () => {
    const settings = readFileSync(
      resolve(process.cwd(), 'packages/hrms-services/src/settings/settingsService.ts'),
      'utf8',
    );

    expect(settings).not.toMatch(/\.from\(\s*['"]approval_flows['"]\s*\)/);
    expect(settings).not.toMatch(/\.from\(\s*['"]approval_steps['"]\s*\)/);
  });
});
