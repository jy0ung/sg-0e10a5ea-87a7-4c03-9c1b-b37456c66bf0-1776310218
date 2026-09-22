import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Internal Request atomic review boundary', () => {
  it('keeps review business-state writes behind the atomic RPC', () => {
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

    const body = source.slice(start, end);
    expect(body).toContain("review_internal_request_approval");
    expect(body).toContain('p_expected_step_id');
    expect(body).not.toMatch(/\.from\(\s*['"]approval_decisions['"]\s*\)/);
    expect(body).not.toMatch(/\.from\(\s*['"]approval_instances['"]\s*\)/);
    expect(body).not.toMatch(/\.from\(\s*['"]tickets['"]\s*\)/);
    expect(body).not.toMatch(/\.from\(\s*['"]ticket_activity['"]\s*\)/);
  });

  it('requires the expected Step token in workflow commands and the workspace action', () => {
    const workflow = readFileSync(
      resolve(
        process.cwd(),
        'packages/internal-requests/src/ticketWorkflow.ts',
      ),
      'utf8',
    );
    const workspace = readFileSync(
      resolve(process.cwd(), 'src/pages/tickets/TicketWorkspace.tsx'),
      'utf8',
    );
    const ticketService = readFileSync(
      resolve(process.cwd(), 'src/services/ticketService.ts'),
      'utf8',
    );

    expect(workflow).toContain(
      "{ kind: 'approve_step'; expectedStepId: string;",
    );
    expect(workflow).toContain(
      "{ kind: 'reject_step'; expectedStepId: string;",
    );
    expect(workspace).toContain('ticket.current_approval_step_id');
    expect(workspace).toContain('expectedStepId');
    expect(ticketService).toContain('current_approval_step_id: approval.currentStepId');
    expect(ticketService).toContain('command.payload.expectedStepId');
  });
});
