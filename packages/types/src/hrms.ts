import type { AppRole } from './auth';

// ===== HRMS =====
export type HrmsRoleScope = 'company' | 'branch' | 'department' | 'self';
export type HrmsRoleCategory =
  | 'executive'
  | 'hr'
  | 'department'
  | 'line_management'
  | 'staff'
  | 'employee'
  | 'payroll'
  | 'attendance'
  | 'custom';

export interface HrmsRole {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: HrmsRoleCategory;
  scope: HrmsRoleScope;
  authorityLevel: number;
  description?: string;
  canApproveRequests: boolean;
  canManageEmployeeRecords: boolean;
  canViewHrmsReports: boolean;
  isActive: boolean;
  isSystemDefault: boolean;
  assignedUserCount: number;
  lastUpdatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHrmsRoleInput {
  name: string;
  category: HrmsRoleCategory;
  scope: HrmsRoleScope;
  authorityLevel: number;
  description?: string;
  canApproveRequests: boolean;
  canManageEmployeeRecords: boolean;
  canViewHrmsReports: boolean;
  isActive: boolean;
}

export type UpdateHrmsRoleInput = CreateHrmsRoleInput;

export interface HrmsRoleAssignment {
  id: string;
  companyId: string;
  hrmsRoleId: string;
  employeeId?: string;
  profileId?: string;
  employeeName?: string;
  profileName?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EmployeeStatus = 'active' | 'inactive' | 'resigned';

export interface Employee {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  branchId?: string;
  managerId?: string;
  staffCode?: string;
  icNo?: string;
  contactNo?: string;
  joinDate?: string;
  resignDate?: string;
  status: EmployeeStatus;
  avatarUrl?: string;
  departmentId?: string;
  departmentName?: string;
  jobTitleId?: string;
  jobTitleName?: string;
  managerName?: string;
}

// ===== HRMS — Leave =====
export interface LeaveType {
  id: string;
  companyId: string;
  name: string;
  code: string;
  daysPerYear: number;
  defaultDays: number;
  carryForward: boolean;
  isPaid: boolean;
  requiresBalance: boolean;
  minAdvanceNoticeDays: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitledDays: number;
  usedDays: number;
  remainingDays: number;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveDayPart = 'full_day' | 'half_day_morning' | 'half_day_afternoon';

export interface LeaveRequest {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName?: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  startDate: string;
  endDate: string;
  days: number;
  dayPart?: LeaveDayPart;
  reason?: string;
  attachmentFileName?: string;
  attachmentFilePath?: string;
  attachmentFileSize?: number;
  attachmentMimeType?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNote?: string;
  approvalInstanceId?: string;
  approvalInstanceStatus?: ApprovalInstanceStatus;
  currentApprovalStepOrder?: number;
  currentApprovalStepName?: string;
  currentApproverRole?: string;
  currentApproverUserId?: string;
  approvalHistory?: ApprovalDecision[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveRequestInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  dayPart?: LeaveDayPart;
  reason?: string;
  attachmentFile?: File;
  attachmentFileName?: string;
  attachmentFilePath?: string;
  attachmentFileSize?: number;
  attachmentMimeType?: string;
}

// ===== HRMS — Attendance =====
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'on_leave' | 'public_holiday';

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  hoursWorked?: number;
  status: AttendanceStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAttendanceInput {
  employeeId: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  hoursWorked?: number;
  status: AttendanceStatus;
  notes?: string;
}

// ===== HRMS — Payroll =====
export type PayrollRunStatus = 'draft' | 'finalised' | 'paid';

export interface PayrollRun {
  id: string;
  companyId: string;
  periodYear: number;
  periodMonth: number;
  status: PayrollRunStatus;
  approvalInstanceId?: string;
  approvalInstanceStatus?: ApprovalInstanceStatus;
  currentApprovalStepOrder?: number;
  currentApprovalStepName?: string;
  currentApproverRole?: string;
  currentApproverUserId?: string;
  approvalHistory?: ApprovalDecision[];
  totalHeadcount: number;
  totalGross: number;
  totalNet: number;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollItem {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName?: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  grossPay: number;
  epfEmployee: number;
  socsoEmployee: number;
  incomeTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  epfEmployer: number;
  socsoEmployer: number;
  notes?: string;
}

// ===== HRMS — Appraisals =====
export type AppraisalCycle = 'annual' | 'mid_year' | 'quarterly' | 'probation';
export type AppraisalStatus = 'open' | 'in_progress' | 'completed' | 'archived';
export type AppraisalItemStatus = 'pending' | 'self_reviewed' | 'reviewed' | 'acknowledged';

export interface Appraisal {
  id: string;
  companyId: string;
  title: string;
  cycle: AppraisalCycle;
  periodStart: string;
  periodEnd: string;
  status: AppraisalStatus;
  approvalInstanceId?: string;
  approvalInstanceStatus?: ApprovalInstanceStatus;
  currentApprovalStepOrder?: number;
  currentApprovalStepName?: string;
  currentApproverRole?: string;
  currentApproverUserId?: string;
  approvalHistory?: ApprovalDecision[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppraisalItem {
  id: string;
  appraisalId: string;
  employeeId: string;
  employeeName?: string;
  reviewerId?: string;
  reviewerName?: string;
  rating?: number;
  goals?: string;
  achievements?: string;
  areasToImprove?: string;
  reviewerComments?: string;
  employeeComments?: string;
  status: AppraisalItemStatus;
  reviewedAt?: string;
}

export interface UpdateAppraisalItemInput {
  rating?: number;
  goals?: string;
  achievements?: string;
  areasToImprove?: string;
  reviewerComments?: string;
  employeeComments?: string;
  status?: AppraisalItemStatus;
  reviewedAt?: string;
  reviewerId?: string;
}

// ===== HRMS — Announcements =====
export type AnnouncementCategory = 'general' | 'policy' | 'event' | 'emergency' | 'holiday';
export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Announcement {
  id: string;
  companyId: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  pinned: boolean;
  publishedAt?: string;
  expiresAt?: string;
  authorId?: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  pinned?: boolean;
  publishedAt?: string;
  expiresAt?: string;
}

// ===== HRMS — Leave Type Admin =====
export interface CreateLeaveTypeInput {
  name: string;
  code: string;
  daysPerYear: number;
  defaultDays?: number;
  carryForward?: boolean;
  isPaid: boolean;
  requiresBalance?: boolean;
  minAdvanceNoticeDays?: number | null;
  active: boolean;
}
export type UpdateLeaveTypeInput = CreateLeaveTypeInput;

// ===== HRMS — Admin Structures =====
export type JobTitleLevel = 'junior' | 'mid' | 'senior' | 'lead' | 'executive';
export type HolidayType = 'public' | 'company';

export interface Department {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  headEmployeeId?: string;
  headEmployeeName?: string;
  costCentre?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentInput {
  name: string;
  description?: string;
  headEmployeeId?: string;
  costCentre?: string;
  isActive: boolean;
}
export type UpdateDepartmentInput = CreateDepartmentInput;

export interface JobTitle {
  id: string;
  companyId: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
  level?: JobTitleLevel;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobTitleInput {
  name: string;
  departmentId?: string;
  level?: JobTitleLevel | '';
  description?: string;
  isActive: boolean;
}
export type UpdateJobTitleInput = CreateJobTitleInput;

export interface PublicHoliday {
  id: string;
  companyId: string;
  name: string;
  date: string;
  holidayType: HolidayType;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHolidayInput {
  name: string;
  date: string;
  holidayType: HolidayType;
  isRecurring: boolean;
}
export type UpdateHolidayInput = CreateHolidayInput;

// ===== HRMS — Approval Execution Engine =====
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PendingApproval {
  id: string;
  entityType: FlowEntityType;
  entityId: string;
  companyId: string;
  flowId: string;
  flowName: string;
  currentStepOrder: number;
  currentStepName: string;
  requesterId: string;
  requesterName?: string;
  status: ApprovalRequestStatus;
  leaveRequest?: {
    startDate: string;
    endDate: string;
    days: number;
    leaveTypeName?: string;
    reason?: string;
  };
  createdAt: string;
}

// ===== HRMS — Approval Flows =====
export type ApproverType = 'role' | 'specific_user' | 'direct_manager';
export type FlowEntityType = 'leave_request' | 'payroll_run' | 'appraisal' | 'internal_request' | 'general';
export type ApprovalInstanceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalDecisionStatus = 'approved' | 'rejected';

export interface FlowConditions {
  requesterRole?: string;
  departmentId?: string;
  branchId?: string;
  categoryKey?: string;
  subcategoryKey?: string;
  amountMin?: number;
  amountMax?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ApprovalStep {
  id: string;
  flowId: string;
  stepOrder: number;
  name: string;
  approverType: ApproverType;
  approverRoleName?: string;
  approverRole?: string;
  approverUserId?: string;
  approverUserName?: string;
  fallbackApproverUserId?: string;
  fallbackApproverUserName?: string;
  escalationRule?: string;
  conditionRule?: string;
  isActive: boolean;
  allowSelfApproval: boolean;
}

export interface ApprovalFlow {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  entityType: FlowEntityType;
  isActive: boolean;
  createdBy?: string;
  departmentId?: string | null;
  departmentName?: string;
  isDefault: boolean;
  conditions: FlowConditions | null;
  matchPriority: number;
  updatedBy?: string;
  steps: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalFlowInput {
  name: string;
  description?: string;
  entityType: FlowEntityType;
  isActive: boolean;
  departmentId?: string | null;
  isDefault?: boolean;
  conditions?: FlowConditions | null;
  matchPriority?: number;
  steps: Omit<ApprovalStep, 'id' | 'flowId' | 'approverUserName'>[];
}
export type UpdateApprovalFlowInput = CreateApprovalFlowInput;

export interface ApprovalInstance {
  id: string;
  companyId: string;
  flowId: string;
  entityType: FlowEntityType;
  entityId: string;
  requesterId: string;
  currentStepId?: string;
  currentStepOrder?: number;
  currentStepName?: string;
  currentApproverRole?: string;
  currentApproverUserId?: string;
  status: ApprovalInstanceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDecision {
  id: string;
  instanceId: string;
  stepId: string;
  stepOrder: number;
  approverId: string;
  approverName?: string;
  stepName?: string;
  decision: ApprovalDecisionStatus;
  note?: string;
  decidedAt: string;
  createdAt: string;
}
