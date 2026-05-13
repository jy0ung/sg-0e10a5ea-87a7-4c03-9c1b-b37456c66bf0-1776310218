/**
 * @flc/hrms-hooks
 *
 * Shared React Query hooks for HRMS domain data.
 * Consumed by both hrms-web and hrms-mobile.
 *
 * All hooks require a React Query client in context.
 * Peer dependencies: react >=18, @tanstack/react-query >=5
 */
export * from './queryKeys';
export * from './leave/useLeave';
export * from './approval/useApproval';
export * from './payroll/usePayroll';
export * from './appraisal/useAppraisal';
export * from './attendance/useAttendance';
export * from './employee/useEmployee';
export * from './announcement/useAnnouncement';
export * from './settings/useSettings';
