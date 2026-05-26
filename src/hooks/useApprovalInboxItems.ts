import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseChannel } from '@flc/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { listAppraisals, listLeaveRequests, listPayrollRuns } from '@/services/hrmsService';
import {
  buildApprovalInboxItems,
  HRMS_APPROVAL_INBOX_CHANGED_EVENT,
} from '@/lib/hrms/approvalInbox';
import type { Appraisal, LeaveRequest, PayrollRun } from '@/types';

type ApprovalInboxQueryData = {
  leaveRequests: LeaveRequest[];
  payrollRuns: PayrollRun[];
  appraisals: Appraisal[];
  errors: string[];
};

type UseApprovalInboxItemsOptions = {
  enabled?: boolean;
};

export function approvalInboxQueryKey(companyId?: string | null) {
  return ['approval-inbox', companyId] as const;
}

async function fetchApprovalInboxData(companyId: string): Promise<ApprovalInboxQueryData> {
  const [leaveResult, payrollResult, appraisalResult] = await Promise.all([
    listLeaveRequests(companyId, { includeApprovalHistory: true }),
    listPayrollRuns(companyId, { includeApprovalHistory: true }),
    listAppraisals(companyId, { includeApprovalHistory: true }),
  ]);

  const errors = [
    leaveResult.error ? `Leave approvals: ${leaveResult.error}` : null,
    payrollResult.error ? `Payroll approvals: ${payrollResult.error}` : null,
    appraisalResult.error ? `Appraisal approvals: ${appraisalResult.error}` : null,
  ].filter((error): error is string => Boolean(error));

  return {
    leaveRequests: leaveResult.data,
    payrollRuns: payrollResult.data,
    appraisals: appraisalResult.data,
    errors,
  };
}

export function useApprovalInboxItems(options: UseApprovalInboxItemsOptions = {}) {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const queryClient = useQueryClient();
  const companyId = user?.companyId;
  const enabled = Boolean(
    (options.enabled ?? true)
      && companyId
      && user?.id
      && hrmsAccess.canAccessRoute('approvals'),
  );

  const query = useQuery({
    queryKey: approvalInboxQueryKey(companyId),
    queryFn: () => fetchApprovalInboxData(companyId!),
    enabled,
  });

  useEffect(() => {
    if (!enabled || !companyId || typeof window === 'undefined') return undefined;

    const invalidateInbox = () => {
      void queryClient.invalidateQueries({ queryKey: approvalInboxQueryKey(companyId) });
    };

    window.addEventListener(HRMS_APPROVAL_INBOX_CHANGED_EVENT, invalidateInbox);
    return () => window.removeEventListener(HRMS_APPROVAL_INBOX_CHANGED_EVENT, invalidateInbox);
  }, [companyId, enabled, queryClient]);

  // Phase 2 close-out (AUDIT F-2): subscribe to Supabase changes on the three
  // approval sources so managers see new requests live without polling.
  // Invalidates the inbox query on any INSERT/UPDATE/DELETE for the caller's
  // company. The window-event path above stays as a fallback for in-process
  // mutations that bypass the realtime channel (optimistic local updates).
  useSupabaseChannel({
    name: `approval-inbox:${companyId ?? 'anon'}`,
    enabled: enabled && !!companyId,
    subscriptions: [
      { event: '*', table: 'leave_requests', filter: `company_id=eq.${companyId ?? ''}` },
      { event: '*', table: 'payroll_runs',   filter: `company_id=eq.${companyId ?? ''}` },
      { event: '*', table: 'appraisals',     filter: `company_id=eq.${companyId ?? ''}` },
    ],
    onChange: () => {
      if (!companyId) return;
      void queryClient.invalidateQueries({ queryKey: approvalInboxQueryKey(companyId) });
    },
  });

  const items = useMemo(
    () => buildApprovalInboxItems(
      query.data?.leaveRequests ?? [],
      query.data?.payrollRuns ?? [],
      query.data?.appraisals ?? [],
      user ? {
        id: user.id,
        hrmsRoleIds: hrmsAccess.roleIds,
        hrmsRoleCodes: hrmsAccess.roleCodes,
        canApproveRequests: hrmsAccess.canApproveRequests,
      } : null,
    ),
    [hrmsAccess.canApproveRequests, hrmsAccess.roleCodes, hrmsAccess.roleIds, query.data, user],
  );

  return {
    ...query,
    items,
    errors: query.data?.errors ?? [],
  };
}
