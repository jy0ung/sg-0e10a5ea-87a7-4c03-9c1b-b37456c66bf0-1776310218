import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260922093000_create_sales_advisor_employee_command.sql'),
  'utf8',
);

describe('Sales Advisor canonical create command', () => {
  it('uses invoker rights and caller RLS', () => {
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).not.toContain('SECURITY DEFINER');
  });

  it('creates Employee and module assignment in one function', () => {
    expect(migration).toContain('INSERT INTO public.employees');
    expect(migration).toContain('INSERT INTO public.employee_module_assignments');
    expect(migration).toContain("'sales_advisor'");
    expect(migration).not.toContain('INSERT INTO public.sales_advisors');
  });

  it('validates branch/company scope and protects function exposure', () => {
    expect(migration).toContain('b.company_id = p_company_id');
    expect(migration).toContain('FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated');
  });
});
