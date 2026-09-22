import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@flc/supabase';
import {
  buildRequesterResolutionContext,
  resolveInternalRequestApprovalFlowId,
  selectApprovalFlowCandidate,
} from './approvalFlowResolver';

vi.mock('@flc/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function flow(overrides: Partial<{
  id: string;
  department_id: string | null;
  is_default: boolean;
  conditions: unknown;
  match_priority: number;
  created_at: string;
}> = {}) {
  return {
    id: overrides.id ?? 'flow-1',
    department_id: overrides.department_id ?? null,
    is_default: overrides.is_default ?? false,
    conditions: overrides.conditions ?? null,
    match_priority: overrides.match_priority ?? 0,
    created_at: overrides.created_at ?? '2026-09-22T00:00:00.000Z',
  };
}

function queryResult(data: unknown, error: { message: string } | null = null): any {
  const result = { data, error };
  const node: Record<string, any> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.maybeSingle = vi.fn().mockResolvedValue(result);
  node.then = (
    resolve: (value: typeof result) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return node;
}

function setupTableQueues(
  queues: Record<string, any[]>,
): void {
  const positions = new Map<string, number>();
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const index = positions.get(table) ?? 0;
    const queue = queues[table] ?? [];
    const next = queue[index];
    positions.set(table, index + 1);
    if (!next) throw new Error(`Unexpected Supabase table call: ${table} #${index + 1}`);
    return next;
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Approval Flow condition scorer', () => {
  it('matches the documented Internal Request condition context exactly', () => {
    const result = selectApprovalFlowCandidate(
      [flow({
        conditions: {
          departmentId: 'dept-sales',
          branchId: 'branch-a',
          requesterRole: 'sales',
          categoryKey: 'operations',
          subcategoryKey: 'stock_transfer',
          priority: 'high',
        },
      })],
      {
        departmentId: 'dept-sales',
        branchId: 'branch-a',
        requesterRole: 'sales',
        categoryKey: 'operations',
        subcategoryKey: 'stock_transfer',
        priority: 'high',
      },
    );

    expect(result).toBe('flow-1');
  });

  it('prefers the most specific matching Flow', () => {
    const result = selectApprovalFlowCandidate(
      [
        flow({ id: 'default', is_default: true }),
        flow({
          id: 'category',
          conditions: { categoryKey: 'operations' },
        }),
        flow({
          id: 'category-priority',
          conditions: { categoryKey: 'operations', priority: 'high' },
        }),
      ],
      { categoryKey: 'operations', priority: 'high' },
    );

    expect(result).toBe('category-priority');
  });

  it('uses higher match_priority as the documented specificity tiebreaker', () => {
    const result = selectApprovalFlowCandidate(
      [
        flow({
          id: 'low-priority',
          conditions: { categoryKey: 'operations' },
          match_priority: 10,
        }),
        flow({
          id: 'high-priority',
          conditions: { categoryKey: 'operations' },
          match_priority: 80,
        }),
      ],
      { categoryKey: 'operations' },
    );

    expect(result).toBe('high-priority');
  });

  it('prefers the explicit default over a legacy unconditional fallback', () => {
    const result = selectApprovalFlowCandidate(
      [
        flow({ id: 'legacy-fallback' }),
        flow({ id: 'explicit-default', is_default: true }),
      ],
      {},
    );

    expect(result).toBe('explicit-default');
  });

  it('rejects an unresolved top-level ambiguity instead of choosing arbitrarily', () => {
    expect(() =>
      selectApprovalFlowCandidate(
        [
          flow({
            id: 'flow-a',
            conditions: { categoryKey: 'operations' },
            match_priority: 20,
          }),
          flow({
            id: 'flow-b',
            conditions: { categoryKey: 'operations' },
            match_priority: 20,
          }),
        ],
        { categoryKey: 'operations' },
      ),
    ).toThrow(/ambiguous/i);
  });

  it('does not match an amount-conditioned Flow when Internal Requests has no canonical amount', () => {
    const result = selectApprovalFlowCandidate(
      [flow({ conditions: { amountMin: 1000 } })],
      { amount: null },
    );

    expect(result).toBeNull();
  });

  it('supports the legacy/current department_id compatibility field', () => {
    const result = selectApprovalFlowCandidate(
      [flow({ id: 'dept-flow', department_id: 'dept-1' })],
      { departmentId: 'dept-1' },
    );

    expect(result).toBe('dept-flow');
  });

  it('rejects conflicting department routing configuration', () => {
    expect(() =>
      selectApprovalFlowCandidate(
        [flow({
          department_id: 'dept-a',
          conditions: { departmentId: 'dept-b' },
        })],
        { departmentId: 'dept-a' },
      ),
    ).toThrow(/conflicting Department/i);
  });
});

describe('requester routing context', () => {
  it('uses canonical Employee organisation fields when an Employee exists', () => {
    const context = buildRequesterResolutionContext(
      {
        department_id: 'profile-dept',
        branch_id: 'profile-branch',
        role: 'manager',
      },
      {
        department_id: 'employee-dept',
        branch_id: 'employee-branch',
        primary_role: 'sales',
      },
      {
        categoryKey: 'operations',
        subcategoryKey: 'stock_transfer',
        priority: 'high',
      },
    );

    expect(context).toEqual({
      departmentId: 'employee-dept',
      branchId: 'employee-branch',
      requesterRole: 'sales',
      categoryKey: 'operations',
      subcategoryKey: 'stock_transfer',
      priority: 'high',
      amount: null,
    });
  });

  it('uses Profile compatibility fields only for an unlinked account', () => {
    const context = buildRequesterResolutionContext(
      {
        department_id: 'profile-dept',
        branch_id: 'profile-branch',
        role: 'manager',
      },
      null,
      { categoryKey: 'operations' },
    );

    expect(context).toMatchObject({
      departmentId: 'profile-dept',
      branchId: 'profile-branch',
      requesterRole: 'manager',
      categoryKey: 'operations',
    });
  });
});

describe('Internal Request Flow pin and scorer orchestration', () => {
  it('uses a valid subcategory pin before category pin or scorer', async () => {
    setupTableQueues({
      request_subcategories: [
        queryResult({ approval_flow_id: 'flow-sub' }),
      ],
      approval_flows: [
        queryResult({
          id: 'flow-sub',
          entity_type: 'internal_request',
          is_active: true,
        }),
      ],
    });

    await expect(
      resolveInternalRequestApprovalFlowId('c1', 'profile-1', {
        categoryKey: 'operations',
        subcategoryKey: 'stock_transfer',
        priority: 'high',
      }),
    ).resolves.toBe('flow-sub');

    expect(vi.mocked(supabase.from)).not.toHaveBeenCalledWith(
      'request_categories',
    );
    expect(vi.mocked(supabase.from)).not.toHaveBeenCalledWith('profiles');
  });

  it('rejects an inactive explicit pin instead of silently falling back', async () => {
    setupTableQueues({
      request_categories: [
        queryResult({ approval_flow_id: 'flow-inactive' }),
      ],
      approval_flows: [
        queryResult({
          id: 'flow-inactive',
          entity_type: 'internal_request',
          is_active: false,
        }),
      ],
    });

    await expect(
      resolveInternalRequestApprovalFlowId('c1', 'profile-1', {
        categoryKey: 'operations',
      }),
    ).rejects.toThrow(/inactive Approval Flow/i);

    expect(vi.mocked(supabase.from)).not.toHaveBeenCalledWith('profiles');
  });

  it('rejects a pin to the wrong workflow entity type', async () => {
    setupTableQueues({
      request_categories: [
        queryResult({ approval_flow_id: 'flow-leave' }),
      ],
      approval_flows: [
        queryResult({
          id: 'flow-leave',
          entity_type: 'leave_request',
          is_active: true,
        }),
      ],
    });

    await expect(
      resolveInternalRequestApprovalFlowId('c1', 'profile-1', {
        categoryKey: 'operations',
      }),
    ).rejects.toThrow(/non-Internal-Request/i);
  });

  it('loads Employee-first routing context before condition scoring', async () => {
    setupTableQueues({
      request_categories: [
        queryResult({ approval_flow_id: null }),
      ],
      profiles: [
        queryResult({
          company_id: 'c1',
          access_scope: 'company',
          employee_id: 'employee-1',
          department_id: 'profile-dept',
          branch_id: 'profile-branch',
          role: 'manager',
        }),
      ],
      employees: [
        queryResult({
          company_id: 'c1',
          department_id: 'employee-dept',
          branch_id: 'employee-branch',
          primary_role: 'sales',
        }),
      ],
      approval_flows: [
        queryResult([
          flow({
            id: 'flow-canonical',
            conditions: {
              departmentId: 'employee-dept',
              branchId: 'employee-branch',
              requesterRole: 'sales',
              categoryKey: 'operations',
              priority: 'high',
            },
          }),
        ]),
      ],
    });

    await expect(
      resolveInternalRequestApprovalFlowId('c1', 'profile-1', {
        categoryKey: 'operations',
        priority: 'high',
      }),
    ).resolves.toBe('flow-canonical');
  });

  it('fails loudly when a linked Employee cannot be resolved in the request company', async () => {
    setupTableQueues({
      request_categories: [
        queryResult({ approval_flow_id: null }),
      ],
      profiles: [
        queryResult({
          company_id: 'c1',
          access_scope: 'company',
          employee_id: 'employee-other-company',
          department_id: 'profile-dept',
          branch_id: 'profile-branch',
          role: 'manager',
        }),
      ],
      employees: [
        queryResult(null),
      ],
    });

    await expect(
      resolveInternalRequestApprovalFlowId('c1', 'profile-1', {
        categoryKey: 'operations',
      }),
    ).rejects.toThrow(/Employee.*does not belong/i);
  });
});
