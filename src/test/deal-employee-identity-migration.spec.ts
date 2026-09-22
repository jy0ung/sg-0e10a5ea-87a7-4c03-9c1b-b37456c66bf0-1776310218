import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260922090000_deal_employee_sales_advisor_identity.sql'),
  'utf8',
);

describe('Deal Employee identity migration', () => {
  it('is additive and preserves legacy Profile ownership', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS sales_advisor_employee_id uuid');
    expect(migration).toContain('REFERENCES public.employees(id)');
    expect(migration).not.toMatch(/DROP COLUMN\s+sales_advisor_id/i);
    expect(migration).not.toMatch(/DROP TABLE\s+public\.sales_advisors/i);
  });

  it('backfills only deterministic same-company Profile to Employee links', () => {
    expect(migration).toContain('d.sales_advisor_id = p.id');
    expect(migration).toContain('p.employee_id IS NOT NULL');
    expect(migration).toContain('p.company_id = d.company_id');
    expect(migration).not.toMatch(/sales_advisor_name\s*=/i);
  });

  it('rejects cross-company Employee ownership in the database', () => {
    expect(migration).toContain('enforce_deal_sales_advisor_employee_company');
    expect(migration).toContain('employee_company_id IS DISTINCT FROM NEW.company_id');
    expect(migration).toContain("ERRCODE = '23514'");
  });

  it('does not expose the trigger function to anonymous callers', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.enforce_deal_sales_advisor_employee_company() FROM PUBLIC, anon',
    );
  });
});
