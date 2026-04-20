import { describe, it, expect } from 'vitest';
import {
  departmentSchema,
  jobTitleSchema,
  leaveTypeAdminSchema,
  holidaySchema,
  approvalStepSchema,
  approvalFlowWithStepsSchema,
} from '@/lib/validations';

// ─── Department schema ────────────────────────────────────────────────────────
describe('departmentSchema', () => {
  it('accepts a minimal valid department', () => {
    const result = departmentSchema.safeParse({ name: 'Engineering' });
    expect(result.success).toBe(true);
  });

  it('rejects a name shorter than 2 characters', () => {
    const result = departmentSchema.safeParse({ name: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects a name longer than 80 characters', () => {
    const result = departmentSchema.safeParse({ name: 'A'.repeat(81) });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = departmentSchema.safeParse({
      name: 'HR',
      description: 'Human Resources',
      costCentre: 'CC001',
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects description longer than 300 characters', () => {
    const result = departmentSchema.safeParse({
      name: 'HR',
      description: 'D'.repeat(301),
    });
    expect(result.success).toBe(false);
  });
});

// ─── Job title schema ─────────────────────────────────────────────────────────
describe('jobTitleSchema', () => {
  it('accepts a valid job title', () => {
    const result = jobTitleSchema.safeParse({ name: 'Software Engineer' });
    expect(result.success).toBe(true);
  });

  it('accepts a job title with all optional fields', () => {
    const result = jobTitleSchema.safeParse({
      name: 'Senior Developer',
      departmentId: crypto.randomUUID(),
      level: 'senior',
      description: 'Senior software developer',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid level enum', () => {
    const result = jobTitleSchema.safeParse({ name: 'Dev', level: 'legendary' });
    expect(result.success).toBe(false);
  });
});

// ─── Leave type admin schema ──────────────────────────────────────────────────
describe('leaveTypeAdminSchema', () => {
  it('accepts a valid leave type', () => {
    const result = leaveTypeAdminSchema.safeParse({
      name: 'Annual Leave',
      code: 'AL',
      daysPerYear: 14,
      isPaid: true,
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a code with lowercase letters', () => {
    const result = leaveTypeAdminSchema.safeParse({
      name: 'Annual Leave',
      code: 'al',
      daysPerYear: 14,
      isPaid: true,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a code with spaces', () => {
    const result = leaveTypeAdminSchema.safeParse({
      name: 'Annual Leave',
      code: 'ANNUAL LEAVE',
      daysPerYear: 14,
      isPaid: true,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative daysPerYear', () => {
    const result = leaveTypeAdminSchema.safeParse({
      name: 'Annual Leave',
      code: 'AL',
      daysPerYear: -1,
      isPaid: true,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects daysPerYear above 365', () => {
    const result = leaveTypeAdminSchema.safeParse({
      name: 'Annual Leave',
      code: 'AL',
      daysPerYear: 366,
      isPaid: true,
      active: true,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Holiday schema ───────────────────────────────────────────────────────────
describe('holidaySchema', () => {
  it('accepts a valid holiday', () => {
    const result = holidaySchema.safeParse({
      name: 'Hari Merdeka',
      date: '2025-08-31',
      holidayType: 'public',
      isRecurring: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty date', () => {
    const result = holidaySchema.safeParse({
      name: 'Hari Merdeka',
      date: '',
      holidayType: 'public',
      isRecurring: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid holidayType', () => {
    const result = holidaySchema.safeParse({
      name: 'Some Holiday',
      date: '2025-01-01',
      holidayType: 'bank',
      isRecurring: false,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Approval step schema ─────────────────────────────────────────────────────
describe('approvalStepSchema', () => {
  it('accepts a valid role-type step', () => {
    const result = approvalStepSchema.safeParse({
      stepOrder: 1, name: 'Manager Approval',
      approverType: 'role', approverRole: 'manager',
      allowSelfApproval: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a role-type step with no approverRole', () => {
    const result = approvalStepSchema.safeParse({
      stepOrder: 1, name: 'Manager Approval',
      approverType: 'role', approverRole: '',
      allowSelfApproval: false,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a specific_user step with approverUserId', () => {
    const result = approvalStepSchema.safeParse({
      stepOrder: 1, name: 'CEO Approval',
      approverType: 'specific_user', approverUserId: crypto.randomUUID(),
      allowSelfApproval: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a specific_user step with no approverUserId', () => {
    const result = approvalStepSchema.safeParse({
      stepOrder: 1, name: 'CEO Approval',
      approverType: 'specific_user', approverUserId: '',
      allowSelfApproval: false,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a direct_manager step with no extra fields', () => {
    const result = approvalStepSchema.safeParse({
      stepOrder: 1, name: 'Direct Manager',
      approverType: 'direct_manager',
      allowSelfApproval: true,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Full approval flow schema ────────────────────────────────────────────────
describe('approvalFlowWithStepsSchema', () => {
  const validStep = {
    stepOrder: 1, name: 'Manager Review',
    approverType: 'role', approverRole: 'manager',
    allowSelfApproval: false,
  };

  it('accepts a complete valid flow', () => {
    const result = approvalFlowWithStepsSchema.safeParse({
      name: 'Standard Leave Flow',
      description: 'For all leave requests',
      entityType: 'leave_request',
      isActive: true,
      steps: [validStep],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a flow with no steps', () => {
    const result = approvalFlowWithStepsSchema.safeParse({
      name: 'Empty Flow',
      entityType: 'general',
      isActive: true,
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a flow with a name shorter than 2 characters', () => {
    const result = approvalFlowWithStepsSchema.safeParse({
      name: 'A',
      entityType: 'general',
      isActive: true,
      steps: [validStep],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid entityType', () => {
    const result = approvalFlowWithStepsSchema.safeParse({
      name: 'Some Flow',
      entityType: 'expense_claim',
      isActive: true,
      steps: [validStep],
    });
    expect(result.success).toBe(false);
  });
});
