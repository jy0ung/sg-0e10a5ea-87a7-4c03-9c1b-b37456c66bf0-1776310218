import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAttendanceRecords,
  getMyAttendance,
  upsertAttendance,
  clockIn,
  clockOut,
} from '@flc/hrms-services';
import { attendanceKeys } from '../queryKeys';

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useAttendanceRecords(
  companyId: string,
  opts?: Parameters<typeof listAttendanceRecords>[1],
) {
  return useQuery({
    queryKey: attendanceKeys.records(
      companyId,
      opts?.employeeId,
      opts?.dateFrom,
      opts?.dateTo,
    ),
    queryFn: () => listAttendanceRecords(companyId, opts),
    enabled: Boolean(companyId),
  });
}

export function useMyAttendance(
  employeeId: string,
  companyId: string,
  opts?: { dateFrom?: string; dateTo?: string },
) {
  return useQuery({
    queryKey: attendanceKeys.records('', employeeId, opts?.dateFrom, opts?.dateTo),
    queryFn: () => getMyAttendance(employeeId, companyId, {
      from: opts?.dateFrom ?? '',
      to: opts?.dateTo ?? new Date().toISOString().slice(0, 10),
    }),
    enabled: Boolean(employeeId) && Boolean(companyId),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useUpsertAttendance(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof upsertAttendance>[1]) =>
      upsertAttendance(companyId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all(companyId) });
    },
  });
}

export function useClockIn(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, date }: { employeeId: string; date: string }) =>
      clockIn(employeeId, companyId, date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all(companyId) });
    },
  });
}

export function useClockOut(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, date }: { employeeId: string; date: string }) =>
      clockOut(employeeId, companyId, date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all(companyId) });
    },
  });
}
