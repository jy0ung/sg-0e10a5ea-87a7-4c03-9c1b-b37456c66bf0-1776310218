import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ticketService = readFileSync(
  resolve(process.cwd(), 'src/services/ticketService.ts'),
  'utf8',
);

describe('Internal Request approval UI permission boundary', () => {
  it('uses the package-owned canonical materialized-approver helper', () => {
    expect(ticketService).toContain('canProfileReviewInternalRequestApproval');
    expect(ticketService).toContain(
      'const reviewPermission = await canProfileReviewInternalRequestApproval(',
    );
    expect(ticketService).toContain(
      'if (!isRequester && !canManagePortalQueue && !canReviewApproval)',
    );
  });

  it('does not gate approval review through app-level admin roles', () => {
    const workspaceStart = ticketService.indexOf(
      'export async function getTicketWorkspaceData',
    );
    const workspaceEnd = ticketService.indexOf(
      'export interface TicketStatusCounts',
      workspaceStart,
    );
    const workspace = ticketService.slice(workspaceStart, workspaceEnd);

    expect(workspace).not.toContain("role === 'super_admin'");
    expect(workspace).not.toContain("role === 'company_admin'");
    expect(workspace).toContain('canReviewApproval,');
  });
});
