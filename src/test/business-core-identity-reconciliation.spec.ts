import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'scripts/business-core-identity-reconciliation.sql'),
  'utf8',
);

function executableSql(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

describe('Business Core identity reconciliation pack', () => {
  const executable = executableSql(sql);

  it('is read-only SQL', () => {
    expect(executable).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i,
    );
  });

  it('supports one-company or all-company scoping', () => {
    expect(sql).toContain('__COMPANY_ID__');
    expect(sql).toContain(
      "NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id",
    );
  });

  it('covers the required canonical and compatibility identity surfaces', () => {
    for (const table of [
      'public.profiles',
      'public.employees',
      'public.branches',
      'public.departments',
      'public.job_titles',
      'public.deals',
      'public.sales_advisors',
      'public.employee_module_assignments',
      'public.vehicles',
    ]) {
      expect(sql).toContain(table);
    }

    for (const issue of [
      'profiles_without_employee_link',
      'profiles_with_broken_employee_link',
      'profiles_with_cross_company_employee_link',
      'profile_employee_workforce_copy_mismatches',
      'employees_with_invalid_branch_reference',
      'employees_with_invalid_manager_reference',
      'employees_with_invalid_department_reference',
      'employees_with_invalid_job_title_reference',
      'deals_missing_canonical_sales_employee',
      'deals_with_profile_employee_disagreement',
      'legacy_sales_advisors_without_staff_code_employee_match',
      'legacy_sales_advisors_without_active_canonical_assignment',
      'vehicles_with_name_only_salesperson_compatibility',
      'vehicles_with_broken_salesman_profile',
      'vehicles_with_salesman_profile_without_employee',
      'vehicles_with_cross_company_salesman_employee',
    ]) {
      expect(sql).toContain(issue);
    }
  });

  it('uses deterministic same-company staff code for legacy Sales Advisor candidates', () => {
    expect(sql).toContain('e.company_id = sa.company_id');
    expect(sql).toContain('upper(btrim(sa.code)) = e.staff_code');
    expect(sql).toContain("ema.module_key = 'sales'");
    expect(sql).toContain("ema.assignment_role = 'sales_advisor'");

    expect(executable).not.toMatch(
      /\b(sa\.name\s*=\s*e\.name|lower\s*\(\s*sa\.name\s*\)\s*=|upper\s*\(\s*sa\.name\s*\)\s*=)/i,
    );
    expect(executable).not.toMatch(
      /\b(sa\.email\s*=|sa\.ic_no\s*=|sa\.contact_no\s*=)/i,
    );
  });

  it('derives Vehicle Employee candidates only from the existing Profile FK chain', () => {
    const vehicleSection = executable.slice(
      executable.indexOf('WITH params AS (', executable.indexOf('VEHICLE SALESPERSON COMPATIBILITY')),
    );

    expect(sql).toContain('LEFT JOIN public.profiles p ON p.id = v.salesman_id');
    expect(sql).toContain('LEFT JOIN public.employees e ON e.id = p.employee_id');
    expect(sql).toContain('deterministic_profile_employee_candidate');

    expect(vehicleSection).not.toMatch(
      /JOIN\s+public\.employees\s+\w+\s+ON[^;]*salesman_name/i,
    );
  });
});
