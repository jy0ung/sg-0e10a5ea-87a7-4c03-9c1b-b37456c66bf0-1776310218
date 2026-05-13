import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPayrollRuns,
  listPayrollItems,
  getMyPayslips,
  createPayrollRun,
  updatePayrollRunStatus,
  reviewPayrollRunFinalisation,
  resubmitPayrollRunFinalisation,
} from '@flc/hrms-services';
import { payrollKeys, approvalKeys } from '../queryKeys';

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function usePayrollRuns(
  companyId: string,
  opts?: Parameters<typeof listPayrollRuns>[1],
) {
  return useQuery({
    queryKey: payrollKeys.runs(companyId),
    queryFn: () => listPayrollRuns(companyId, opts),
    enabled: Boolean(companyId),
  });
}

export function usePayrollItems(runId: string) {
  return useQuery({
    queryKey: payrollKeys.items(runId),
    queryFn: () => listPayrollItems(runId),
    enabled: Boolean(runId),
  });
}

export function useMyPayslips(employeeId: string) {
  return useQuery({
    queryKey: payrollKeys.myPayslips(employeeId),
    queryFn: () => getMyPayslips(employeeId),
    enabled: Boolean(employeeId),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreatePayrollRun(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createPayrollRun>[0]) =>
      createPayrollRun(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs(companyId) });
    },
  });
}

export function useUpdatePayrollRunStatus(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updatePayrollRunStatus>[0]) =>
      updatePayrollRunStatus(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs(companyId) });
    },
  });
}

export function useReviewPayrollRun(companyId: string, reviewerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reviewPayrollRunFinalisation>[0]) =>
      reviewPayrollRunFinalisation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs(companyId) });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId, reviewerId) });
    },
  });
}

export function useResubmitPayrollRun(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof resubmitPayrollRunFinalisation>[0]) =>
      resubmitPayrollRunFinalisation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs(companyId) });
    },
  });
}
