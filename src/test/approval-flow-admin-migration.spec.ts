import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922130000_approval_flow_admin_integrity.sql',
  ),
  'utf8',
);

describe('Approval Flow admin integrity migration', () => {
  it('preserves canonical flow and current-step history', () => {
    expect(migration).toContain('approval_instances_flow_id_fkey');
    expect(migration).toContain('approval_instances_current_step_id_fkey');
    expect(migration).toMatch(
      /FOREIGN KEY \(flow_id\)[\s\S]*?ON DELETE RESTRICT/,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(current_step_id\)[\s\S]*?ON DELETE RESTRICT/,
    );
  });

  it('blocks structural deletion after either approval engine has used the flow', () => {
    expect(migration).toContain('guard_used_approval_flow_step_mutation');
    expect(migration).toContain('guard_used_approval_flow_delete');
    expect(migration).toContain('FROM public.approval_instances ai WHERE ai.flow_id');
    expect(migration).toContain('FROM public.approval_requests ar WHERE ar.flow_id');
    expect(migration).toContain('structurally immutable');
    expect(migration).toContain('routing structure is immutable');
  });

  it('validates company ownership for Department, Profile, and UUID-form HRMS roles', () => {
    expect(migration).toContain('enforce_approval_flow_admin_integrity');
    expect(migration).toContain('Approval Flow Department must belong to the same company');
    expect(migration).toContain('have global scope');
    expect(migration).toContain('enforce_approval_step_admin_integrity');
    expect(migration).toContain('Approval Step HRMS Role must belong to the Flow company');
    expect(migration).toContain('Specific-user Approval Step requires an approver Profile');
  });

  it('saves flow and steps atomically under caller RLS', () => {
    expect(migration).toContain('save_approval_flow_with_steps');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain('DELETE FROM public.approval_steps');
    expect(migration).toContain('jsonb_array_elements(p_steps)');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('TO authenticated');
  });

  it('does not auto-rewrite historical workflow rows', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.approval_instances/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.approval_requests/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.approval_instances/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.approval_requests/i);
  });
});
