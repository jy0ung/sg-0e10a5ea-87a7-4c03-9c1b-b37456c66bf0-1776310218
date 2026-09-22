import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922141500_internal_request_atomic_review.sql',
  ),
  'utf8',
);

describe('Internal Request atomic approval review migration', () => {
  it('uses a hardened authenticated-only SECURITY DEFINER command', () => {
    expect(migration).toContain('review_internal_request_approval');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO authenticated');
  });

  it('serializes on the Approval Instance and Ticket rows', () => {
    expect(migration).toMatch(
      /FROM public\.approval_instances ai[\s\S]*?FOR UPDATE/,
    );
    expect(migration).toMatch(
      /FROM public\.tickets t[\s\S]*?FOR UPDATE/,
    );
    expect(migration).toContain('p_expected_step_id');
    expect(migration).toContain(
      'Approval review is stale because the current step has changed',
    );
    expect(migration).toContain("ERRCODE = '40001'");
  });

  it('keeps Decision, Instance, Ticket, and Activity state in one command', () => {
    expect(migration).toContain('INSERT INTO public.approval_decisions');
    expect(migration).toContain('UPDATE public.approval_instances');
    expect(migration).toContain('UPDATE public.tickets');
    expect(migration).toContain('INSERT INTO public.ticket_activity');
    expect(migration).toContain("status = 'rejected'");
    expect(migration).toContain("status = 'approved'");
  });

  it('authorizes only materialized specific/role approvers and enforces self approval', () => {
    expect(migration).toContain(
      'approval.current_approver_user_id = actor_id',
    );
    expect(migration).toContain(
      'public.employee_hrms_role_assignments',
    );
    expect(migration).toContain('r.is_active');
    expect(migration).toContain(
      'You are not the assigned approver for the current step',
    );
    expect(migration).toContain(
      'You cannot approve or reject your own request',
    );
  });

  it('resolves next role, fallback, specific-user, and canonical direct-manager routes', () => {
    expect(migration).toContain("next_step.approver_type = 'role'");
    expect(migration).toContain('fallback_approver_user_id');
    expect(migration).toContain("next_step.approver_type = 'specific_user'");
    expect(migration).toContain("next_step.approver_type = 'direct_manager'");
    expect(migration).toContain('manager_employee_id');
    expect(migration).toContain('p.employee_id');
  });
});
