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
  role: z.enum(['super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst']),
  access_scope: z.enum(['self', 'branch', 'company', 'global']),
  branch_id: z.string().nullable().optional(),
});

// Settings schemas
export const profileUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst']),
  branch_id: z.string().nullable().optional(),
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
export type SlaUpdateFormData = z.infer<typeof slaUpdateSchema>;
export type ColumnPermissionFormData = z.infer<typeof columnPermissionSchema>;
export type ImportBatchFormData = z.infer<typeof importBatchSchema>;