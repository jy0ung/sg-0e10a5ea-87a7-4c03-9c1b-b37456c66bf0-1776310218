import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueuedResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

const queuedResults: QueuedResult[] = [];
const insertCalls: Array<{ table: string; values: unknown }> = [];
const updateCalls: Array<{ table: string; values: unknown }> = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];

function queueResolves(...results: QueuedResult[]) {
  queuedResults.push(...results);
}

function drainResolve(): QueuedResult {
  return queuedResults.shift() ?? { data: null, error: null };
}

vi.mock('@/integrations/supabase/client', () => {
  function makeProxy(table: string): any {
    const proxy: Record<string, unknown> = {};

    proxy.select = (..._args: unknown[]) => proxy;
    proxy.eq = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return proxy;
    };
    proxy.in = (column: string, values: unknown[]) => {
      inCalls.push({ table, column, values });
      return proxy;
    };
    proxy.order = (..._args: unknown[]) => proxy;
    proxy.maybeSingle = () => Promise.resolve(drainResolve());
    proxy.single = () => Promise.resolve(drainResolve());
    proxy.insert = (values: unknown) => {
      insertCalls.push({ table, values });
      return proxy;
    };
    proxy.update = (values: unknown) => {
      updateCalls.push({ table, values });
      return proxy;
    };
    proxy.delete = () => proxy;
    proxy.then = (
      resolve: (value: QueuedResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(drainResolve()).then(resolve, reject);

    return proxy;
  }

  return {
    supabase: {
      from: (table: string) => makeProxy(table),
    },
  };
});

vi.mock('@/services/auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  createDepartment,
  listDepartments,
  updateDepartment,
} from './hrmsAdminService';

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  eqCalls.length = 0;
  inCalls.length = 0;
});

describe('listDepartments', () => {
  it('normalises employee-backed department heads without relying on a profiles join', async () => {
    queueResolves(
      {
        data: [{
          id: 'dept-1',
          company_id: 'c1',
          name: 'HR',
          description: null,
          head_employee_id: 'employee-1',
          cost_centre: 'CC-01',
          is_active: true,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        }],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{ id: 'employee-1', name: 'Aisyah Rahman' }],
        error: null,
      },
    );

    const result = await listDepartments('c1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      headEmployeeId: 'employee-1',
      headEmployeeName: 'Aisyah Rahman',
    });
    expect(inCalls).toEqual(expect.arrayContaining([
      { table: 'profiles', column: 'id', values: ['employee-1'] },
      { table: 'employees', column: 'id', values: ['employee-1'] },
    ]));
  });
});

describe('createDepartment', () => {
  it('falls back to the linked profile id when the schema is still profile-backed', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1' }, error: null },
      { data: null, error: { message: 'violates foreign key constraint "departments_head_employee_id_fkey"' } },
      {
        data: {
          id: 'dept-1',
          company_id: 'c1',
          name: 'HR',
          description: null,
          head_employee_id: 'profile-1',
          cost_centre: 'CC-01',
          is_active: true,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [{ id: 'profile-1', name: 'Aisyah Rahman', employee_id: 'employee-1' }],
        error: null,
      },
    );

    const result = await createDepartment('c1', 'admin-1', {
      name: 'HR',
      headEmployeeId: 'employee-1',
      costCentre: 'CC-01',
      isActive: true,
    });

    expect(result.error).toBeNull();
    expect(insertCalls).toEqual([
      {
        table: 'departments',
        values: expect.objectContaining({ head_employee_id: 'employee-1' }),
      },
      {
        table: 'departments',
        values: expect.objectContaining({ head_employee_id: 'profile-1' }),
      },
    ]);
    expect(result.data).toMatchObject({
      headEmployeeId: 'employee-1',
      headEmployeeName: 'Aisyah Rahman',
    });
  });
});

describe('updateDepartment', () => {
  it('falls back to the linked profile id on legacy head employee foreign keys', async () => {
    queueResolves(
      { data: null, error: null },
      { data: { id: 'profile-1' }, error: null },
      { data: null, error: { message: 'violates foreign key constraint "departments_head_employee_id_fkey"' } },
      { data: null, error: null },
    );

    const result = await updateDepartment('dept-1', 'admin-1', {
      name: 'HR',
      headEmployeeId: 'employee-1',
      costCentre: 'CC-01',
      isActive: true,
    });

    expect(result.error).toBeNull();
    expect(updateCalls).toEqual([
      {
        table: 'departments',
        values: expect.objectContaining({ head_employee_id: 'employee-1' }),
      },
      {
        table: 'departments',
        values: expect.objectContaining({ head_employee_id: 'profile-1' }),
      },
    ]);
  });
});