import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  createRoutingRule,
  deleteRoutingRule,
  evaluateRoutingRules,
  listRoutingRules,
  updateRoutingRule,
} from './requestRoutingService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// ── helpers ─────────────────────────────────────────────────────────────────

function makeRule(overrides: {
  id?: string;
  is_active?: boolean;
  sort_order?: number;
  match_category?: string | null;
  match_subcategory?: string | null;
  match_submitter_role?: string | null;
  match_priority?: string | null;
  assign_to_user_id?: string;
}) {
  return {
    id: overrides.id ?? 'rule-1',
    company_id: 'company-1',
    name: 'Test Rule',
    is_active: overrides.is_active ?? true,
    sort_order: overrides.sort_order ?? 0,
    match_category: overrides.match_category ?? null,
    match_subcategory: overrides.match_subcategory ?? null,
    match_submitter_role: overrides.match_submitter_role ?? null,
    match_priority: overrides.match_priority ?? null,
    assign_to_user_id: overrides.assign_to_user_id ?? 'user-99',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    created_by: null,
  };
}

/** Builds a chain mock: supabase.from().select().eq().order() → resolves with rows */
function buildSelectChain(rows: object[] | null, error: object | null = null) {
  const order = vi.fn().mockResolvedValue({ data: rows, error });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, order };
}

// ── listRoutingRules ─────────────────────────────────────────────────────────

describe('listRoutingRules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns rules ordered by sort_order for the given company', async () => {
    const rows = [makeRule({ sort_order: 0 }), makeRule({ id: 'rule-2', sort_order: 1 })];
    const chain = buildSelectChain(rows);
    vi.mocked(supabase.from).mockReturnValue({ select: chain.select } as never);

    const { data, error } = await listRoutingRules('company-1');

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('rule-1');
    expect(data[1].id).toBe('rule-2');
  });

  it('returns empty array and error string on DB failure', async () => {
    const chain = buildSelectChain(null, { message: 'DB error' });
    vi.mocked(supabase.from).mockReturnValue({ select: chain.select } as never);

    const { data, error } = await listRoutingRules('company-1');

    expect(error).toBe('DB error');
    expect(data).toEqual([]);
  });
});

// ── evaluateRoutingRules ─────────────────────────────────────────────────────

describe('evaluateRoutingRules', () => {
  beforeEach(() => vi.clearAllMocks());

  function setupRules(rules: ReturnType<typeof makeRule>[]) {
    const chain = buildSelectChain(rules);
    vi.mocked(supabase.from).mockReturnValue({ select: chain.select } as never);
  }

  it('returns null when there are no rules', async () => {
    setupRules([]);
    const result = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'medium', submitterRole: null,
    });
    expect(result).toBeNull();
  });

  it('returns the assignee for a catch-all rule (all conditions null)', async () => {
    setupRules([makeRule({ assign_to_user_id: 'agent-1' })]);
    const result = await evaluateRoutingRules('company-1', {
      category: 'any_category', subcategory: null, priority: 'high', submitterRole: null,
    });
    expect(result).toBe('agent-1');
  });

  it('matches a rule by category', async () => {
    setupRules([
      makeRule({ match_category: 'procurement', assign_to_user_id: 'agent-proc' }),
    ]);

    const hit = await evaluateRoutingRules('company-1', {
      category: 'procurement', subcategory: null, priority: 'medium', submitterRole: null,
    });
    expect(hit).toBe('agent-proc');

    setupRules([makeRule({ match_category: 'procurement', assign_to_user_id: 'agent-proc' })]);
    const miss = await evaluateRoutingRules('company-1', {
      category: 'operations', subcategory: null, priority: 'medium', submitterRole: null,
    });
    expect(miss).toBeNull();
  });

  it('matches a rule by priority', async () => {
    setupRules([makeRule({ match_priority: 'high', assign_to_user_id: 'agent-hi' })]);

    const hit = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'high', submitterRole: null,
    });
    expect(hit).toBe('agent-hi');

    setupRules([makeRule({ match_priority: 'high', assign_to_user_id: 'agent-hi' })]);
    const miss = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'low', submitterRole: null,
    });
    expect(miss).toBeNull();
  });

  it('matches a rule by submitter role', async () => {
    setupRules([makeRule({ match_submitter_role: 'sales_advisor', assign_to_user_id: 'agent-sa' })]);

    const hit = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'medium', submitterRole: 'sales_advisor',
    });
    expect(hit).toBe('agent-sa');

    setupRules([makeRule({ match_submitter_role: 'sales_advisor', assign_to_user_id: 'agent-sa' })]);
    const miss = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'medium', submitterRole: 'manager',
    });
    expect(miss).toBeNull();
  });

  it('matches a rule by subcategory', async () => {
    setupRules([
      makeRule({
        match_category: 'ops',
        match_subcategory: 'stock_transfer',
        assign_to_user_id: 'agent-st',
      }),
    ]);

    const hit = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: 'stock_transfer', priority: 'medium', submitterRole: null,
    });
    expect(hit).toBe('agent-st');

    setupRules([
      makeRule({ match_category: 'ops', match_subcategory: 'stock_transfer', assign_to_user_id: 'agent-st' }),
    ]);
    const miss = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: 'vin_transfer', priority: 'medium', submitterRole: null,
    });
    expect(miss).toBeNull();
  });

  it('skips inactive rules', async () => {
    setupRules([
      makeRule({ is_active: false, assign_to_user_id: 'agent-inactive' }),
    ]);
    const result = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'medium', submitterRole: null,
    });
    expect(result).toBeNull();
  });

  it('uses first-match-wins ordering', async () => {
    setupRules([
      makeRule({ id: 'rule-1', sort_order: 0, assign_to_user_id: 'agent-first' }),
      makeRule({ id: 'rule-2', sort_order: 1, assign_to_user_id: 'agent-second' }),
    ]);
    const result = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'medium', submitterRole: null,
    });
    expect(result).toBe('agent-first');
  });

  it('returns null and does not throw when listRoutingRules fails', async () => {
    // Simulate supabase throwing
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('Network error');
    });
    const result = await evaluateRoutingRules('company-1', {
      category: 'ops', subcategory: null, priority: 'medium', submitterRole: null,
    });
    expect(result).toBeNull();
  });
});

// ── createRoutingRule ────────────────────────────────────────────────────────

describe('createRoutingRule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends the rule after the highest existing sort_order', async () => {
    const newRow = makeRule({ sort_order: 2 });

    const maybeSingle = vi.fn().mockResolvedValue({ data: { sort_order: 1 }, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const tailSelect = vi.fn(() => ({ eq }));

    const single = vi.fn().mockResolvedValue({ data: newRow, error: null });
    const insertSelect = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    vi.mocked(supabase.from)
      .mockReturnValueOnce({ select: tailSelect } as never)
      .mockReturnValueOnce({ insert } as never);

    const { data, error } = await createRoutingRule(
      { name: 'New Rule', assign_to_user_id: 'user-5' },
      { actorId: 'actor-1', companyId: 'company-1' },
    );

    expect(error).toBeNull();
    expect(data?.sort_order).toBe(2);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      sort_order: 2,
      company_id: 'company-1',
      name: 'New Rule',
      assign_to_user_id: 'user-5',
    }));
  });
});

// ── updateRoutingRule ────────────────────────────────────────────────────────

describe('updateRoutingRule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes the update to the company and returns the updated rule', async () => {
    const updatedRow = makeRule({ is_active: false });
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const updateSelect = vi.fn(() => ({ single }));
    const eq2 = vi.fn(() => ({ select: updateSelect }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    vi.mocked(supabase.from).mockReturnValue({ update } as never);

    const { data, error } = await updateRoutingRule(
      'rule-1',
      { is_active: false },
      { actorId: 'actor-1', companyId: 'company-1' },
    );

    expect(error).toBeNull();
    expect(data?.is_active).toBe(false);
    expect(eq1).toHaveBeenCalledWith('id', 'rule-1');
    expect(eq2).toHaveBeenCalledWith('company_id', 'company-1');
  });
});

// ── deleteRoutingRule ────────────────────────────────────────────────────────

describe('deleteRoutingRule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes the deletion to the company', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as never);

    const { error } = await deleteRoutingRule('rule-1', { actorId: 'actor-1', companyId: 'company-1' });

    expect(error).toBeNull();
    expect(eq1).toHaveBeenCalledWith('id', 'rule-1');
    expect(eq2).toHaveBeenCalledWith('company_id', 'company-1');
  });
});
