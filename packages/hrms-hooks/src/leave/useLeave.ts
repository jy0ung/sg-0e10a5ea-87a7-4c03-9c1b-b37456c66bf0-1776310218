import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listLeaveTypes,
  listLeaveBalances,
  listLeaveHolidays,
  listLeaveRequests,
  getMyLeaveRequests,
  getLeaveEmployeeInfo,
  getLeaveApprovalPreview,
  createLeaveRequest,
  cancelLeaveRequest,
  reviewLeaveRequest,
} from '@flc/hrms-services';
import type {
  LeaveAttachmentPayload,
  LeaveApprovalPreview,
} from '@flc/hrms-services';
import type { CreateLeaveRequestFormData } from '@flc/hrms-schemas';
import { leaveKeys, approvalKeys } from '../queryKeys';

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useLeaveTypes(companyId: string) {
  return useQuery({
    queryKey: leaveKeys.types(companyId),
    queryFn: () => listLeaveTypes(companyId),
    enabled: Boolean(companyId),
  });
}

export function useLeaveHolidays(companyId: string) {
  return useQuery({
    queryKey: leaveKeys.holidays(companyId),
    queryFn: () => listLeaveHolidays(companyId),
    enabled: Boolean(companyId),
  });
}

export function useLeaveBalances(employeeId: string, year: number) {
  return useQuery({
    queryKey: leaveKeys.balances(employeeId, year),
    queryFn: () => listLeaveBalances(employeeId, year),
    enabled: Boolean(employeeId),
  });
}

export function useLeaveRequests(
  companyId: string,
  opts?: Parameters<typeof listLeaveRequests>[1],
) {
  return useQuery({
    queryKey: leaveKeys.requests(companyId, opts),
    queryFn: () => listLeaveRequests(companyId, opts),
    enabled: Boolean(companyId),
  });
}

export function useMyLeaveRequests(
  employeeId: string,
  companyId: string,
  dateRange?: { from: string; to: string },
) {
  return useQuery({
    queryKey: leaveKeys.myRequests(employeeId, companyId),
    queryFn: () => getMyLeaveRequests(employeeId, companyId, dateRange),
    enabled: Boolean(employeeId) && Boolean(companyId),
  });
}

export function useLeaveEmployeeInfo(companyId: string, employeeId: string) {
  return useQuery({
    queryKey: leaveKeys.employeeInfo(companyId, employeeId),
    queryFn: () => getLeaveEmployeeInfo(companyId, employeeId),
    enabled: Boolean(companyId) && Boolean(employeeId),
  });
}

export function useLeaveApprovalPreview(companyId: string, employeeId: string) {
  return useQuery({
    queryKey: leaveKeys.approvalPreview(companyId, employeeId),
    queryFn: () => getLeaveApprovalPreview(companyId, employeeId),
    enabled: Boolean(companyId) && Boolean(employeeId),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateLeaveRequest(companyId: string, employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLeaveRequestFormData & LeaveAttachmentPayload) =>
      createLeaveRequest(employeeId, companyId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myRequests(employeeId, companyId) });
    },
  });
}

export function useCancelLeaveRequest(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelLeaveRequest(requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.all(companyId) });
    },
  });
}

export function useReviewLeave(companyId: string, reviewerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reviewLeaveRequest>[0]) =>
      reviewLeaveRequest(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId, reviewerId) });
    },
  });
}

export type { LeaveAttachmentPayload, LeaveApprovalPreview };
