import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922143000_internal_request_approval_review_atomic.sql',
  ),
  'utf8',
);

describe('Internal Request atomic approval review migration', () => {
  it('serializes reviews and rejects stale step tokens', () => {
    expect(migration).toMatch(
      /FROM public\.approval_instances ai[\s\S]*?FOR UPDATE/i,
    );
    expect(migration).toContain(
      'instance_row.current_step_id IS DISTINCT FROM p_expected_step_id',
    );
    expect(migration).toContain('Approval step changed before this review was committed');
  });

  it('re-establishes workflow authorization inside the SECURITY DEFINER command', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('instance_row.current_approver_user_id = actor_id');
    expect(migration).toContain(
      'assignment.hrms_role_id::text = instance_row.current_approver_role',
    );
    expect(migration).toContain('role.is_active');
    expect(migration).toContain('You are not the assigned approver for the current step');
  });

  it('commits decision, rejection state, Ticket state, and activity in one function', () => {
    expect(migration).toMatch(/INSERT INTO public\.approval_decisions/i);
    expect(migration).toMatch(/UPDATE public\.approval_instances/i);
    expect(migration).toMatch(/UPDATE public\.tickets/i);
    expect(migration).toMatch(/INSERT INTO public\.ticket_activity/i);
    expect(migration).toContain("'Request rejected during approval.'");
    expect(migration).toContain("status = 'cancelled'");
  });

  it('resolves intermediate role, specific-user, fallback, and direct-manager routing', () => {
    expect(migration).toContain("next_step.approver_type = 'role'");
    expect(migration).toContain('next_role_has_assignee');
    expect(migration).toContain('fallback_approver_user_id');
    expect(migration).toContain("next_step.approver_type = 'specific_user'");
    expect(migration).toContain("next_step.approver_type = 'direct_manager'");
    expect(migration).toContain('manager_employee_id');
  });

  it('completes final approval and preserves post-commit notification authority outside SQL', () => {
    expect(migration).toContain("status = 'approved'");
    expect(migration).toContain("'Request approval completed.'");
    expect(migration).not.toMatch(/notifications/i);
    expect(migration).not.toMatch(/audit_logs/i);
  });

  it('exposes the command only to authenticated callers', () => {
    expect(migration).toContain(
      'ON FUNCTION public.review_internal_request_approval(text, uuid, uuid, text, text)',
    );
    expect(migration).toContain('FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated');
  });
});
