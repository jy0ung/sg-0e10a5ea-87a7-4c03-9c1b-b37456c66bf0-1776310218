import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@flc/supabase';
import { logUserAction } from '@flc/platform-services';
import {
  createRequestTemplate,
  deleteRequestTemplate,
  listRequestTemplates,
  moveRequestTemplate,
  updateRequestTemplate,
} from './requestTemplateService';
import { makeTemplateRow, queryResult, TEST_CONTEXT } from './test/fixtures';

vi.mock('@flc/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@flc/platform-services', () => ({ logUserAction: vi.fn().mockResolvedValue({ error: null }) }));

const from = vi.mocked(supabase.from);
beforeEach(() => vi.clearAllMocks());

describe('listRequestTemplates', () => {
  it('maps rows', async () => {
    from.mockReturnValue(queryResult({ data: [makeTemplateRow()] }) as never);
    const { data, error } = await listRequestTemplates('company-1', { includeInactive: true });
    expect(error).toBeNull();
    expect(data[0].name).toBe('Laptop request');
    expect(data[0].priority).toBe('medium');
  });
});

describe('createRequestTemplate', () => {
  it('validates required fields before any DB call', async () => {
    const base = { category_key: 'support', priority: 'medium' as const, subject: 'S', body: 'B' };
    expect((await createRequestTemplate({ ...base, name: '  ' }, TEST_CONTEXT)).error).toMatch(/name is required/i);
    expect((await createRequestTemplate({ ...base, name: 'T', category_key: '' }, TEST_CONTEXT)).error).toMatch(/category is required/i);
    expect((await createRequestTemplate({ ...base, name: 'T', subject: ' ' }, TEST_CONTEXT)).error).toMatch(/subject is required/i);
    expect((await createRequestTemplate({ ...base, name: 'T', body: ' ' }, TEST_CONTEXT)).error).toMatch(/body is required/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('inserts after computing the next sort_order, and audits', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: { sort_order: 20 } }) as never) // max sort
      .mockReturnValueOnce(queryResult({ data: makeTemplateRow({ id: 'tpl-new' }) }) as never);
    const { data, error } = await createRequestTemplate(
      { name: 'Laptop request', category_key: 'support', priority: 'medium', subject: 'New laptop', body: 'Provision' },
      TEST_CONTEXT,
    );
    expect(error).toBeNull();
    expect(data?.id).toBe('tpl-new');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'create', 'request_template', 'tpl-new', expect.any(Object));
  });
});

describe('updateRequestTemplate', () => {
  it('updates and logs before/after', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeTemplateRow() }) as never) // before-snapshot
      .mockReturnValueOnce(queryResult({ data: makeTemplateRow({ name: 'Laptop v2' }) }) as never);
    const { data, error } = await updateRequestTemplate('tpl-1', { name: 'Laptop v2' }, TEST_CONTEXT);
    expect(error).toBeNull();
    expect(data?.name).toBe('Laptop v2');
    const meta = vi.mocked(logUserAction).mock.calls[0][4] as Record<string, unknown>;
    expect((meta.before as Record<string, unknown>).name).toBe('Laptop request');
  });

  it('rejects an empty required field', async () => {
    const { error } = await updateRequestTemplate('tpl-1', { subject: '   ' }, TEST_CONTEXT);
    expect(error).toMatch(/subject is required/i);
  });

  it('returns a conflict when the version token no longer matches', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeTemplateRow() }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never);
    const { conflict } = await updateRequestTemplate(
      'tpl-1',
      { name: 'X', expectedUpdatedAt: '2026-05-01T00:00:00.000Z' },
      TEST_CONTEXT,
    );
    expect(conflict).toBe(true);
    expect(logUserAction).not.toHaveBeenCalled();
  });
});

describe('moveRequestTemplate', () => {
  it('swaps sort_order with the neighbour', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [{ id: 'tpl-1', sort_order: 10 }, { id: 'tpl-2', sort_order: 20 }] }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never);
    const { error } = await moveRequestTemplate('tpl-1', 'down', TEST_CONTEXT);
    expect(error).toBeNull();
  });
});

describe('deleteRequestTemplate', () => {
  it('deletes and audits a before-snapshot', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeTemplateRow() }) as never)
      .mockReturnValueOnce(queryResult({ data: [{ id: 'tpl-1' }] }) as never);
    const { error } = await deleteRequestTemplate('tpl-1', TEST_CONTEXT);
    expect(error).toBeNull();
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'delete', 'request_template', 'tpl-1', expect.objectContaining({ before: expect.any(Object) }));
  });

  it('returns a conflict when a versioned delete matches no rows', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeTemplateRow() }) as never)
      .mockReturnValueOnce(queryResult({ data: [] }) as never);
    const { conflict } = await deleteRequestTemplate('tpl-1', TEST_CONTEXT, '2026-05-01T00:00:00.000Z');
    expect(conflict).toBe(true);
  });
});
