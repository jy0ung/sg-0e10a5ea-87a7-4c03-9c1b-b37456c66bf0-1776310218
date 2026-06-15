import { vi } from 'vitest';

/**
 * Shared test helpers for the internal-request config service specs.
 *
 * `queryResult` builds a self-chaining, awaitable Supabase query-builder mock:
 * every builder method (`select`, `insert`, `update`, `delete`, `eq`, `or`,
 * `order`, `limit`, ...) returns the same builder, `single`/`maybeSingle`
 * resolve to the configured result, and the builder itself is thenable so a
 * directly-awaited query (`await supabase.from(t).select().eq()...`) resolves
 * too. Sequence multiple `from()` calls with `mockReturnValueOnce`.
 */
export function queryResult(result: { data?: unknown; error?: unknown; count?: unknown }) {
  const resolved = { data: null, error: null, ...result };
  const builder: Record<string, unknown> = {};
  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'or', 'is', 'in', 'not', 'filter', 'match',
    'order', 'limit', 'range', 'gte', 'lte', 'lt', 'gt',
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn().mockResolvedValue(resolved);
  builder.maybeSingle = vi.fn().mockResolvedValue(resolved);
  // Make the builder awaitable so `await query` (no terminal single) resolves.
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled, onRejected);
  return builder;
}

/** A category row as returned by the DB (snake_case `category_key`). */
export function makeCategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    company_id: 'company-1',
    category_key: 'support',
    label: 'Support',
    description: 'Support requests',
    response_sla_hours: 4,
    resolution_sla_hours: 24,
    is_active: true,
    sort_order: 10,
    approval_flow_id: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    updated_by: 'actor-1',
    ...overrides,
  };
}

export function makeSubcategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    company_id: 'company-1',
    category_key: 'support',
    subcategory_key: 'hardware',
    label: 'Hardware',
    description: 'Hardware issues',
    is_active: true,
    sort_order: 10,
    approval_flow_id: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    updated_by: 'actor-1',
    ...overrides,
  };
}

export function makeFieldRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'field-1',
    company_id: 'company-1',
    category_key: 'support',
    subcategory_key: null,
    field_key: 'asset_tag',
    label: 'Asset tag',
    field_type: 'text',
    data_source: null,
    placeholder: '',
    help_text: '',
    is_required: false,
    is_active: true,
    sort_order: 10,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    created_by: 'actor-1',
    ...overrides,
  };
}

export function makeTemplateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    company_id: 'company-1',
    name: 'Laptop request',
    description: 'Standard laptop request',
    category_key: 'support',
    subcategory_key: null,
    priority: 'medium',
    subject: 'New laptop',
    body: 'Please provision a laptop.',
    is_active: true,
    sort_order: 10,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    updated_by: 'actor-1',
    ...overrides,
  };
}

export const TEST_CONTEXT = { actorId: 'actor-1', companyId: 'company-1' };
