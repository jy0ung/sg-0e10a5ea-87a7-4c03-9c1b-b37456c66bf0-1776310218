import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922143000_employee_history_delete_restrict.sql',
  ),
  'utf8',
);

describe('Employee history deletion safety migration', () => {
  const historicalConstraints = [
    'leave_balances_employee_id_fkey',
    'leave_requests_employee_id_fkey',
    'attendance_records_employee_id_fkey',
    'payroll_items_employee_id_fkey',
    'appraisal_items_employee_id_fkey',
  ];

  it('changes every historical Employee FK to ON DELETE RESTRICT', () => {
    for (const constraint of historicalConstraints) {
      const start = migration.indexOf(`ADD CONSTRAINT ${constraint}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const segment = migration.slice(start, start + 260);
      expect(segment).toContain('REFERENCES public.employees(id)');
      expect(segment).toContain('ON DELETE RESTRICT');
      expect(segment).not.toContain('ON DELETE CASCADE');
    }
  });

  it('does not rewrite or delete historical HR data', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.(leave_|attendance_|payroll_|appraisal_)/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.(leave_|attendance_|payroll_|appraisal_)/i);
  });

  it('leaves derived/access Employee relationships outside this migration', () => {
    expect(migration).not.toContain('employee_module_assignments');
    expect(migration).not.toContain('employee_hrms_role_assignments');
    expect(migration).not.toContain('profiles_employee_id');
  });
});
