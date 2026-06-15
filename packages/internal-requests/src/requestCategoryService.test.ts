import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@flc/supabase';
import { logUserAction } from '@flc/platform-services';
import {
  createRequestCategory,
  deleteRequestCategory,
  listRequestCategories,
  moveRequestCategory,
  updateRequestCategory,
} from './requestCategoryService';
import { makeCategoryRow, queryResult, TEST_CONTEXT } from './test/fixtures';

vi.mock('@flc/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@flc/platform-services', () => ({ logUserAction: vi.fn().mockResolvedValue({ error: null }) }));

const from = vi.mocked(supabase.from);

beforeEach(() => vi.clearAllMocks());

describe('listRequestCategories', () => {
  it('maps category_key → key and returns rows', async () => {
    from.mockReturnValue(queryResult({ data: [makeCategoryRow()] }) as never);
    const { data, error } = await listRequestCategories('company-1', { includeInactive: true });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe('support');
    expect(data[0].response_sla_hours).toBe(4);
  });

  it('returns the error string on DB failure', async () => {
    from.mockReturnValue(queryResult({ data: null, error: { message: 'boom' } }) as never);
    const { data, error } = await listRequestCategories('company-1');
    expect(error).toBe('boom');
    expect(data).toEqual([]);
  });

  it('falls back to the legacy SELECT when SLA columns are missing', async () => {
    // First select errors on response_sla_hours; the legacy retry succeeds.
    from
      .mockReturnValueOnce(queryResult({ data: null, error: { message: 'column response_sla_hours does not exist' } }) as never)
      .mockReturnValueOnce(queryResult({ data: [makeCategoryRow({ response_sla_hours: undefined, resolution_sla_hours: undefined })] }) as never);
    const { data, error } = await listRequestCategories('company-1');
    expect(error).toBeNull();
    expect(data[0].response_sla_hours).toBeNull();
    expect(from).toHaveBeenCalledTimes(2);
  });
});

describe('createRequestCategory', () => {
  it('rejects an empty label without touching the DB', async () => {
    const { data, error } = await createRequestCategory({ label: '   ' }, TEST_CONTEXT);
    expect(data).toBeNull();
    expect(error).toMatch(/required/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name (key collision)', async () => {
    from.mockReturnValueOnce(queryResult({ data: [makeCategoryRow()] }) as never); // existing list
    const { data, error } = await createRequestCategory({ label: 'Support' }, TEST_CONTEXT);
    expect(data).toBeNull();
    expect(error).toMatch(/already exists/i);
  });

  it('inserts and audits a new category', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [] }) as never) // no existing
      .mockReturnValueOnce(queryResult({ data: makeCategoryRow({ id: 'cat-new', category_key: 'billing', label: 'Billing' }) }) as never);
    const { data, error } = await createRequestCategory({ label: 'Billing' }, TEST_CONTEXT);
    expect(error).toBeNull();
    expect(data?.key).toBe('billing');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'create', 'request_category', 'cat-new', expect.any(Object));
  });

  it('stores an injection payload verbatim and slugs the key safely', async () => {
    const payload = "Robert'); DROP TABLE request_categories;--";
    let insertArg: Record<string, unknown> | undefined;
    const insertBuilder = queryResult({ data: makeCategoryRow({ id: 'cat-x' }) });
    (insertBuilder.insert as ReturnType<typeof vi.fn>).mockImplementation((arg: Record<string, unknown>) => {
      insertArg = arg;
      return insertBuilder;
    });
    from
      .mockReturnValueOnce(queryResult({ data: [] }) as never)
      .mockReturnValueOnce(insertBuilder as never);
    await createRequestCategory({ label: payload }, TEST_CONTEXT);
    // label is preserved verbatim (parameterized — never executed); key is a safe slug.
    expect(insertArg?.label).toBe(payload);
    expect(insertArg?.category_key).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('updateRequestCategory', () => {
  it('updates and logs a before/after diff', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [makeCategoryRow()] }) as never) // before-snapshot + collision list
      .mockReturnValueOnce(queryResult({ data: makeCategoryRow({ label: 'Support v2' }) }) as never);
    const { data, error } = await updateRequestCategory('cat-1', { label: 'Support v2' }, TEST_CONTEXT);
    expect(error).toBeNull();
    expect(data?.label).toBe('Support v2');
    const meta = vi.mocked(logUserAction).mock.calls[0][4] as Record<string, unknown>;
    expect(meta.changedFields).toContain('label');
    expect((meta.before as Record<string, unknown>).label).toBe('Support');
    expect((meta.after as Record<string, unknown>).label).toBe('Support v2');
  });

  it('rejects a rename that collides with another category', async () => {
    from.mockReturnValueOnce(queryResult({
      data: [makeCategoryRow(), makeCategoryRow({ id: 'cat-2', category_key: 'billing', label: 'Billing' })],
    }) as never);
    const { error } = await updateRequestCategory('cat-1', { label: 'Billing' }, TEST_CONTEXT);
    expect(error).toMatch(/already exists/i);
  });

  it('returns a conflict when the version token no longer matches', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [makeCategoryRow()] }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never); // 0 rows under the token
    const { data, error, conflict } = await updateRequestCategory(
      'cat-1',
      { label: 'X', expectedUpdatedAt: '2026-05-01T00:00:00.000Z' },
      TEST_CONTEXT,
    );
    expect(data).toBeNull();
    expect(conflict).toBe(true);
    expect(error).toMatch(/changed by someone else/i);
    expect(logUserAction).not.toHaveBeenCalled();
  });

  it('reports not found (no token) when zero rows match', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [makeCategoryRow()] }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never);
    const { conflict, error } = await updateRequestCategory('cat-1', { is_active: false }, TEST_CONTEXT);
    expect(conflict).toBeUndefined();
    expect(error).toMatch(/not found/i);
  });
});

describe('deleteRequestCategory', () => {
  it('returns inUse when tickets reference the category', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeCategoryRow() }) as never) // fetch single
      .mockReturnValueOnce(queryResult({ count: 3, error: null }) as never); // ticket count > 0
    const result = await deleteRequestCategory('cat-1', TEST_CONTEXT);
    expect(result.inUse).toBe(true);
    expect(result.error).toMatch(/existing requests/i);
  });

  it('returns inUse when a template references the category', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeCategoryRow() }) as never)
      .mockReturnValueOnce(queryResult({ count: 0, error: null }) as never) // tickets
      .mockReturnValueOnce(queryResult({ count: 1, error: null }) as never); // templates
    const result = await deleteRequestCategory('cat-1', TEST_CONTEXT);
    expect(result.inUse).toBe(true);
  });

  it('hard-deletes when unused and audits a before-snapshot', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeCategoryRow() }) as never)
      .mockReturnValueOnce(queryResult({ count: 0, error: null }) as never)
      .mockReturnValueOnce(queryResult({ count: 0, error: null }) as never)
      .mockReturnValueOnce(queryResult({ data: [{ id: 'cat-1' }] }) as never);
    const result = await deleteRequestCategory('cat-1', TEST_CONTEXT);
    expect(result.error).toBeNull();
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'delete', 'request_category', 'cat-1', expect.objectContaining({ before: expect.any(Object) }));
  });

  it('returns a conflict when a versioned delete matches no rows', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeCategoryRow() }) as never)
      .mockReturnValueOnce(queryResult({ count: 0, error: null }) as never)
      .mockReturnValueOnce(queryResult({ count: 0, error: null }) as never)
      .mockReturnValueOnce(queryResult({ data: [] }) as never); // 0 rows deleted
    const result = await deleteRequestCategory('cat-1', TEST_CONTEXT, '2026-05-01T00:00:00.000Z');
    expect(result.conflict).toBe(true);
  });

  it('returns not found when the category does not exist', async () => {
    from.mockReturnValueOnce(queryResult({ data: null, error: { message: 'no rows' } }) as never);
    const result = await deleteRequestCategory('missing', TEST_CONTEXT);
    expect(result.error).toMatch(/not found/i);
  });
});

describe('moveRequestCategory', () => {
  it('swaps sort_order with the adjacent category', async () => {
    from
      .mockReturnValueOnce(queryResult({
        data: [makeCategoryRow({ id: 'cat-1', sort_order: 10 }), makeCategoryRow({ id: 'cat-2', sort_order: 20 })],
      }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never) // update current
      .mockReturnValueOnce(queryResult({ data: null }) as never); // update target
    const { error } = await moveRequestCategory('cat-1', 'down', TEST_CONTEXT);
    expect(error).toBeNull();
    expect(from).toHaveBeenCalledTimes(3);
  });

  it('is a no-op at the boundary', async () => {
    from.mockReturnValueOnce(queryResult({ data: [makeCategoryRow({ id: 'cat-1' })] }) as never);
    const { error } = await moveRequestCategory('cat-1', 'up', TEST_CONTEXT);
    expect(error).toBeNull();
    expect(from).toHaveBeenCalledTimes(1); // list only, no swap writes
  });
});
