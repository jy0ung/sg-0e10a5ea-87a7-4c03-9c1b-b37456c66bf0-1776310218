import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: any; error: { message: string } | null };
const queued: Result[] = [];
const selectCalls: Array<{ table: string; columns: unknown }> = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const updateCalls: Array<{ table: string; payload: unknown }> = [];
const deleteCalls: string[] = [];
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

function nextResult(): Result {
  return queued.shift() ?? { data: null, error: null };
}

vi.mock('../shared/supabaseClient', () => {
  function query(table: string): any {
    const q: Record<string, any> = {};
    q.select = (columns?: unknown) => {
      selectCalls.push({ table, columns });
      return q;
    };
    q.eq = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return q;
    };
    q.in = (column: string, values: unknown[]) => {
      inCalls.push({ table, column, values });
      return q;
    };
    q.order = () => q;
    q.update = (payload: unknown) => {
      updateCalls.push({ table, payload });
      return q;
    };
    q.delete = () => {
      deleteCalls.push(table);
      return q;
    };
    q.then = (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject);
    return q;
  }

  return {
    supabase: {
      from: (table: string) => query(table),
      rpc: rpcMock,
    },
  };
});

import {
  deleteApprovalFlow,
  listApprovalFlows,
  toggleApprovalFlowActive,
  updateApprovalFlow,
} from './approvalFlowAdminService';

beforeEach(() => {
  queued.length = 0;
  selectCalls.length = 0;
  eqCalls.length = 0;
  inCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  vi.clearAllMocks();
});

describe('canonical Approval Flow admin service', () => {
  it('hydrates conditions, priority, Department, Profile, and HRMS Role names', async () => {
    const roleId = '11111111-1111-1111-1111-111111111111';
    queued.push(
      {
        data: [{
          id: 'flow-1',
          company_id: 'c1',
          name: 'Sales Approval',
          description: 'Sales workflow',
          entity_type: 'internal_request',
          is_active: true,
          created_by: 'profile-admin',
          updated_by: 'profile-admin',
          department_id: '22222222-2222-2222-2222-222222222222',
          department: { name: 'Sales' },
          is_default: false,
          conditions: { departmentId: '22222222-2222-2222-2222-222222222222', priority: 'high' },
          match_priority: 7,
          created_at: '2026-09-22T00:00:00.000Z',
          updated_at: '2026-09-22T01:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{
          id: 'step-1',
          flow_id: 'flow-1',
          step_order: 1,
          name: 'Manager Approval',
          approver_type: 'role',
          approver_role: roleId,
          approver_user_id: 'profile-1',
          approver_user: { name: 'Aisyah' },
          fallback_approver_user_id: 'profile-2',
          fallback_approver_user: { name: 'Daniel' },
          escalation_rule: null,
          condition_rule: null,
          is_active: true,
          allow_self_approval: false,
        }],
        error: null,
      },
      {
        data: [{ id: roleId, name: 'Department Manager' }],
        error: null,
      },
    );

    const result = await listApprovalFlows('c1');

    expect(result[0]).toMatchObject({
      id: 'flow-1',
      departmentName: 'Sales',
      conditions: {
        departmentId: '22222222-2222-2222-2222-222222222222',
        priority: 'high',
      },
      matchPriority: 7,
      steps: [{
        id: 'step-1',
        approverRole: roleId,
        approverRoleName: 'Department Manager',
        approverUserName: 'Aisyah',
        fallbackApproverUserName: 'Daniel',
      }],
    });
    expect(inCalls).toEqual(expect.arrayContaining([
      { table: 'approval_steps', column: 'flow_id', values: ['flow-1'] },
      { table: 'hrms_roles', column: 'id', values: [roleId] },
    ]));
  });

  it('preserves condition-routing fields on ordinary HRMS admin updates', async () => {
    rpcMock.mockResolvedValue({ data: 'flow-1', error: null });

    await updateApprovalFlow('c1', 'flow-1', {
      name: 'Leave Approval',
      description: 'Updated copy',
      entityType: 'leave_request',
      isActive: true,
      departmentId: null,
      isDefault: true,
      steps: [{
        stepOrder: 1,
        name: 'Manager',
        approverType: 'direct_manager',
        isActive: true,
        allowSelfApproval: false,
      }],
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'save_approval_flow_with_steps',
      expect.objectContaining({
        p_company_id: 'c1',
        p_flow_id: 'flow-1',
        p_preserve_conditions: true,
        p_preserve_match_priority: true,
        p_conditions: null,
        p_match_priority: null,
        p_steps: [{
          name: 'Manager',
          approverType: 'direct_manager',
          approverRole: null,
          approverUserId: null,
          fallbackApproverUserId: null,
          escalationRule: null,
          conditionRule: null,
          isActive: true,
          allowSelfApproval: false,
        }],
      }),
    );
  });

  it('passes explicit conditions and priority to the atomic command', async () => {
    rpcMock.mockResolvedValue({ data: 'flow-1', error: null });

    await updateApprovalFlow('c1', 'flow-1', {
      name: 'Conditional',
      entityType: 'internal_request',
      isActive: true,
      departmentId: null,
      isDefault: false,
      conditions: { categoryKey: 'service', priority: 'critical' },
      matchPriority: 40,
      steps: [{
        stepOrder: 1,
        name: 'HR Review',
        approverType: 'specific_user',
        approverUserId: '33333333-3333-3333-3333-333333333333',
        isActive: true,
        allowSelfApproval: false,
      }],
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'save_approval_flow_with_steps',
      expect.objectContaining({
        p_preserve_conditions: false,
        p_preserve_match_priority: false,
        p_conditions: { categoryKey: 'service', priority: 'critical' },
        p_match_priority: 40,
      }),
    );
  });

  it('records the actor Profile when toggling active state', async () => {
    queued.push({ data: null, error: null });

    await expect(
      toggleApprovalFlowActive('c1', 'flow-1', false, 'profile-admin'),
    ).resolves.toBeUndefined();

    expect(updateCalls).toEqual([
      {
        table: 'approval_flows',
        payload: expect.objectContaining({
          is_active: false,
          updated_by: 'profile-admin',
        }),
      },
    ]);
    expect(eqCalls).toEqual(expect.arrayContaining([
      { table: 'approval_flows', column: 'company_id', value: 'c1' },
      { table: 'approval_flows', column: 'id', value: 'flow-1' },
    ]));
  });

  it('surfaces history-protection errors on delete', async () => {
    queued.push({
      data: null,
      error: { message: 'Approval Flow has workflow history and cannot be deleted. Deactivate it instead.' },
    });

    await expect(deleteApprovalFlow('c1', 'flow-1')).rejects.toThrow(
      'Approval Flow has workflow history and cannot be deleted. Deactivate it instead.',
    );
    expect(deleteCalls).toEqual(['approval_flows']);
  });
});
