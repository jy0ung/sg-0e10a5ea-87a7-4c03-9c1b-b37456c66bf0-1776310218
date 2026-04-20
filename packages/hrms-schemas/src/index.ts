/**
 * @flc/hrms-schemas
 * Shared Zod validation schemas used by both the web app and the HRMS mobile app.
 * Web-only schemas (vehicle import, SLA config, etc.) remain in apps/web/src/lib/validations.ts.
 */
import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email:    z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
export type LoginFormData = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

// ─── Leave ────────────────────────────────────────────────────────────────────

export const createLeaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1, 'Select a leave type'),
  startDate:   z.string().min(1, 'Start date is required'),
  endDate:     z.string().min(1, 'End date is required'),
  reason:      z.string().max(500, 'Reason too long').optional(),
}).refine(d => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
  message: 'End date must be on or after start date',
  path: ['endDate'],
});
export type CreateLeaveRequestFormData = z.infer<typeof createLeaveRequestSchema>;

// ─── Attendance ───────────────────────────────────────────────────────────────

export const upsertAttendanceSchema = z.object({
  employeeId:   z.string().min(1, 'Employee is required'),
  date:         z.string().min(1, 'Date is required'),
  status:       z.enum(['present', 'absent', 'half_day', 'on_leave', 'public_holiday'], {
    errorMap: () => ({ message: 'Select a valid status' }),
  }),
  clockIn:      z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional().or(z.literal('')),
  clockOut:     z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional().or(z.literal('')),
  hoursWorked:  z.number().min(0).max(24).optional(),
  notes:        z.string().max(500).optional(),
});
export type UpsertAttendanceFormData = z.infer<typeof upsertAttendanceSchema>;

// ─── HRMS Admin (web + mobile-admin) ─────────────────────────────────────────

export const departmentSchema = z.object({
  name:           z.string().min(2, 'Name must be at least 2 characters').max(80),
  description:    z.string().max(300).optional(),
  headEmployeeId: z.string().optional(),
  costCentre:     z.string().max(30).optional(),
  isActive:       z.boolean().default(true),
});
export type DepartmentFormData = z.infer<typeof departmentSchema>;

export const jobTitleSchema = z.object({
  name:         z.string().min(2, 'Name must be at least 2 characters').max(80),
  departmentId: z.string().optional(),
  level:        z.enum(['junior', 'mid', 'senior', 'lead', 'executive']).optional(),
  description:  z.string().max(300).optional(),
  isActive:     z.boolean().default(true),
});
export type JobTitleFormData = z.infer<typeof jobTitleSchema>;

export const leaveTypeAdminSchema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters').max(60),
  code:        z.string().min(1).max(10).regex(/^[A-Z_]+$/, 'Uppercase letters and underscores only'),
  daysPerYear: z.number().min(0).max(365),
  isPaid:      z.boolean(),
  active:      z.boolean().default(true),
});
export type LeaveTypeAdminFormData = z.infer<typeof leaveTypeAdminSchema>;

export const holidaySchema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters').max(100),
  date:        z.string().min(1, 'Date is required'),
  holidayType: z.enum(['public', 'company']),
  isRecurring: z.boolean().default(false),
});
export type HolidayFormData = z.infer<typeof holidaySchema>;

export const approvalStepSchema = z.object({
  name:              z.string().min(1, 'Step name is required').max(80),
  approverType:      z.enum(['role', 'specific_user', 'direct_manager']),
  approverRole:      z.string().nullable().optional(),
  approverUserId:    z.string().nullable().optional(),
  allowSelfApproval: z.boolean().default(false),
}).refine(d => d.approverType !== 'role' || !!d.approverRole, {
  message: 'Select a role for this step',
  path: ['approverRole'],
}).refine(d => d.approverType !== 'specific_user' || !!d.approverUserId, {
  message: 'Select an approver for this step',
  path: ['approverUserId'],
});

export const approvalFlowSchema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().max(300).optional(),
  entityType:  z.enum(['leave_request', 'payroll_run', 'appraisal', 'general']),
  isActive:    z.boolean().default(true),
});

export const approvalFlowWithStepsSchema = approvalFlowSchema.extend({
  steps: z.array(approvalStepSchema).min(1, 'Add at least one approval step'),
});
export type ApprovalFlowFormData = z.infer<typeof approvalFlowWithStepsSchema>;
