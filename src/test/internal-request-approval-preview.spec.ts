import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('New Request Approval Flow preview context', () => {
  it('includes priority in both cache identity and Flow resolution options', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/tickets/NewTicket.tsx'),
      'utf8',
    );

    expect(source).toContain("const selectedPriority = form.watch('priority');");
    expect(source).toMatch(
      /queryKey:\s*\[[\s\S]*?'approval-plan'[\s\S]*?selectedPriority[\s\S]*?\]/,
    );
    expect(source).toMatch(
      /getInternalRequestApprovalPlan\([\s\S]*?priority:\s*selectedPriority\s*\|\|\s*null/,
    );
  });
});
