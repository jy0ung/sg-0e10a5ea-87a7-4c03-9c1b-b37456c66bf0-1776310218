import type { FlowEntityType } from '@flc/types';

// ─── Step / Instance / Decision shapes ────────────────────────────────────────

export type ApprovalStepRecord = {
  id: string;
  stepOrder: number;
  name: string;
  approverType: 'role' | 'specific_user' | 'direct_manager';
  approverRole?: string;
  approverUserId?: string;
  fallbackApproverUserId?: string;
  escalationRule?: string;
  conditionRule?: string;
  isActive: boolean;
  allowSelfApproval: boolean;
};

export type ApprovalInstanceRecord = {
  id: string;
  flowId: string;
  requesterId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  currentStepId?: string;
  currentStepOrder?: number;
  currentStepName?: string;
  currentApproverRole?: string;
  currentApproverUserId?: string;
};

// ─── Engine input ─────────────────────────────────────────────────────────────

export type SubmitApprovalDecisionInput = {
  /** The entity domain (leave_request, payroll_run, appraisal, …). */
  entityType: FlowEntityType;
  /** Primary key of the entity being approved. */
  entityId: string;
  /** Profile UUID of the person submitting the decision. */
  reviewerId: string;
  /** Main-app role of the reviewer (used for legacy role matching). */
  reviewerRole: string;
  /** Company context — used for HRMS role resolution. */
  companyId: string;
  /**
   * Profile UUID of the person who originally submitted the entity.
   * Used for self-approval guard. Pass `instance.requesterId` when available.
   */
  requesterId: string;
  decision: 'approved' | 'rejected';
  note?: string;
};

/**
 * Called by the engine when the decision is final (last step approved, or any
 * rejection). Responsible for updating the entity table (e.g. leave_requests,
 * payroll_runs) to reflect the approval outcome.
 *
 * Should throw on failure. The engine will propagate the error.
 */
export type EntityStatusUpdater = (
  entityId: string,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  note: string | undefined,
  decidedAt: string,
) => Promise<void>;

// ─── Audit adapter ────────────────────────────────────────────────────────────

export type ApprovalAuditEvent = {
  entityType: FlowEntityType;
  entityId: string;
  reviewerId: string;
  decision: 'approved' | 'rejected';
  stepName: string;
  stepOrder: number;
  note?: string;
  decidedAt: string;
  isFinalDecision: boolean;
  nextStepName?: string;
};

/**
 * Optional audit adapter injected into the engine. Implement this in each
 * consuming app to fire your existing audit log (e.g. logUserAction) without
 * coupling the engine to any specific audit implementation.
 *
 * Failures are silently swallowed so they cannot block the approval transaction.
 */
export type ApprovalAuditAdapter = {
  logApprovalAction(event: ApprovalAuditEvent): Promise<void>;
};

// ─── Row mappers ──────────────────────────────────────────────────────────────

export function rowToApprovalStep(row: Record<string, unknown>): ApprovalStepRecord {
  return {
    id: String(row.id ?? ''),
    stepOrder: Number(row.step_order ?? 0),
    name: String(row.name ?? ''),
    approverType: (row.approver_type as ApprovalStepRecord['approverType']) ?? 'role',
    approverRole: row.approver_role ? String(row.approver_role) : undefined,
    approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
    fallbackApproverUserId: row.fallback_approver_user_id ? String(row.fallback_approver_user_id) : undefined,
    escalationRule: row.escalation_rule ? String(row.escalation_rule) : undefined,
    conditionRule: row.condition_rule ? String(row.condition_rule) : undefined,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    allowSelfApproval: Boolean(row.allow_self_approval),
  };
}

export function rowToApprovalInstance(row: Record<string, unknown>): ApprovalInstanceRecord {
  return {
    id: String(row.id ?? ''),
    flowId: String(row.flow_id ?? ''),
    requesterId: String(row.requester_id ?? ''),
    status: (row.status as ApprovalInstanceRecord['status']) ?? 'pending',
    currentStepId: row.current_step_id ? String(row.current_step_id) : undefined,
    currentStepOrder: row.current_step_order != null ? Number(row.current_step_order) : undefined,
    currentStepName: row.current_step_name ? String(row.current_step_name) : undefined,
    currentApproverRole: row.current_approver_role ? String(row.current_approver_role) : undefined,
    currentApproverUserId: row.current_approver_user_id ? String(row.current_approver_user_id) : undefined,
  };
}

export function rowToApprovalDecision(row: Record<string, unknown>): import('@flc/types').ApprovalDecision {
  return {
    id: String(row.id ?? ''),
    instanceId: String(row.instance_id ?? ''),
    stepId: String(row.step_id ?? ''),
    stepOrder: Number(row.step_order ?? 0),
    approverId: String(row.approver_id ?? ''),
    approverName: row.approver ? String((row.approver as Record<string, unknown>)?.name ?? '') : undefined,
    stepName: row.step ? String((row.step as Record<string, unknown>)?.name ?? '') : undefined,
    decision: (row.decision as import('@flc/types').ApprovalDecision['decision']) ?? 'approved',
    note: row.note ? String(row.note) : undefined,
    decidedAt: String(row.decided_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}
