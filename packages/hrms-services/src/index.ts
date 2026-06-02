/**
 * @flc/hrms-services
 *
 * Shared HRMS data-access layer.
 * Consumed by both the web app and the HRMS mobile app.
 *
 * No React hooks, no audit logging dependency — thin, testable wrappers.
 */
import { supabase } from './shared/supabaseClient';
import { resolveRequiredProfileId } from './shared/identity';
import type { Notification } from '@flc/types';

// ─── Domain barrel exports ─────────────────────────────────────────────────────
export * from './announcement/announcementService';
export * from './attendance/attendanceService';
export * from './employee/employeeService';
export * from './leave/leaveService';
export * from './payroll/payrollService';
export * from './appraisal/appraisalService';
export * from './settings/settingsService';
export * from './settings/rolloverService';

// Backward-compat alias used by apps/hrms-mobile
export { listLeaveTypes as getLeaveTypes } from './leave/leaveService';

// ─── Approval engine ──────────────────────────────────────────────────────────
export { bootstrapApprovalInstanceForEntity } from './approval/approvalEngine';
export { submitApprovalDecision, resubmitApprovalInstance } from './approval/approvalEngine';
export type {
  ApprovalStepRecord,
  ApprovalInstanceRecord,
  SubmitApprovalDecisionInput,
  EntityStatusUpdater,
  ApprovalAuditAdapter,
  ApprovalAuditEvent,
} from './approval/approvalTypes';
export { rowToApprovalStep, rowToApprovalInstance, rowToApprovalDecision } from './approval/approvalTypes';
export { resolveStepRouting, userHasAssignedHrmsRole } from './approval/approvalRouting';

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function updateContactNo(profileId: string, contactNo: string): Promise<void> {
  const resolvedProfileId = await resolveRequiredProfileId(profileId);
  const { error } = await supabase
    .from('profiles')
    .update({ contact_no: contactNo })
    .eq('id', resolvedProfileId);
  if (error) throw new Error(error.message);
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function listNotifications(userId: string, opts?: { limit?: number }): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => ({
    id:        String(row.id),
    title:     String(row.title),
    message:   String(row.message),
    type:      row.type as Notification['type'],
    read:      Boolean(row.read),
    createdAt: row.created_at ? String(row.created_at) : '',
    userId:    String(row.user_id),
  }));
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw new Error(error.message);
}
