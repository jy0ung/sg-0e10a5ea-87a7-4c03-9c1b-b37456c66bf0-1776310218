import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootEmployeeService = readFileSync(
  resolve(process.cwd(), 'src/services/hrms/employeeService.ts'),
  'utf8',
);
const packageEmployeeService = readFileSync(
  resolve(process.cwd(), 'packages/hrms-services/src/employee/employeeService.ts'),
  'utf8',
);
const hrmsWebEmployeeService = readFileSync(
  resolve(process.cwd(), 'apps/hrms-web/src/services/hrms/employeeService.ts'),
  'utf8',
);

describe('Employee Sales assignment service boundary', () => {
  it('routes root HRMS Employee creation through the package-owned atomic command', () => {
    expect(rootEmployeeService).toContain('await pkg.createEmployeeRecord({');
    expect(rootEmployeeService).not.toContain("supabase.from('employees').insert");
  });

  it('routes package Employee updates through one database-owned RPC', () => {
    expect(packageEmployeeService).toContain("'mutate_employee_with_assignments'");
    expect(packageEmployeeService).toContain('p_create: create');
    expect(packageEmployeeService).not.toContain('syncSalesAdvisorAssignment');
    expect(packageEmployeeService).not.toContain(".from('employee_module_assignments')\n      .upsert");
  });

  it('keeps the dedicated HRMS web service as a canonical re-export', () => {
    expect(hrmsWebEmployeeService.trim()).toBe(
      "export * from '../../../../../src/services/hrms/employeeService';",
    );
  });
});
