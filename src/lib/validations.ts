import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const inviteSignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const inviteUserSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst', 'creator_updater']),
});

export type InviteSignupFormData = z.infer<typeof inviteSignupSchema>;
export type InviteUserFormData = z.infer<typeof inviteUserSchema>;

// Vehicle schemas
export const vehicleSchema = z.object({
  chassis_no: z.string().min(1, 'Chassis number is required'),
  branch_code: z.string().min(1, 'Branch code is required'),
  model: z.string().min(1, 'Model is required'),
  customer_name: z.string().min(1, 'Customer name is required'),
  salesman_name: z.string().min(1, 'Salesman name is required'),
  payment_method: z.string().min(1, 'Payment method is required'),
  bg_date: z.string().nullable().optional(),
  shipment_etd_pkg: z.string().nullable().optional(),
  shipment_eta_kk_twu_sdk: z.string().nullable().optional(),
  date_received_by_outlet: z.string().nullable().optional(),
  reg_date: z.string().nullable().optional(),
  delivery_date: z.string().nullable().optional(),
  disb_date: z.string().nullable().optional(),
  vaa_date: z.string().nullable().optional(),
  full_payment_date: z.string().nullable().optional(),
  reg_no: z.string().nullable().optional(),
  invoice_no: z.string().nullable().optional(),
  lou: z.string().nullable().optional(),
  contra_sola: z.string().nullable().optional(),
  obr: z.string().nullable().optional(),
  dealer_transfer_price: z.string().nullable().optional(),
  full_payment_type: z.string().nullable().optional(),
  shipment_name: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  remark: z.string().nullable().optional(),
  is_d2d: z.boolean().optional(),
});

// User management schemas
export const userUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst', 'creator_updater']),
  access_scope: z.enum(['self', 'branch', 'company', 'global']),
  branch_id: z.string().nullable().optional(),
});

// Settings schemas
export const profileUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst', 'creator_updater']),
  branch_id: z.string().nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// SLA schemas
export const slaUpdateSchema = z.object({
  sla_days: z.coerce.number().min(1, 'SLA days must be at least 1').max(365, 'SLA days cannot exceed 365'),
});

// Permission schemas
export const columnPermissionSchema = z.object({
  column_key: z.string().min(1, 'Column key is required'),
  permission_level: z.enum(['none', 'view', 'edit']),
});

// Batch schema
export const importBatchSchema = z.object({
  file_name: z.string().min(1, 'File name is required'),
  status: z.enum(['validated', 'failed', 'publish_in_progress', 'published']),
  total_rows: z.coerce.number().min(0),
  valid_rows: z.coerce.number().min(0),
  error_rows: z.coerce.number().min(0),
  duplicate_rows: z.coerce.number().min(0),
});

// Type exports
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type VehicleFormData = z.infer<typeof vehicleSchema>;
export type UserUpdateFormData = z.infer<typeof userUpdateSchema>;
export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type SlaUpdateFormData = z.infer<typeof slaUpdateSchema>;
export type ColumnPermissionFormData = z.infer<typeof columnPermissionSchema>;
export type ImportBatchFormData = z.infer<typeof importBatchSchema>;

// ─── CRUD form schemas ────────────────────────────────────────────────────────

export const customerSchema = z.object({
  name:    z.string().min(1, 'Name is required'),
  phone:   z.string().optional(),
  email:   z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  nric:    z.string().optional(),
});
export type CustomerFormData = z.infer<typeof customerSchema>;

export const salesOrderSchema = z.object({
  orderNo:       z.string().min(1, 'Order No is required'),
  customerId:    z.string().min(1, 'Customer is required'),
  model:         z.string().min(1, 'Model is required'),
  branchCode:    z.string().optional(),
  salesmanName:  z.string().optional(),
  variant:       z.string().optional(),
  colour:        z.string().optional(),
  bookingDate:   z.string().min(1, 'Booking date is required'),
  bookingAmount: z.number({ invalid_type_error: 'Must be a number' }).positive('Must be positive').optional(),
  totalPrice:    z.number({ invalid_type_error: 'Must be a number' }).positive('Must be positive').optional(),
  status:        z.enum(['enquiry','quoted','confirmed','booked','delivered','cancelled']),
  vsoNo:             z.string().optional(),
  depositAmount:     z.number().nonnegative().optional(),
  bankLoanAmount:    z.number().nonnegative().optional(),
  financeCompany:    z.string().optional(),
  insuranceCompany:  z.string().optional(),
  plateNo:           z.string().optional(),
});
export type SalesOrderFormData = z.infer<typeof salesOrderSchema>;

export const purchaseInvoiceSchema = z.object({
  invoiceNo:   z.string().min(1, 'Invoice No is required'),
  supplier:    z.string().min(1, 'Supplier is required'),
  chassisNo:   z.string().min(1, 'Chassis No is required'),
  model:       z.string().min(1, 'Model is required'),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  amount:      z.number({ invalid_type_error: 'Must be a number' }).positive('Amount must be positive'),
  remark:      z.string().optional(),
});
export type PurchaseInvoiceFormData = z.infer<typeof purchaseInvoiceSchema>;

// ─── HRMS schemas ─────────────────────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  staffCode: z.string().min(1, 'Staff code is required').max(20, 'Staff code too long'),
  name:      z.string().min(2, 'Name must be at least 2 characters').max(100),
  email:     z.string().email('Invalid email address').optional().or(z.literal('')),
  role:      z.enum(['super_admin','company_admin','director','general_manager','manager','sales','accounts','analyst','creator_updater'], {
    errorMap: () => ({ message: 'Select a valid role' }),
  }),
  branch:    z.string().optional(),
  ic:        z.string().regex(/^\d{6}-\d{2}-\d{4}$/, 'IC must be in format XXXXXX-XX-XXXX').optional().or(z.literal('')),
  contact:   z.string().regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid contact number').optional().or(z.literal('')),
  joinDate:  z.string().min(1, 'Join date is required'),
});
export type CreateEmployeeFormData = z.infer<typeof createEmployeeSchema>;

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

export const upsertAttendanceSchema = z.object({
  employeeId:  z.string().min(1, 'Select an employee'),
  date:        z.string().min(1, 'Date is required'),
  status:      z.enum(['present','absent','half_day','on_leave','public_holiday'], {
    errorMap: () => ({ message: 'Select a valid status' }),
  }),
  clockIn:     z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional().or(z.literal('')),
  clockOut:    z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional().or(z.literal('')),
  hoursWorked: z.number().min(0, 'Cannot be negative').max(24, 'Cannot exceed 24').optional(),
  notes:       z.string().max(500, 'Notes too long').optional(),
});
export type UpsertAttendanceFormData = z.infer<typeof upsertAttendanceSchema>;


export const dealerInvoiceSchema = z.object({
  invoiceNo:  z.string().min(1, 'Invoice No is required'),
  dealerName: z.string().min(1, 'Dealer Name is required'),
  carModel:   z.string().optional(),
  colour:     z.string().optional(),
  chassisNo:  z.string().optional(),
  salesPrice: z.number().positive().optional(),
  invoiceDate: z.string().optional(),
  branchId:   z.string().optional(),
  status:     z.string().min(1, 'Status is required'),
});
export type DealerInvoiceFormData = z.infer<typeof dealerInvoiceSchema>;

// ─── HRMS Admin schemas ───────────────────────────────────────────────────────

export const departmentSchema = z.object({
  name:            z.string().min(2, 'Name must be at least 2 characters').max(80),
  description:     z.string().max(300).optional(),
  headEmployeeId:  z.string().optional(),
  costCentre:      z.string().max(30).optional(),
  isActive:        z.boolean().default(true),
});
export type DepartmentFormData = z.infer<typeof departmentSchema>;

export const jobTitleSchema = z.object({
  name:         z.string().min(2, 'Name must be at least 2 characters').max(80),
  departmentId: z.string().optional(),
  level:        z.enum(['junior','mid','senior','lead','executive']).optional(),
  description:  z.string().max(300).optional(),
  isActive:     z.boolean().default(true),
});
export type JobTitleFormData = z.infer<typeof jobTitleSchema>;

export const leaveTypeAdminSchema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters').max(60),
  code:        z.string().min(1).max(10).regex(/^[A-Z_]+$/, 'Uppercase letters and underscores only'),
  daysPerYear: z.number().min(0, 'Cannot be negative').max(365),
  isPaid:      z.boolean(),
  active:      z.boolean().default(true),
});
export type LeaveTypeAdminFormData = z.infer<typeof leaveTypeAdminSchema>;

export const holidaySchema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters').max(100),
  date:        z.string().min(1, 'Date is required'),
  holidayType: z.enum(['public','company']),
  isRecurring: z.boolean().default(false),
});
export type HolidayFormData = z.infer<typeof holidaySchema>;

// ─── Approval Flow schemas ────────────────────────────────────────────────────

export const approvalStepSchema = z.object({
  name:             z.string().min(1, 'Step name is required').max(80),
  approverType:     z.enum(['role','specific_user','direct_manager']),
  approverRole:     z.string().nullable().optional(),
  approverUserId:   z.string().nullable().optional(),
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
  entityType:  z.enum(['leave_request','payroll_run','appraisal','general']),
  isActive:    z.boolean().default(true),
});

export const approvalFlowWithStepsSchema = approvalFlowSchema.extend({
  steps: z.array(approvalStepSchema).min(1, 'Add at least one approval step'),
});
export type ApprovalFlowFormData = z.infer<typeof approvalFlowWithStepsSchema>;