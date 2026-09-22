import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Internal Request approval review mutation boundary', () => {
  it('uses the atomic review RPC for business-state mutation', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'packages/internal-requests/src/requestApprovalService.ts',
      ),
      'utf8',
    );

    const start = source.indexOf(
      'export async function reviewInternalRequestApproval',
    );
    const end = source.indexOf(
      '/**\n * Mark the approval instance',
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const review = source.slice(start, end);
    expect(review).toContain("'review_internal_request_approval'");
    expect(review).toContain('p_expected_step_id');
    expect(review).not.toMatch(/\.from\(\s*['"]approval_decisions['"]\s*\)/);
    expect(review).not.toMatch(/\.from\(\s*['"]approval_instances['"]\s*\)[\s\S]*?\.update\(/);
    expect(review).not.toMatch(/\.from\(\s*['"]tickets['"]\s*\)[\s\S]*?\.update\(/);
    expect(review).not.toMatch(/\.from\(\s*['"]ticket_activity['"]\s*\)[\s\S]*?\.insert\(/);
  });

  it('keeps notifications and audit after the RPC result', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'packages/internal-requests/src/requestApprovalService.ts',
      ),
      'utf8',
    );
    const start = source.indexOf(
      'export async function reviewInternalRequestApproval',
    );
    const end = source.indexOf('/**\n * Mark the approval instance', start);
    const review = source.slice(start, end);

    const rpcIndex = review.indexOf("'review_internal_request_approval'");
    expect(review.indexOf('createNotifications')).toBeGreaterThan(rpcIndex);
    expect(review.indexOf('logUserAction')).toBeGreaterThan(rpcIndex);
  });
});
