import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueuedResult = {
  data: unknown;
  error: { message: string } | null;
};

const queuedResults: QueuedResult[] = [];
const updateCalls: Array<{ table: string; values: unknown }> = [];
const functionInvocations: Array<{ name: string; body: unknown }> = [];

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
    proxy.eq = (..._args: unknown[]) => proxy;
    proxy.or = (..._args: unknown[]) => proxy;
    proxy.order = (..._args: unknown[]) => proxy;
    proxy.update = (values: unknown) => {
      updateCalls.push({ table, values });
      return proxy;
    };
    proxy.then = (
      resolve: (value: QueuedResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(drainResolve()).then(resolve, reject);

    return proxy;
  }

  return {
    supabase: {
      from: (table: string) => makeProxy(table),
      functions: {
        invoke: (name: string, payload: { body: unknown }) => {
          functionInvocations.push({ name, body: payload.body });
          return Promise.resolve(drainResolve());
        },
      },
    },
  };
});

vi.mock('./auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue({ error: null }),
}));

import { inviteUser, listProfiles, updateProfile } from './profileService';

beforeEach(() => {
  queuedResults.length = 0;
  updateCalls.length = 0;
  functionInvocations.length = 0;
  vi.clearAllMocks();
});

describe('listProfiles', () => {
  it('returns profile rows including employee_id', async () => {
    queueResolves({
      data: [{ id: 'p1', email: 'user@company.com', name: 'User', role: 'analyst', company_id: 'c1', branch_id: null, employee_id: 'emp-1', access_scope: 'company', status: 'active', created_at: '2026-04-22T00:00:00.000Z' }],
      error: null,
    });

    const result = await listProfiles('c1');

    expect(result.error).toBeNull();
    expect(result.data[0].employee_id).toBe('emp-1');
  });

  it('surfaces an error when profile employee links are unavailable', async () => {
    queueResolves({ data: null, error: { message: 'column profiles.employee_id does not exist' } });

    const result = await listProfiles('c1');

    expect(result.error).toBe('column profiles.employee_id does not exist');
    expect(result.data).toEqual([]);
  });
});

describe('updateProfile', () => {
  it('surfaces an error when employee_id cannot be updated', async () => {
    queueResolves({ data: null, error: { message: 'column profiles.employee_id does not exist' } });

    const result = await updateProfile({
      id: 'p1',
      role: 'manager',
      employee_id: 'emp-1',
    }, {
      actorId: 'admin-1',
      companyId: 'c1',
    });

    expect(result.error).toBe('column profiles.employee_id does not exist');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({ role: 'manager', employee_id: 'emp-1' });
  });
});

describe('inviteUser', () => {
  it('passes employee_id to the invite-user function when provided', async () => {
    queueResolves({ data: { ok: true }, error: null });

    const result = await inviteUser({
      email: 'user@company.com',
      name: 'User',
      role: 'analyst',
      companyId: 'c1',
      employeeId: 'emp-1',
    });

    expect(result.error).toBeNull();
    expect(functionInvocations[0]).toMatchObject({
      name: 'invite-user',
      body: expect.objectContaining({ employee_id: 'emp-1' }),
    });
  });
});