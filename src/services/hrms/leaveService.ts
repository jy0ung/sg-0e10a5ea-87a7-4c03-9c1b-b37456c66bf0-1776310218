import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import * as pkg from '@flc/hrms-services';
import {
  LeaveType, LeaveBalance, LeaveRequest, CreateLeaveRequestInput,
  AppRole,
} from '@/types';
import { HRMS_LEAVE_APPROVER_ROLES } from '@/config/hrmsConfig';
import { resolveRequiredProfileId } from './shared';

const LEAVE_ATTACHMENT_BUCKET = 'leave-attachments';
const LEAVE_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
const LEAVE_ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export type LeaveApprovalPreview = { nextStepLabel: string; fullFlow: string[] };
export type LeaveEmployeeInfo = { branch: string; department: string; position: string };
export type LeaveHoliday = { date: string; isRecurring: boolean };

export function validateLeaveAttachment(file: File): string | null {
  if (!LEAVE_ATTACHMENT_MIME_TYPES.includes(file.type)) {
    return 'Upload a PDF, JPG, JPEG, or PNG document.';
  }
  if (file.size > LEAVE_ATTACHMENT_MAX_BYTES) {
    return 'File size must be 3MB or below.';
  }
  return null;
}

function safeAttachmentName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function uploadLeaveAttachment(
  file: File,
  companyId: string,
  employeeId: string,
): Promise<{ fileName: string; filePath: string; fileSize: number; mimeType: string }> {
  const validationError = validateLeaveAttachment(file);
  if (validationError) throw new Error(validationError);
  const filePath = `${companyId}/${employeeId}/${crypto.randomUUID()}-${safeAttachmentName(file.name)}`;
  const { error } = await supabase.storage
    .from(LEAVE_ATTACHMENT_BUCKET)
    .upload(filePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message);
  return { fileName: file.name, filePath, fileSize: file.size, mimeType: file.type || 'application/octet-stream' };
}

async function removeLeaveAttachment(filePath: string): Promise<void> {
  await supabase.storage.from(LEAVE_ATTACHMENT_BUCKET).remove([filePath]);
}

export async function listLeaveTypes(companyId: string): Promise<{ data: LeaveType[]; error: string | null }> {
  try {
    const data = await pkg.listLeaveTypes(companyId);
    return { data: data as LeaveType[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listLeaveBalances(employeeId: string, year: number): Promise<{ data: LeaveBalance[]; error: string | null }> {
  try {
    const data = await pkg.listLeaveBalances(employeeId, year);
    return { data: data as LeaveBalance[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listLeaveHolidays(companyId: string): Promise<{ data: LeaveHoliday[]; error: string | null }> {
  try {
    const data = await pkg.listLeaveHolidays(companyId);
    return { data, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getLeaveEmployeeInfo(companyId: string, employeeId: string): Promise<{ data: LeaveEmployeeInfo | null; error: string | null }> {
  try {
    const data = await pkg.getLeaveEmployeeInfo(companyId, employeeId);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getLeaveApprovalPreview(companyId: string, employeeId: string): Promise<{ data: LeaveApprovalPreview | null; error: string | null }> {
  try {
    const data = await pkg.getLeaveApprovalPreview(companyId, employeeId);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listLeaveRequests(
  companyId: string,
  opts?: { employeeId?: string; status?: LeaveRequest['status']; includeApprovalHistory?: boolean; dateFrom?: string; dateTo?: string },
): Promise<{ data: LeaveRequest[]; error: string | null }> {
  try {
    const data = await pkg.listLeaveRequests(companyId, opts);
    return { data: data as LeaveRequest[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createLeaveRequest(
  employeeId: string,
  companyId: string,
  input: CreateLeaveRequestInput,
): Promise<{ error: string | null }> {
  let uploadedAttachment: Awaited<ReturnType<typeof uploadLeaveAttachment>> | null = null;
  try {
    const requesterProfileId = await resolveRequiredProfileId(employeeId);
    if (requesterProfileId.error) return { error: requesterProfileId.error };

    if (input.attachmentFile) {
      uploadedAttachment = await uploadLeaveAttachment(input.attachmentFile, companyId, employeeId);
    }

    const leaveRequestId = await pkg.createLeaveRequest(employeeId, companyId, {
      leaveTypeId:        input.leaveTypeId,
      startDate:          input.startDate,
      endDate:            input.endDate,
      dayPart:            input.dayPart ?? 'full_day',
      reason:             input.reason,
      attachmentFileName: uploadedAttachment?.fileName ?? input.attachmentFileName,
      attachmentFilePath: uploadedAttachment?.filePath ?? input.attachmentFilePath,
      attachmentFileSize: uploadedAttachment?.fileSize ?? input.attachmentFileSize,
      attachmentMimeType: uploadedAttachment?.mimeType ?? input.attachmentMimeType,
    });
    void logUserAction(requesterProfileId.data, 'create', 'leave_request', leaveRequestId, {
      leaveTypeId: input.leaveTypeId,
      startDate:   input.startDate,
      endDate:     input.endDate,
      days:        input.days,
      dayPart:     input.dayPart ?? 'full_day',
    });
    return { error: null };
  } catch (error) {
    if (uploadedAttachment?.filePath) void removeLeaveAttachment(uploadedAttachment.filePath);
    return { error: error instanceof Error ? error.message : 'Failed to create leave request.' };
  }
}

export async function reviewLeaveRequest(
  requestId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  try {
    const { data: req, error: requestError } = await supabase
      .from('leave_requests')
      .select('employee_id, company_id')
      .eq('id', requestId)
      .single();
    if (requestError) return { error: requestError.message };

    const requestOwnerId = String((req as Record<string, unknown> | null)?.employee_id ?? '');
    if (!requestOwnerId) return { error: 'Leave request not found.' };

    const { data: reviewer, error: reviewerError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', reviewerId)
      .single();
    if (reviewerError) return { error: reviewerError.message };
    const reviewerRole = String((reviewer as Record<string, unknown> | null)?.role ?? '');

    // Check for approval instance
    const { data: approvalInstance, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id')
      .eq('entity_type', 'leave_request')
      .eq('entity_id', requestId)
      .maybeSingle();
    if (approvalError) return { error: approvalError.message };

    if (!approvalInstance) {
      // Legacy path: no approval workflow — check role directly
      const requesterProfileId = await resolveRequiredProfileId(requestOwnerId);
      if (requesterProfileId.error) return { error: requesterProfileId.error };
      if (requesterProfileId.data === reviewerId) {
        return { error: 'You cannot approve or reject your own leave request.' };
      }
      if (!HRMS_LEAVE_APPROVER_ROLES.includes(reviewerRole as AppRole)) {
        return { error: 'You are not allowed to review this leave request.' };
      }
      const { error } = await supabase
        .from('leave_requests')
        .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reviewer_note: note ?? null })
        .eq('id', requestId);
      if (!error) {
        void logUserAction(reviewerId, 'update', 'leave_request', requestId,
          { status, reviewerNote: note ?? null, approvalMode: 'legacy' });
      }
      return { error: error?.message ?? null };
    }

    // Approval workflow path
    await pkg.reviewLeaveRequest({ requestId, reviewerId, reviewerRole, decision: status, note });
    void logUserAction(reviewerId, 'update', 'leave_request', requestId,
      { status, reviewerNote: note ?? null, approvalMode: 'workflow' });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
