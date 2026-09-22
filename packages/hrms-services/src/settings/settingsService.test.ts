import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: any; error: { message: string } | null; count?: number | null };
const queued: Result[] = [];
const selectCalls: Array<{ table: string; columns: unknown; options: unknown }> = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const deleteCalls: string[] = [];

function nextResult(): Result {
  return queued.shift() ?? { data: null, error: null };
}

vi.mock('../shared/supabaseClient', () => {
  function query(table: string): any {
    const q: Record<string, any> = {};
    q.select = (columns?: unknown, options?: unknown) => {
      selectCalls.push({ table, columns, options });
      return q;
    };
    q.eq = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return q;
    };
    q.order = () => q;
    q.insert = () => q;
    q.update = () => q;
    q.delete = () => {
      deleteCalls.push(table);
      return q;
    };
    q.single = () => Promise.resolve(nextResult());
    q.then = (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject);
    return q;
  }

  return {
    supabase: {
      from: (table: string) => query(table),
    },
  };
});

import { deleteJobTitle, listJobTitles } from './settingsService';

beforeEach(() => {
  queued.length = 0;
  selectCalls.length = 0;
  eqCalls.length = 0;
  deleteCalls.length = 0;
  vi.clearAllMocks();
});

describe('canonical Job Title settings service', () => {
  it('lists Job Titles through the real Job Title department relationship', async () => {
    queued.push({
      data: [{
        id: 'job-1',
        company_id: 'c1',
        name: 'Sales Executive',
        department_id: 'dept-1',
        department: { name: 'Sales' },
        level: 'executive',
        description: null,
        is_active: true,
        created_at: '2026-09-22T00:00:00.000Z',
        updated_at: '2026-09-22T00:00:00.000Z',
      }],
      error: null,
    });

    const result = await listJobTitles('c1');

    expect(result[0]).toMatchObject({
      id: 'job-1',
      departmentId: 'dept-1',
      departmentName: 'Sales',
    });
    expect(selectCalls).toContainEqual({
      table: 'job_titles',
      columns: '*, department:departments!job_titles_department_id_fkey(name)',
      options: undefined,
    });
  });

  it('blocks deletion while canonical Employees are assigned', async () => {
    queued.push({ data: null, error: null, count: 2 });

    await expect(deleteJobTitle('c1', 'job-1')).rejects.toThrow(
      'Cannot delete: 2 employee(s) are assigned to this job title. Reassign them first.',
    );

    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'employees', column: 'company_id', value: 'c1' },
      { table: 'employees', column: 'job_title_id', value: 'job-1' },
    ]));
    expect(deleteCalls).toEqual([]);
  });

  it('deletes only after the canonical Employee reference count is zero', async () => {
    queued.push(
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    );

    await expect(deleteJobTitle('c1', 'job-1')).resolves.toBeUndefined();

    expect(deleteCalls).toEqual(['job_titles']);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'job_titles', column: 'company_id', value: 'c1' },
      { table: 'job_titles', column: 'id', value: 'job-1' },
    ]));
  });
});
