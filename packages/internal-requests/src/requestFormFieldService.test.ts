import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@flc/supabase';
import { logUserAction } from '@flc/platform-services';
import {
  createRequestFormField,
  deleteRequestFormField,
  listRequestFieldOptions,
  listRequestFormFields,
  updateRequestFormField,
} from './requestFormFieldService';
import { makeFieldRow, queryResult, TEST_CONTEXT } from './test/fixtures';

vi.mock('@flc/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@flc/platform-services', () => ({ logUserAction: vi.fn().mockResolvedValue({ error: null }) }));

const from = vi.mocked(supabase.from);
beforeEach(() => vi.clearAllMocks());

describe('listRequestFormFields', () => {
  it('maps field_key → key', async () => {
    from.mockReturnValue(queryResult({ data: [makeFieldRow()] }) as never);
    const { data, error } = await listRequestFormFields('company-1', { includeInactive: true });
    expect(error).toBeNull();
    expect(data[0].key).toBe('asset_tag');
  });

  it('rejects a subcategoryKey that is not a clean slug (filter-injection guard)', async () => {
    const { data, error } = await listRequestFormFields('company-1', {
      categoryKey: 'support',
      subcategoryKey: 'hardware,subcategory_key.neq.x)',
    });
    expect(data).toEqual([]);
    expect(error).toMatch(/invalid subcategory key/i);
  });

  it('accepts a clean slug subcategoryKey', async () => {
    from.mockReturnValue(queryResult({ data: [makeFieldRow({ subcategory_key: 'hardware' })] }) as never);
    const { error } = await listRequestFormFields('company-1', { categoryKey: 'support', subcategoryKey: 'hardware' });
    expect(error).toBeNull();
  });
});

describe('createRequestFormField', () => {
  it('requires a label', async () => {
    const { error } = await createRequestFormField(
      { category_key: 'support', label: '  ', field_type: 'text' },
      TEST_CONTEXT,
    );
    expect(error).toMatch(/label is required/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a duplicate label within the same category/subcategory scope', async () => {
    from.mockReturnValueOnce(queryResult({ data: [makeFieldRow()] }) as never);
    const { error } = await createRequestFormField(
      { category_key: 'support', label: 'Asset tag', field_type: 'text' },
      TEST_CONTEXT,
    );
    expect(error).toMatch(/already exists/i);
  });

  it('creates a field and audits it', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [] }) as never)
      .mockReturnValueOnce(queryResult({ data: makeFieldRow({ id: 'field-new', field_key: 'serial', label: 'Serial' }) }) as never);
    const { data, error } = await createRequestFormField(
      { category_key: 'support', label: 'Serial', field_type: 'text' },
      TEST_CONTEXT,
    );
    expect(error).toBeNull();
    expect(data?.key).toBe('serial');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'create', 'request_form_field', 'field-new', expect.any(Object));
  });
});

describe('subcategory_key column drift (pre-migration DB)', () => {
  const MISSING_COLUMN = {
    message: "Could not find the 'subcategory_key' column of 'request_form_fields' in the schema cache",
  };

  it('retries a category-level create without the missing column', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [] }) as never) // existing-fields list
      .mockReturnValueOnce(queryResult({ data: null, error: MISSING_COLUMN }) as never) // insert w/ subcategory_key fails
      .mockReturnValueOnce(queryResult({ data: makeFieldRow({ id: 'field-new', field_key: 'serial', label: 'Serial' }) }) as never); // retry succeeds
    const { data, error } = await createRequestFormField(
      { category_key: 'support', label: 'Serial', field_type: 'text' },
      TEST_CONTEXT,
    );
    expect(error).toBeNull();
    expect(data?.key).toBe('serial');
    expect(from).toHaveBeenCalledTimes(3);
  });

  it('refuses a subcategory-scoped create with an actionable message (no silent strip)', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: [] }) as never)
      .mockReturnValueOnce(queryResult({ data: null, error: MISSING_COLUMN }) as never);
    const { data, error } = await createRequestFormField(
      { category_key: 'support', subcategory_key: 'hardware', label: 'Serial', field_type: 'text' },
      TEST_CONTEXT,
    );
    expect(data).toBeNull();
    expect(error).toMatch(/pending database update|apply the latest migrations/i);
    expect(from).toHaveBeenCalledTimes(2); // no retry
  });

  it('lists category fields when the subcategory filter hits a missing column', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: null, error: MISSING_COLUMN }) as never) // .or() filter fails
      .mockReturnValueOnce(queryResult({ data: [makeFieldRow()] }) as never); // legacy retry
    const { data, error } = await listRequestFormFields('company-1', { categoryKey: 'support', subcategoryKey: 'hardware' });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe('updateRequestFormField', () => {
  it('updates and logs before/after', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeFieldRow() }) as never) // before-snapshot
      .mockReturnValueOnce(queryResult({ data: makeFieldRow({ label: 'Asset tag #' }) }) as never);
    const { data, error } = await updateRequestFormField('field-1', { label: 'Asset tag #' }, TEST_CONTEXT);
    expect(error).toBeNull();
    expect(data?.label).toBe('Asset tag #');
    const meta = vi.mocked(logUserAction).mock.calls[0][4] as Record<string, unknown>;
    expect((meta.before as Record<string, unknown>).label).toBe('Asset tag');
  });

  it('returns a conflict when the version token no longer matches', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeFieldRow() }) as never)
      .mockReturnValueOnce(queryResult({ data: null }) as never);
    const { conflict } = await updateRequestFormField(
      'field-1',
      { label: 'X', expectedUpdatedAt: '2026-05-01T00:00:00.000Z' },
      TEST_CONTEXT,
    );
    expect(conflict).toBe(true);
    expect(logUserAction).not.toHaveBeenCalled();
  });
});

describe('deleteRequestFormField', () => {
  it('deletes and audits a before-snapshot', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeFieldRow() }) as never) // before-snapshot
      .mockReturnValueOnce(queryResult({ data: [{ id: 'field-1' }] }) as never);
    const { error } = await deleteRequestFormField('field-1', TEST_CONTEXT);
    expect(error).toBeNull();
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'delete', 'request_form_field', 'field-1', expect.objectContaining({ before: expect.any(Object) }));
  });

  it('returns a conflict when a versioned delete matches no rows', async () => {
    from
      .mockReturnValueOnce(queryResult({ data: makeFieldRow() }) as never)
      .mockReturnValueOnce(queryResult({ data: [] }) as never);
    const { conflict } = await deleteRequestFormField('field-1', TEST_CONTEXT, '2026-05-01T00:00:00.000Z');
    expect(conflict).toBe(true);
  });
});

describe('listRequestFieldOptions', () => {
  it('maps branch rows to options', async () => {
    from.mockReturnValue(queryResult({ data: [{ id: 'b1', code: 'HQ', name: 'Head Office' }] }) as never);
    const { data, error } = await listRequestFieldOptions('company-1', 'branches');
    expect(error).toBeNull();
    expect(data[0]).toEqual({ value: 'b1', label: 'HQ · Head Office', description: 'HQ' });
  });
});
