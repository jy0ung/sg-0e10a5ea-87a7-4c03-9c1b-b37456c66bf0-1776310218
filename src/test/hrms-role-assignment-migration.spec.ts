import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922123000_hrms_role_assignment_integrity.sql',
  ),
  'utf8',
);

describe('HRMS role assignment integrity migration', () => {
  it('enforces role, Employee, and Profile ownership', () => {
    expect(migration).toContain('enforce_hrms_role_assignment_integrity');
    expect(migration).toContain(
      'role_company_id IS DISTINCT FROM NEW.company_id',
    );
    expect(migration).toContain(
      'employee_company_id IS DISTINCT FROM NEW.company_id',
    );
    expect(migration).toContain(
      "COALESCE(profile_access_scope, '') <> 'global'",
    );
    expect(migration).toContain(
      'profile_employee_id IS DISTINCT FROM NEW.employee_id',
    );
  });

  it('keeps the atomic replacement RPC under caller RLS', () => {
    expect(migration).toContain(
      'replace_hrms_role_employee_assignments',
    );
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain(
      'GRANT EXECUTE\n  ON FUNCTION public.replace_hrms_role_employee_assignments',
    );
    expect(migration).not.toMatch(
      /replace_hrms_role_employee_assignments[\s\S]{0,300}SECURITY DEFINER/,
    );
  });

  it('uses auth.uid for assignment metadata and preserves input order for primary assignment', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('WITH ORDINALITY');
    expect(migration).toContain(
      'ROW_NUMBER() OVER (ORDER BY r.first_ordinality, r.employee_id) = 1',
    );
  });

  it('does not auto-rewrite historical assignments', () => {
    const triggerStart = migration.indexOf(
      'CREATE OR REPLACE FUNCTION public.enforce_hrms_role_assignment_integrity',
    );
    expect(triggerStart).toBeGreaterThanOrEqual(0);
    expect(migration).not.toMatch(
      /UPDATE\s+public\.employee_hrms_role_assignments/i,
    );
  });
});
