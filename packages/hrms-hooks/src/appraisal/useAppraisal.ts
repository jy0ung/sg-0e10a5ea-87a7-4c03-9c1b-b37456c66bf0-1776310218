import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAppraisals,
  listAppraisalItems,
  getMyAppraisalItems,
  createAppraisal,
  reviewAppraisalActivation,
  resubmitAppraisalActivation,
  submitAppraisalSelfReview,
  reviewAppraisalItem,
  acknowledgeAppraisalItem,
  createAppraisalItem,
  updateAppraisalItem,
  deleteAppraisalItem,
} from '@flc/hrms-services';
import type { AppraisalItem } from '@flc/types';
import { appraisalKeys, approvalKeys } from '../queryKeys';

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useAppraisals(
  companyId: string,
  opts?: Parameters<typeof listAppraisals>[1],
) {
  return useQuery({
    queryKey: appraisalKeys.all(companyId),
    queryFn: () => listAppraisals(companyId, opts),
    enabled: Boolean(companyId),
  });
}

export function useAppraisalItems(appraisalId: string) {
  return useQuery({
    queryKey: appraisalKeys.items(appraisalId),
    queryFn: () => listAppraisalItems(appraisalId),
    enabled: Boolean(appraisalId),
  });
}

export function useMyAppraisalItems(employeeId: string, companyId?: string) {
  return useQuery({
    queryKey: appraisalKeys.myItems(employeeId),
    queryFn: () => getMyAppraisalItems(employeeId, companyId),
    enabled: Boolean(employeeId),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateAppraisal(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      createdBy,
    }: {
      input: Parameters<typeof createAppraisal>[1];
      createdBy: string;
    }) => createAppraisal(companyId, input, createdBy),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.all(companyId) });
    },
  });
}

export function useReviewAppraisalActivation(companyId: string, reviewerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reviewAppraisalActivation>[0]) =>
      reviewAppraisalActivation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.all(companyId) });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.inbox(companyId, reviewerId) });
    },
  });
}

export function useResubmitAppraisalActivation(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ appraisalId, requesterId }: { appraisalId: string; requesterId: string }) =>
      resubmitAppraisalActivation(appraisalId, requesterId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.all(companyId) });
    },
  });
}

export function useSubmitAppraisalSelfReview(appraisalId: string, companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      employeeId,
      input,
    }: {
      itemId: string;
      employeeId: string;
      input: Pick<AppraisalItem, 'goals' | 'achievements' | 'areasToImprove' | 'employeeComments'>;
    }) => submitAppraisalSelfReview(itemId, employeeId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.items(appraisalId) });
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.all(companyId) });
    },
  });
}

export function useReviewAppraisalItem(appraisalId: string, companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      reviewerId,
      input,
    }: {
      itemId: string;
      reviewerId: string;
      input: Pick<AppraisalItem, 'rating' | 'reviewerComments'>;
    }) => reviewAppraisalItem(itemId, reviewerId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.items(appraisalId) });
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.all(companyId) });
    },
  });
}

export function useAcknowledgeAppraisalItem(appraisalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      employeeId,
      comments,
    }: {
      itemId: string;
      employeeId: string;
      comments?: string;
    }) => acknowledgeAppraisalItem(itemId, employeeId, comments),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.items(appraisalId) });
    },
  });
}

export function useCreateAppraisalItem(appraisalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: Parameters<typeof createAppraisalItem>[2];
    }) => createAppraisalItem(appraisalId, companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.items(appraisalId) });
    },
  });
}

export function useUpdateAppraisalItem(appraisalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateAppraisalItem>[1] }) =>
      updateAppraisalItem(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.items(appraisalId) });
    },
  });
}

export function useDeleteAppraisalItem(appraisalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAppraisalItem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appraisalKeys.items(appraisalId) });
    },
  });
}
