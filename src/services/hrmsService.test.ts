import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks declared BEFORE vi.mock factories ───────────────────────────────────
// vi.mock calls are hoisted to the top by Vitest, so the factory must not
// reference variables defined at module scope (they won't be initialised yet).
// We solve this by having the factory return a fresh spy object and keeping a
// module-level reference to the supabase mock via a getter.

// Shared resolve slot — tests call `setNextResolve` to control what .single() returns
let _nextResolve: { data: unknown; error: unknown } | null = null;

function setNextResolve(value: { data: unknown; error: unknown }) {
  _nextResolve = value;
}

function drainResolve() {
  const v = _nextResolve ?? { data: null, error: null };
  _nextResolve = null;
  return v;
}

vi.mock('@/integrations/supabase/client', () => {
  function makeProxy(): Record<string, unknown> {
    const proxy: Record<string, unknown> = {};
    proxy.select  = (..._args: unknown[]) => makeProxy();
    proxy.eq      = (..._args: unknown[]) => makeProxy();
    proxy.single  = () => Promise.resolve(drainResolve());
    proxy.update  = (..._args: unknown[]) => makeProxy();
    proxy.insert  = (..._args: unknown[]) => makeProxy();
    proxy.delete  = () => makeProxy();
    proxy.order   = () => makeProxy();
    proxy.limit   = () => makeProxy();
    proxy.ilike   = () => makeProxy();
    // Make the proxy itself awaitable (non-single queries)
    proxy.then    = (resolve: (v: unknown) => void, _reject?: unknown) => {
      resolve(drainResolve());
      return Promise.resolve();
    };
    return proxy;
  }

  return {
    supabase: {
      from: (_table: string) => makeProxy(),
    },
  };
});

vi.mock('@/services/auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (AFTER mocks) ─────────────────────────────────────────────────────
import {
  reviewLeaveRequest,
  updatePayrollRunStatus,
} from './hrmsService';

// ── reviewLeaveRequest ────────────────────────────────────────────────────────
describe('reviewLeaveRequest', () => {
  beforeEach(() => { vi.clearAllMocks(); _nextResolve = null; });

  it('blocks self-approval when reviewer === employee', async () => {
    setNextResolve({ data: { employee_id: 'user-abc' }, error: null });
    const result = await reviewLeaveRequest('req-1', 'user-abc', 'approved');
    expect(result.error).toMatch(/cannot approve.*own leave/i);
  });

  it('proceeds when reviewer !== employee', async () => {
    setNextResolve({ data: { employee_id: 'emp-999' }, error: null });
    const result = await reviewLeaveRequest('req-1', 'manager-001', 'approved');
    expect(result.error).toBeNull();
  });
});

// ── updatePayrollRunStatus ────────────────────────────────────────────────────
describe('updatePayrollRunStatus', () => {
  beforeEach(() => { vi.clearAllMocks(); _nextResolve = null; });

  it('blocks invalid transition: paid → draft', async () => {
    setNextResolve({ data: { status: 'paid' }, error: null });
    const result = await updatePayrollRunStatus('run-1', 'draft');
    expect(result.error).toMatch(/cannot transition/i);
  });

  it('blocks invalid transition: draft → paid', async () => {
    setNextResolve({ data: { status: 'draft' }, error: null });
    const result = await updatePayrollRunStatus('run-1', 'paid');
    expect(result.error).toMatch(/cannot transition/i);
  });

  it('blocks invalid transition: finalised → draft', async () => {
    setNextResolve({ data: { status: 'finalised' }, error: null });
    const result = await updatePayrollRunStatus('run-1', 'draft');
    expect(result.error).toMatch(/cannot transition/i);
  });

  it('allows valid transition: draft → finalised', async () => {
    setNextResolve({ data: { status: 'draft' }, error: null });
    const result = await updatePayrollRunStatus('run-1', 'finalised');
    expect(result.error).toBeNull();
  });

  it('allows valid transition: finalised → paid', async () => {
    setNextResolve({ data: { status: 'finalised' }, error: null });
    const result = await updatePayrollRunStatus('run-1', 'paid');
    expect(result.error).toBeNull();
  });
});

// ── Zod schema purity tests ──────────────────────────────────────────────────
import { createEmployeeSchema, createLeaveRequestSchema, upsertAttendanceSchema } from '@/lib/validations';

describe('createEmployeeSchema', () => {
  it('rejects missing staffCode', () => {
    const r = createEmployeeSchema.safeParse({ name: 'Alice', role: 'sales', joinDate: '2024-01-01' });
    expect(r.success).toBe(false);
  });

  it('rejects malformed IC', () => {
    const r = createEmployeeSchema.safeParse({
      staffCode: 'E001', name: 'Alice', role: 'sales', joinDate: '2024-01-01',
      ic: '12345-67-8901',
    });
    expect(r.success).toBe(false);
  });

  it('accepts well-formed IC', () => {
    const r = createEmployeeSchema.safeParse({
      staffCode: 'E001', name: 'Alice', role: 'sales', joinDate: '2024-01-01',
      ic: '900101-14-1234',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    const r = createEmployeeSchema.safeParse({ staffCode: 'E001', name: 'A', role: 'sales', joinDate: '2024-01-01' });
    expect(r.success).toBe(false);
  });
});

describe('createLeaveRequestSchema', () => {
  it('rejects endDate before startDate', () => {
    const r = createLeaveRequestSchema.safeParse({
      leaveTypeId: 'lt-1', startDate: '2024-03-15', endDate: '2024-03-10',
    });
    expect(r.success).toBe(false);
    expect(r.error?.errors[0].message).toMatch(/on or after/i);
  });

  it('accepts equal start and end date', () => {
    const r = createLeaveRequestSchema.safeParse({
      leaveTypeId: 'lt-1', startDate: '2024-03-10', endDate: '2024-03-10',
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid date range', () => {
    const r = createLeaveRequestSchema.safeParse({
      leaveTypeId: 'lt-1', startDate: '2024-03-10', endDate: '2024-03-15',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing leaveTypeId', () => {
    const r = createLeaveRequestSchema.safeParse({ startDate: '2024-03-10', endDate: '2024-03-15' });
    expect(r.success).toBe(false);
  });
});

describe('upsertAttendanceSchema', () => {
  it('rejects negative hoursWorked', () => {
    const r = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1', date: '2024-03-10', status: 'present', hoursWorked: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects hoursWorked > 24', () => {
    const r = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1', date: '2024-03-10', status: 'present', hoursWorked: 25,
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid attendance record', () => {
    const r = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1', date: '2024-03-10', status: 'present', hoursWorked: 8,
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid clock time format', () => {
    const r = upsertAttendanceSchema.safeParse({
      employeeId: 'emp-1', date: '2024-03-10', status: 'present', clockIn: '9:00',
    });
    expect(r.success).toBe(false);
  });
});

