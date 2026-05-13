import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listLeaveRequests,
  listPayrollRuns,
  listAppraisals,
  reviewLeaveRequest,
  reviewPayrollRunFinalisation,
  reviewAppraisalActivation,
} from '@flc/hrms-services';
import { approvalKeys, leaveKeys, payrollKeys, appraisalKeys } from '../queryKeys';

// ─── Approval inbox ───────────────────────────────────────────────────────────

/**
 * Fetches all pending approval-eligible records for a company.
 * Aggregates leave, payroll, and appraisal data in a single query.
 */
export function useApprovalInbox(companyId: string) {
  return useQuery({
    queryKey: approvalKeys.inbox(companyId),
    queryFn: async () => {
      const [leaveRequests, payrollRuns, appraisals] = await Promise.all([
        listLeaveRequests(companyId, { includeApprovalHistory: true }),
        listPayrollRuns(companyId, { includeApprovalHistory: true }),
        listAppraisals(companyId, { includeApprovalHistory: true }),
      ]);
      return { leaveRequests, payrollRuns, appraisals };
    },
    enabled: Boolean(companyId),
  });
}

// ─── Approval decision mutations ──────────────────────────────────────────────

export function useReviewLeaveDecision(companyId: string, reviewerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reviewLeaveRequest>[0]) =>
      reviewLeaveRequest(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId) });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId, reviewerId) });
    },
  });
}

export function useReviewPayrollDecision(companyId: string, reviewerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reviewPayrollRunFinalisation>[0]) =>
      reviewPayrollRunFinalisation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId) });
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs(companyId) });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId, reviewerId) });
    },
  });
}

export function useReviewAppraisalDecision(companyId: string, reviewerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reviewAppraisalActivation>[0]) =>
      reviewAppraisalActivation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId) });
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId, reviewerId) });
    },
  });
}
