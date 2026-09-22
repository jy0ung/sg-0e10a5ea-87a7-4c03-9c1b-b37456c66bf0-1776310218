import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922150000_employee_sales_assignment_atomicity.sql',
  ),
  'utf8',
);

describe('Employee Sales assignment atomicity migration', () => {
  it('owns Employee and Sales Advisor assignment mutation in one SECURITY INVOKER command', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.mutate_employee_with_assignments');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('INSERT INTO public.employees');
    expect(migration).toContain('UPDATE public.employees');
    expect(migration).toContain('INSERT INTO public.employee_module_assignments');
    expect(migration).toContain("module_key = 'sales'");
    expect(migration).toContain("assignment_role = 'sales_advisor'");
    expect(migration).toContain('ON CONFLICT (employee_id, module_key, assignment_role)');
  });

  it('validates every company-scoped workforce reference before mutation', () => {
    expect(migration).toContain('FROM public.branches b');
    expect(migration).toContain('b.company_id = p_company_id');
    expect(migration).toContain('FROM public.employees manager_e');
    expect(migration).toContain('manager_e.company_id = p_company_id');
    expect(migration).toContain('FROM public.departments d');
    expect(migration).toContain('d.company_id = p_company_id');
    expect(migration).toContain('FROM public.job_titles jt');
    expect(migration).toContain('jt.company_id = p_company_id');
  });

  it('deactivates the canonical Sales Advisor assignment when the role leaves sales', () => {
    expect(migration).toContain("IF v_role = 'sales' THEN");
    expect(migration).toContain('SET is_primary = false');
    expect(migration).toContain('active = false');
    expect(migration).toContain('effective_to = COALESCE(effective_to, current_date)');
  });

  it('does not introduce a broad Employee trigger that could double-write the existing Sales Advisor command', () => {
    expect(migration).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER/i);
    expect(migration).toContain('Existing public.create_sales_advisor_employee(...) remains a separate');
  });

  it('keeps the command caller-scoped and blocks anonymous execution', () => {
    expect(migration).toContain('FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated, service_role');
  });
});
