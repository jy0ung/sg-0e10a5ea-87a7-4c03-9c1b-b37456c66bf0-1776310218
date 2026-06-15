import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@flc/supabase';
import { logUserAction } from '@flc/platform-services';
import {
  createRequestSubcategory,
  listRequestSubcategories,
  moveRequestSubcategory,
  updateRequestSubcategory,
} from './requestSubcategoryService';
import { makeSubcategoryRow, queryResult, TEST_CONTEXT } from './test/fixtures';

vi.mock('@flc/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@flc/platform-services', () => ({ logUserAction: vi.fn().mockResolvedValue({ error: null }) }));

const from = vi.mocked(supabase.from);
beforeEach(() => vi.clearAllMocks());

describe('listRequestSubcategories', () => {
  it('maps subcategory_key → key', async () => {
    from.mockReturnValue(queryResult({ data: [makeSubcategoryRow()] }) as never);
    const { data, error } = await listRequestSubcategories('company-1', { includeInactive: true });
    expect(error).toBeNull();
    expect(data[0].key).toBe('hardware');
    expect(data[0].category_key).toBe('support');
  });
});

describe('createRequestSubcategory', () => {
  it('requires a parent category and a label', async () => {
    expect((await createRequestSubcategory({ categoryKey: '', label: 'X' }, TEST_CONTEXT)).error).toMatch(/category is required/i);
    expect((await createRequestSubcategory({ categoryKey: 'support', label: '  ' }, TEST_CONTEXT)).error).toMatch(/name is required/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a duplicate subcategory within the same category', async () => {
    from.mockReturnValueOnce(queryResult({ data: [makeSubcategoryRow()] }) as never);
    const { error } = await createRequestSubcategory({ categoryKey: 'support', label: 'Hardware' }, TEST_CONTEXT);
    expect(error).toMatch(/already exists/i);
  });

  it('inserts and audits a new subcategory', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [] }) as never)
      .mockReturnValueOnce(queryResult({ data: makeSubcategoryRow({ id: 'sub-new', subcategory_key: 'software', label: 'Software' }) }) as never);
    const { data, error } = await createRequestSubcategory({ categoryKey: 'support', label: 'Software' }, TEST_CONTEXT);
    expect(error).toBeNull();
    expect(data?.key).toBe('software');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'create', 'request_subcategory', 'sub-new', expect.any(Object));
  });
});

describe('updateRequestSubcategory', () => {
  it('updates and logs a before/after diff', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [makeSubcategoryRow()] }) as never)
      .mockReturnValueOnce(queryResult({ data: makeSubcategoryRow({ label: 'Hardware v2' }) }) as never);
    const { data, error } = await updateRequestSubcategory('sub-1', { label: 'Hardware v2' }, TEST_CONTEXT);
    expect(error).toBeNull();
    expect(data?.label).toBe('Hardware v2');
    const meta = vi.mocked(logUserAction).mock.calls[0][4] as Record<string, unknown>;
    expect((meta.before as Record<string, unknown>).label).toBe('Hardware');
  });

  it('returns not found when the id is absent from the company', async () => {
    from.mockReturnValueOnce(queryResult({ data: [makeSubcategoryRow()] }) as never);
    const { error } = await updateRequestSubcategory('missing', { label: 'X' }, TEST_CONTEXT);
    expect(error).toMatch(/not found/i);
  });

  it('returns a conflict when the version token no longer matches', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [makeSubcategoryRow()] }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never);
    const { conflict } = await updateRequestSubcategory(
      'sub-1',
      { label: 'X', expectedUpdatedAt: '2026-05-01T00:00:00.000Z' },
      TEST_CONTEXT,
    );
    expect(conflict).toBe(true);
    expect(logUserAction).not.toHaveBeenCalled();
  });
});

describe('moveRequestSubcategory', () => {
  it('swaps order within the same parent category', async () => {
    from
      .mockReturnValueOnce(queryResult({
        data: [
          makeSubcategoryRow({ id: 'sub-1', sort_order: 10 }),
          makeSubcategoryRow({ id: 'sub-2', sort_order: 20 }),
        ],
      }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never);
    const { error } = await moveRequestSubcategory('sub-1', 'down', TEST_CONTEXT);
    expect(error).toBeNull();
    expect(from).toHaveBeenCalledTimes(3);
  });
});
