import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  // Departments
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  // Job titles
  listJobTitles,
  createJobTitle,
  updateJobTitle,
  deleteJobTitle,
  // Leave types (admin)
  listAllLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  // Public holidays (admin)
  listPublicHolidays,
  createPublicHoliday,
  updatePublicHoliday,
  deletePublicHoliday,
  // HRMS roles
  listHrmsRoles,
  createHrmsRole,
  updateHrmsRole,
  deleteHrmsRole,
  listHrmsRoleAssignments,
  replaceHrmsRoleEmployees,
  // Approval flows
  listApprovalFlows,
  createApprovalFlow,
  updateApprovalFlow,
  deleteApprovalFlow,
  toggleApprovalFlowActive,
} from '@flc/hrms-services';
import { settingsKeys, approvalKeys } from '../queryKeys';

// ─── Departments ──────────────────────────────────────────────────────────────

export function useDepartments(companyId: string) {
  return useQuery({
    queryKey: settingsKeys.departments(companyId),
    queryFn: () => listDepartments(companyId),
    enabled: Boolean(companyId),
  });
}

export function useCreateDepartment(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createDepartment>[1]) =>
      createDepartment(companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.departments(companyId) });
    },
  });
}

export function useUpdateDepartment(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDepartment>[2] }) =>
      updateDepartment(companyId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.departments(companyId) });
    },
  });
}

export function useDeleteDepartment(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDepartment(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.departments(companyId) });
    },
  });
}

// ─── Job titles ───────────────────────────────────────────────────────────────

export function useJobTitles(companyId: string) {
  return useQuery({
    queryKey: settingsKeys.jobTitles(companyId),
    queryFn: () => listJobTitles(companyId),
    enabled: Boolean(companyId),
  });
}

export function useCreateJobTitle(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createJobTitle>[1]) =>
      createJobTitle(companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.jobTitles(companyId) });
    },
  });
}

export function useUpdateJobTitle(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateJobTitle>[2] }) =>
      updateJobTitle(companyId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.jobTitles(companyId) });
    },
  });
}

export function useDeleteJobTitle(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJobTitle(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.jobTitles(companyId) });
    },
  });
}

// ─── Leave types (admin) ──────────────────────────────────────────────────────

export function useAllLeaveTypes(companyId: string) {
  return useQuery({
    queryKey: settingsKeys.leaveTypes(companyId),
    queryFn: () => listAllLeaveTypes(companyId),
    enabled: Boolean(companyId),
  });
}

export function useCreateLeaveType(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createLeaveType>[1]) =>
      createLeaveType(companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.leaveTypes(companyId) });
    },
  });
}

export function useUpdateLeaveType(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateLeaveType>[2] }) =>
      updateLeaveType(companyId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.leaveTypes(companyId) });
    },
  });
}

export function useDeleteLeaveType(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLeaveType(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.leaveTypes(companyId) });
    },
  });
}

// ─── Public holidays (admin) ──────────────────────────────────────────────────

export function usePublicHolidays(companyId: string) {
  return useQuery({
    queryKey: settingsKeys.holidays(companyId),
    queryFn: () => listPublicHolidays(companyId),
    enabled: Boolean(companyId),
  });
}

export function useCreatePublicHoliday(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createPublicHoliday>[1]) =>
      createPublicHoliday(companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.holidays(companyId) });
    },
  });
}

export function useUpdatePublicHoliday(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updatePublicHoliday>[2] }) =>
      updatePublicHoliday(companyId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.holidays(companyId) });
    },
  });
}

export function useDeletePublicHoliday(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePublicHoliday(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.holidays(companyId) });
    },
  });
}

// ─── HRMS roles ───────────────────────────────────────────────────────────────

export function useHrmsRoles(companyId: string) {
  return useQuery({
    queryKey: settingsKeys.hrmsRoles(companyId),
    queryFn: () => listHrmsRoles(companyId),
    enabled: Boolean(companyId),
  });
}

export function useHrmsRoleAssignments(companyId: string) {
  return useQuery({
    queryKey: settingsKeys.hrmsRoleEmployees(companyId),
    queryFn: () => listHrmsRoleAssignments(companyId),
    enabled: Boolean(companyId),
  });
}

export function useCreateHrmsRole(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createHrmsRole>[1]) =>
      createHrmsRole(companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.hrmsRoles(companyId) });
    },
  });
}

export function useUpdateHrmsRole(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateHrmsRole>[2] }) =>
      updateHrmsRole(companyId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.hrmsRoles(companyId) });
    },
  });
}

export function useDeleteHrmsRole(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHrmsRole(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.hrmsRoles(companyId) });
    },
  });
}

export function useReplaceHrmsRoleEmployees(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ hrmsRoleId, employeeIds }: { hrmsRoleId: string; employeeIds: string[] }) =>
      replaceHrmsRoleEmployees(companyId, hrmsRoleId, employeeIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.hrmsRoleEmployees(companyId) });
      void queryClient.invalidateQueries({ queryKey: settingsKeys.hrmsRoles(companyId) });
    },
  });
}

// ─── Approval flows ───────────────────────────────────────────────────────────

export function useApprovalFlows(companyId: string) {
  return useQuery({
    queryKey: approvalKeys.flows(companyId),
    queryFn: () => listApprovalFlows(companyId),
    enabled: Boolean(companyId),
  });
}

export function useCreateApprovalFlow(companyId: string, actorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createApprovalFlow>[2]) =>
      createApprovalFlow(companyId, actorId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.flows(companyId) });
    },
  });
}

export function useUpdateApprovalFlow(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateApprovalFlow>[2] }) =>
      updateApprovalFlow(companyId, id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.flows(companyId) });
    },
  });
}

export function useDeleteApprovalFlow(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApprovalFlow(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.flows(companyId) });
    },
  });
}

export function useToggleApprovalFlowActive(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleApprovalFlowActive(companyId, id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.flows(companyId) });
    },
  });
}
