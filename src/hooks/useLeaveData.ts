import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  listLeaveRequests,
  listLeaveTypes,
  listLeaveBalances,
} from '@/services/hrmsService';
import {
  getPendingApprovalsForUser,
} from '@/services/approvalEngineService';
import { HRMS_LEAVE_APPROVER_ROLES, HRMS_MANAGER_ROLES, HRMS_ADMIN_ROLES, HRMS_APPROVAL_INBOX_ROLES } from '@/config/hrmsConfig';
import type { LeaveRequest, LeaveType, LeaveBalance, PendingApproval, AppRole } from '@/types';

export interface LeaveDataResult {
  requests: LeaveRequest[];
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  pendingApprovals: PendingApproval[];

  // Derived
  myRequests: LeaveRequest[];
  myPendingRequests: LeaveRequest[];
  myUpcomingLeave: LeaveRequest | null;
  teamOnLeaveToday: LeaveRequest[];
  myQueueCount: number;

  // Role flags
  isManager: boolean;
  isApprover: boolean;
  isAdmin: boolean;
  canAccessApprovalInbox: boolean;

  // Loading
  isLoading: boolean;
}

export function useLeaveData(): LeaveDataResult {
  const { user } = useAuth();
  const role = user?.role as AppRole | undefined;
  const isManager = !!role && HRMS_MANAGER_ROLES.includes(role);
  const isApprover = !!role && HRMS_LEAVE_APPROVER_ROLES.includes(role);
  const isAdmin = !!role && HRMS_ADMIN_ROLES.includes(role);
  const canAccessApprovalInbox = !!role && HRMS_APPROVAL_INBOX_ROLES.includes(role);
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;
  const currentYear = new Date().getFullYear();

  const { data, isPending } = useQuery({
    queryKey: ['leave-control-center', user?.companyId, user?.id, isManager, selfServiceEmployeeId],
    queryFn: async () => {
      const [reqRes, typeRes, balRes, approvalsRes] = await Promise.all([
        listLeaveRequests(user!.companyId, isManager
          ? { includeApprovalHistory: true }
          : { employeeId: selfServiceEmployeeId, includeApprovalHistory: true }),
        listLeaveTypes(user!.companyId),
        selfServiceEmployeeId
          ? listLeaveBalances(selfServiceEmployeeId, currentYear)
          : Promise.resolve({ data: [] as LeaveBalance[], error: null }),
        canAccessApprovalInbox
          ? getPendingApprovalsForUser(user!.companyId, user!.id)
          : Promise.resolve({ data: [] as PendingApproval[], error: null }),
      ]);
      return {
        requests: reqRes.data ?? [],
        leaveTypes: typeRes.data ?? [],
        leaveBalances: balRes.data ?? [],
        pendingApprovals: approvalsRes.data ?? [],
      };
    },
    enabled: !!user?.companyId && (isManager || !!selfServiceEmployeeId),
  });

  const requests = data?.requests ?? [];
  const leaveTypes = data?.leaveTypes ?? [];
  const leaveBalances = data?.leaveBalances ?? [];
  const pendingApprovals = data?.pendingApprovals ?? [];

  // Derived: own requests
  const myRequests = isManager
    ? requests.filter(r => r.employeeId === selfServiceEmployeeId)
    : requests;
  const myPendingRequests = myRequests.filter(r => r.status === 'pending');

  // Derived: next upcoming approved leave
  const today = new Date().toISOString().slice(0, 10);
  const myUpcomingLeave = myRequests
    .filter(r => r.status === 'approved' && r.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;

  // Derived: team on leave today
  const teamOnLeaveToday = requests.filter(r =>
    r.status === 'approved' && r.startDate <= today && r.endDate >= today
  );

  // Derived: my approval queue count
  const myQueueCount = pendingApprovals.length;

  return {
    requests,
    leaveTypes,
    leaveBalances,
    pendingApprovals,
    myRequests,
    myPendingRequests,
    myUpcomingLeave,
    teamOnLeaveToday,
    myQueueCount,
    isManager,
    isApprover,
    isAdmin,
    canAccessApprovalInbox,
    isLoading: isPending,
  };
}
