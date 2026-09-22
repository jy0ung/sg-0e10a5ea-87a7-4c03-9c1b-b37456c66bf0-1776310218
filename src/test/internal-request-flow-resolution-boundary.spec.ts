import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Internal Request Approval Flow resolution boundary', () => {
  it('keeps pin and requester-context selection in the resolver module', () => {
    const service = readFileSync(
      resolve(
        process.cwd(),
        'packages/internal-requests/src/requestApprovalService.ts',
      ),
      'utf8',
    );

    expect(service).toContain('resolveInternalRequestApprovalFlowId');
    expect(service).not.toMatch(
      /\.from\(\s*['"]request_categories['"]\s*\)/,
    );
    expect(service).not.toMatch(
      /\.from\(\s*['"]request_subcategories['"]\s*\)/,
    );
    expect(service).not.toMatch(/\.from\(\s*['"]profiles['"]\s*\)[\s\S]{0,250}department_id/);
  });

  it('keeps the condition scorer inside @flc/internal-requests', () => {
    const resolver = readFileSync(
      resolve(
        process.cwd(),
        'packages/internal-requests/src/approvalFlowResolver.ts',
      ),
      'utf8',
    );

    expect(resolver).toContain('selectApprovalFlowCandidate');
    expect(resolver).toContain('match_priority');
    expect(resolver).toContain('conditions');
    expect(resolver).toContain('resolveInternalRequestApprovalFlowId');
  });
});
