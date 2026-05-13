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
  opts?: { dateFrom?: string; dateTo?: string },
) {
  return useQuery({
    queryKey: attendanceKeys.records('', employeeId, opts?.dateFrom, opts?.dateTo),
    queryFn: () => getMyAttendance(employeeId, opts),
    enabled: Boolean(employeeId),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useUpsertAttendance(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof upsertAttendance>[0]) =>
      upsertAttendance(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all(companyId) });
    },
  });
}

export function useClockIn(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, note }: { employeeId: string; note?: string }) =>
      clockIn(employeeId, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all(companyId) });
    },
  });
}

export function useClockOut(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, note }: { employeeId: string; note?: string }) =>
      clockOut(employeeId, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all(companyId) });
    },
  });
}
