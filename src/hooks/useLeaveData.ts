import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useToast } from '@/hooks/use-toast';
import { matchesHrmsApproverRole } from '@/lib/hrms/access';
import {
  listLeaveRequests,
  listLeaveTypes,
  listLeaveBalances,
  listLeaveHolidays,
  getLeaveApprovalPreview,
  getLeaveEmployeeInfo,
  type LeaveApprovalPreview,
  type LeaveEmployeeInfo,
  type LeaveHoliday,
} from '@/services/hrmsService';
import type { LeaveRequest, LeaveType, LeaveBalance } from '@/types';

export const LEAVE_QUERY_KEY = 'leave-management' as const;

export type UseLeaveDataResult = {
  requests: LeaveRequest[];
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  holidays: LeaveHoliday[];
  employeeInfo: LeaveEmployeeInfo | null;
  approvalPreview: LeaveApprovalPreview | null;
  // derived
  myRequests: LeaveRequest[];
  myActivePending: LeaveRequest[];
  myUpcoming: LeaveRequest[];
  myHistory: LeaveRequest[];
  teamOnLeaveToday: LeaveRequest[];
  pendingForMeCount: number;
  isLoading: boolean;
  invalidate: () => void;
};

export function useLeaveData(): UseLeaveDataResult {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canApproveRequests = hrmsAccess.canApproveRequests;
  const canViewTeam = canApproveRequests || hrmsAccess.canAccessEmployees;
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;
  const selectedLeaveYear = useMemo(() => new Date().getFullYear(), []);

  const { data: leaveData, isPending: isLoading } = useQuery({
    queryKey: [LEAVE_QUERY_KEY, user?.companyId, user?.id, canApproveRequests, selfServiceEmployeeId],
    queryFn: async () => {
      const [reqRes, typeRes, balanceRes, holidayRes, employeeInfoRes, approvalPreviewRes] = await Promise.all([
        listLeaveRequests(user!.companyId, canApproveRequests || canViewTeam
          ? { includeApprovalHistory: true }
          : { employeeId: selfServiceEmployeeId, includeApprovalHistory: true }),
        listLeaveTypes(user!.companyId),
        selfServiceEmployeeId
          ? listLeaveBalances(selfServiceEmployeeId, selectedLeaveYear)
          : Promise.resolve({ data: [], error: null }),
        listLeaveHolidays(user!.companyId),
        selfServiceEmployeeId
          ? getLeaveEmployeeInfo(user!.companyId, selfServiceEmployeeId)
          : Promise.resolve({ data: null, error: null }),
        selfServiceEmployeeId
          ? getLeaveApprovalPreview(user!.companyId, selfServiceEmployeeId)
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (reqRes.error) toast({ title: 'Error loading leave requests', description: reqRes.error, variant: 'destructive' });
      if (typeRes.error) toast({ title: 'Error loading leave types', description: typeRes.error, variant: 'destructive' });
      if (balanceRes.error) toast({ title: 'Error loading leave balances', description: balanceRes.error, variant: 'destructive' });
      if (holidayRes.error) toast({ title: 'Error loading holidays', description: holidayRes.error, variant: 'destructive' });
      return {
        requests: reqRes.data,
        leaveTypes: typeRes.data,
        leaveBalances: balanceRes.data,
        holidays: holidayRes.data,
        employeeInfo: employeeInfoRes.data,
        approvalPreview: approvalPreviewRes.data,
      };
    },
    enabled: !!user?.companyId && (!!canViewTeam || !!canApproveRequests || !!selfServiceEmployeeId),
  });

  const requests = useMemo(() => leaveData?.requests ?? [], [leaveData]);
  const leaveTypes = leaveData?.leaveTypes ?? [];
  const leaveBalances = leaveData?.leaveBalances ?? [];
  const holidays = leaveData?.holidays ?? [];
  const employeeInfo = leaveData?.employeeInfo ?? null;
  const approvalPreview = leaveData?.approvalPreview ?? null;

  const today = new Date().toISOString().slice(0, 10);

  const myRequests = useMemo(
    () => requests.filter(r => r.employeeId === selfServiceEmployeeId),
    [requests, selfServiceEmployeeId],
  );
  const myActivePending = useMemo(() => myRequests.filter(r => r.status === 'pending'), [myRequests]);
  const myUpcoming = useMemo(
    () => myRequests.filter(r => r.status === 'approved' && r.startDate > today),
    [myRequests, today],
  );
  const myHistory = useMemo(
    () => myRequests.filter(r => r.status !== 'pending' && !(r.status === 'approved' && r.startDate > today)),
    [myRequests, today],
  );
  const teamOnLeaveToday = useMemo(
    () => requests.filter(r =>
      r.status === 'approved' &&
      r.startDate <= today &&
      r.endDate >= today &&
      r.employeeId !== selfServiceEmployeeId,
    ),
    [requests, today, selfServiceEmployeeId],
  );

  const pendingForMeCount = useMemo(
    () => requests.filter(r => {
      if (r.status !== 'pending') return false;
      if (r.currentApproverUserId) return r.currentApproverUserId === user?.id;
      if (r.currentApproverRole) return matchesHrmsApproverRole(r.currentApproverRole, {
        id: user?.id,
        hrmsRoleIds: hrmsAccess.roleIds,
        hrmsRoleCodes: hrmsAccess.roleCodes,
      });
      return false;
    }).length,
    [requests, user?.id, hrmsAccess.roleIds, hrmsAccess.roleCodes],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: [LEAVE_QUERY_KEY, user?.companyId] });
  }

  return {
    requests,
    leaveTypes,
    leaveBalances,
    holidays,
    employeeInfo,
    approvalPreview,
    myRequests,
    myActivePending,
    myUpcoming,
    myHistory,
    teamOnLeaveToday,
    pendingForMeCount,
    isLoading,
    invalidate,
  };
}
