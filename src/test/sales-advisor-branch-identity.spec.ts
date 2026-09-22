import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  resolve(process.cwd(), 'src/pages/sales/SalesAdvisors.tsx'),
  'utf8',
);
const service = readFileSync(
  resolve(process.cwd(), 'packages/hrms-services/src/employee/salesAdvisorService.ts'),
  'utf8',
);

describe('Sales Advisor branch identity contract', () => {
  it('uses canonical branch IDs in the Sales Advisor UI', () => {
    expect(page).toContain('branchId');
    expect(page).toContain('key={b.id} value={b.id}');
    expect(page).toContain('branchNameMap[a.branchId]');
    expect(page).not.toContain('key={b.code} value={b.code}');
  });

  it('passes branchId to the canonical create RPC', () => {
    expect(service).toContain('p_branch_id: input.branchId');
    expect(service).not.toContain('p_branch_id: input.branch');
  });
});
