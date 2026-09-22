import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922101500_department_head_employee_company.sql',
  ),
  'utf8',
);

describe('Department head Employee company integrity migration', () => {
  it('enforces same-company Department head ownership', () => {
    expect(migration).toContain('enforce_department_head_employee_company');
    expect(migration).toContain(
      'employee_company_id IS DISTINCT FROM NEW.company_id',
    );
    expect(migration).toContain("ERRCODE = '23514'");
  });

  it('uses a hardened trigger function', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.enforce_department_head_employee_company() FROM PUBLIC, anon',
    );
  });

  it('does not rewrite or guess historical Department head identity', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.departments/i);
    expect(migration).not.toMatch(/employee.*name\s*=/i);
  });
});
