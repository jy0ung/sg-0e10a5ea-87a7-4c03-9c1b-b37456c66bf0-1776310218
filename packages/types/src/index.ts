// ===== User & Auth =====
export type AppRole = 'super_admin' | 'company_admin' | 'director' | 'general_manager' | 'manager' | 'sales' | 'accounts' | 'analyst' | 'creator_updater';
export type AccessScope = 'self' | 'branch' | 'company' | 'global';

export const DEFAULT_APP_ROLE: AppRole = 'creator_updater';

export const ROLE_DEFAULT_SCOPE: Record<AppRole, AccessScope> = {
  super_admin: 'global',
  company_admin: 'company',
  director: 'company',
  general_manager: 'company',
  manager: 'branch',
  sales: 'self',
  accounts: 'company',
  analyst: 'company',
  creator_updater: 'branch',
};

export interface User {
  id: string;
  employeeId?: string | null;
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  branchId?: string;
  avatar?: string;
  accessScope: AccessScope;
}

export interface Company {
  id: string;
  name: string;
  code: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  companyId: string;
}

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
  /** If false, balance check is skipped on submission (e.g. Unpaid Leave). */
  requiresBalance: boolean;
  /** If set, start_date must be >= today + N calendar days. */
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
  remainingDays: number; // computed: entitledDays - usedDays
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

// ===== HRMS — Appraisal item update =====
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

// ===== HRMS — Approval Execution Engine =====
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PendingApproval {
  id: string;              // approval_requests.id
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
  // Populated for leave_request context
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
  /** UUID of the department this flow is scoped to, or null for company-wide flows. */
  departmentId?: string | null;
  /** Human-readable department name (joined from departments table). */
  departmentName?: string;
  /** True when this flow is the preferred fallback for all departments without a specific flow. */
  isDefault: boolean;
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
  /** UUID of the department to scope this flow to, or null/undefined for a company-wide flow. */
  departmentId?: string | null;
  /** Mark this as the default fallback when no department-specific flow matches. */
  isDefault?: boolean;
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

// ===== Import Pipeline =====
export type ImportStatus = 'uploaded' | 'validating' | 'validated' | 'normalization_in_progress' | 'normalization_complete' | 'publish_in_progress' | 'published' | 'published_with_review' | 'review_pending' | 'review_in_progress' | 'review_complete' | 'failed';

export interface ImportBatch {
  id: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  publishedRows?: number;
  reviewRows?: number;
  reviewCompletedAt?: string;
  publishedAt?: string;
}

export interface ImportBatchInsert {
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  companyId: string;
  publishedRows?: number;
  reviewRows?: number;
  reviewCompletedAt?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
  rowNumber?: number;
}

export type ImportReviewStatus = 'pending' | 'in_review' | 'resolved' | 'discarded';
export type ImportReviewReason = 'incomplete' | 'blocking' | 'mixed';

export interface ImportReviewRow {
  id: string;
  importBatchId: string;
  companyId: string;
  rowNumber: number;
  sourceRowId?: string;
  chassisNo?: string;
  branchCode?: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
  validationErrors: ValidationError[];
  reviewReason: ImportReviewReason;
  reviewStatus: ImportReviewStatus;
  assignedTo?: string | null;
  resolvedVehicleId?: string | null;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Vehicle =====

/**
 * Pipeline stage for an auto-aging vehicle. Introduced with the new Excel
 * template which groups rows under three category sections. Values are
 * derived from milestone dates by default; users can pin a stage via
 * `VehicleCanonical.stage_override`.
 */
export type VehicleStage =
  | 'pending_register_free_stock'
  | 'pending_deliver_loan_disburse'
  | 'complete';

export interface VehicleRaw {
  id: string;
  import_batch_id: string;
  row_number: number;
  chassis_no: string;
  bg_date?: string;
  shipment_etd_pkg?: string;
  shipment_eta_kk_twu_sdk?: string;
  date_received_by_outlet?: string;
  reg_date?: string;
  delivery_date?: string;
  disb_date?: string;
  branch_code?: string;
  model?: string;
  payment_method?: string;
  salesman_name?: string;
  customer_name?: string;
  remark?: string;
  vaa_date?: string;
  full_payment_date?: string;
  is_d2d?: boolean;
  // Optional fields
  source_row_no?: string;
  variant?: string;
  color?: string;
  dealer_transfer_price?: string;
  full_payment_type?: string;
  shipment_name?: string;
  lou?: string;
  contra_sola?: string;
  reg_no?: string;
  invoice_no?: string;
  obr?: string;
  // Commission tracking — parsed from the "COMM PAYOUT..." column on the new template
  commission_paid?: boolean;
  commission_remark?: string;
}

export interface VehicleCanonical {
  id: string;
  chassis_no: string;
  is_deleted?: boolean;
  deleted_at?: string;
  bg_date?: string;
  shipment_etd_pkg?: string;
  shipment_eta_kk_twu_sdk?: string;
  date_received_by_outlet?: string;
  reg_date?: string;
  delivery_date?: string;
  disb_date?: string;
  branch_code: string;
  model: string;
  payment_method: string;
  salesman_name: string;
  customer_name: string;
  remark?: string;
  vaa_date?: string;
  full_payment_date?: string;
  is_d2d?: boolean;
  import_batch_id?: string | null;
  source_row_id?: string | null;
  // Optional fields
  variant?: string;
  color?: string;
  dealer_transfer_price?: string;
  full_payment_type?: string;
  shipment_name?: string;
  lou?: string;
  contra_sola?: string;
  reg_no?: string;
  invoice_no?: string;
  obr?: string;
  // Commission tracking — from the "COMM PAYOUT..." column on the new template.
  // `commission_paid=false` with a `commission_remark` (e.g. "Comm not paid") is
  // the common case; `true` means payout has been processed.
  commission_paid?: boolean;
  commission_remark?: string;
  // Pipeline stage — see VehicleStage. `stage` is auto-derived from date fields
  // (DB trigger), `stage_override` wins when set so users can pin a card manually.
  stage?: VehicleStage | null;
  stage_override?: VehicleStage | null;
  // Computed KPIs — new flow: BG → ETD → Outlet → Reg → Delivery → Disb
  bg_to_delivery?: number | null;
  bg_to_shipment_etd?: number | null;
  etd_to_outlet?: number | null;
  outlet_to_reg?: number | null;
  reg_to_delivery?: number | null;
  bg_to_disb?: number | null;
  delivery_to_disb?: number | null;
  // Incomplete-record flags — set when vehicle was imported with missing reference/person data
  is_incomplete?: boolean;
  pending_fields?: string[];
  // HRMS link — resolved profile UUID of the salesman
  salesman_id?: string | null;
}

// ===== KPI =====
export interface KpiDefinition {
  id: string;
  label: string;
  shortLabel: string;
  fromField: keyof VehicleCanonical;
  toField: keyof VehicleCanonical;
  computedField: keyof VehicleCanonical;
  slaDefault: number;
}

export interface KpiSummary {
  kpiId: string;
  label: string;
  shortLabel: string;
  validCount: number;
  invalidCount: number;
  missingCount: number;
  median: number;
  average: number;
  p90: number;
  overdueCount: number;
  slaDays: number;
}

// ===== Data Quality =====
export interface DataQualityIssue {
  id: string;
  chassisNo: string;
  field: string;
  issueType: 'missing' | 'invalid' | 'negative' | 'duplicate' | 'format_error';
  message: string;
  severity: 'warning' | 'error';
  importBatchId: string;
  rowNumber?: number;
}

// ===== SLA =====
export interface SlaPolicy {
  id: string;
  kpiId: string;
  label?: string;
  slaDays: number;
  companyId?: string;
  isActive?: boolean;
}

// ===== Notification =====
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
  userId: string;
}

// ===== Audit =====
export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  createdAt: string;
}

// ===== Module =====
export interface PlatformModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'coming_soon' | 'planned';
  path?: string;
}

// ===== KPI Dashboard Filters =====
export interface KpiDashboardFilters {
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  branches: string[];
  models: string[];
  paymentMethods: string[];
  overdueOnly: boolean;
}

export interface KpiSegmentClick {
  kpiId: string;
  segmentType: 'compliant' | 'overdue' | 'missing' | 'invalid';
  value: number;

}

// ===== Mapping Admin =====
export interface BranchMapping {
  id: string;
  rawValue: string;
  canonicalCode: string;
  notes?: string;
  companyId: string;
}

export interface PaymentMethodMapping {
  id: string;
  rawValue: string;
  canonicalValue: string;
  notes?: string;
  companyId: string;
}

// ===== Sales Module =====
export interface Customer {
  id: string;
  name: string;
  icNo?: string;
  nric?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DealStage {
  id: string;
  name: string;
  stageOrder: number;
  color: string;
  companyId: string;
}

export type SalesOrderStatus = 'enquiry' | 'quoted' | 'confirmed' | 'booked' | 'delivered' | 'cancelled';

export interface SalesOrder {
  id: string;
  companyId: string;
  orderNo: string;
  customerId?: string;
  customerName?: string;
  branchCode: string;
  salesmanId?: string;
  salesmanName?: string;
  model: string;
  variant?: string;
  colour?: string;
  bookingDate: string;
  deliveryDate?: string;
  bookingAmount?: number;
  totalPrice?: number;
  status: SalesOrderStatus;
  dealStageId?: string;
  chassisNo?: string;
  vehicleId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // VSO / financing fields
  vsoNo?: string;
  depositAmount?: number;
  bankLoanAmount?: number;
  outstandingAmount?: number;
  financeCompany?: string;
  insuranceCompany?: string;
  plateNo?: string;
}

export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid';
export type InvoiceType = 'customer_sales' | 'dealer_sales' | 'purchase';
export type InvoiceReconciliationStatus = 'pending' | 'reconciled' | 'disputed' | 'override';
export type InvoiceSourceType = 'ubs_local' | 'dms_snapshot' | 'legacy_backfill';

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNo: string;
  salesOrderId: string;
  customerId?: string;
  customerName?: string;
  issueDate: string;
  dueDate?: string;
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  paidAmount?: number;
  paymentStatus: InvoicePaymentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Phase 1B migration fields
  invoiceType: InvoiceType;
  // Stage 4 AR fields
  reconciliationStatus?: InvoiceReconciliationStatus;
  sourceType?: InvoiceSourceType;
  dmsCollectionRef?: string;
}

export type PaymentEventType = 'payment' | 'reversal' | 'write_off' | 'adjustment';

export interface PaymentEvent {
  id: string;
  companyId: string;
  invoiceId: string;
  eventType: PaymentEventType;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  receiptReference?: string;
  officialReceiptId?: string;
  notes?: string;
  reversalOfEventId?: string;
  isReversed?: boolean;
  createdBy?: string;
  createdAt: string;
}

export type ArAgingBucket = 'no_due_date' | 'current' | '1_30_days' | '31_60_days' | '61_90_days' | 'over_90_days';

export interface ArAgingSummary {
  bucket: ArAgingBucket;
  invoiceCount: number;
  totalOutstanding: number;
  overdueAmount: number;
}

// ===== Accounts Payable (Stage 5) =====

export type PurchaseInvoiceLifecycleStatus =
  | 'received' | 'verified' | 'approved' | 'scheduled' | 'paid' | 'cancelled';

export type ApPaymentStatus = 'unpaid' | 'partial' | 'paid';

export type SupplierPaymentEventType = 'payment' | 'reversal' | 'write_off' | 'adjustment';

export type ApAgingBucket = 'no_due_date' | 'current' | '1_30_days' | '31_60_days' | '61_90_days' | 'over_90_days';

export interface SupplierPaymentEvent {
  id: string;
  companyId: string;
  purchaseInvoiceId: string;
  eventType: SupplierPaymentEventType;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  referenceNo?: string;
  notes?: string;
  reversalOfEventId?: string;
  isReversed?: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface ApAgingSummary {
  bucket: ApAgingBucket;
  invoiceCount: number;
  totalOutstanding: number;
  overdueAmount: number;
}

export interface SalesmanTarget {
  id: string;
  salesmanName: string;
  branchCode: string;
  periodYear: number;
  periodMonth: number;
  targetUnits: number;
  targetRevenue: number;
  companyId: string;
}

export interface SalesmanPerformance {
  salesmanName: string;
  branchCode: string;
  totalDeals: number;
  closedDeals: number;
  totalRevenue: number;
  avgDealValue: number;
  conversionRate: number;
  commissionEarned: number;
  targetUnits?: number;
  targetRevenue?: number;
  targetAchievement?: number;
}

export interface CommissionRule {
  id: string;
  salesmanName?: string;
  branchCode?: string;
  ruleName: string;
  thresholdDays?: number;
  amount: number;
  companyId: string;
}

export interface CommissionRecord {
  id: string;
  vehicleId?: string;
  chassisNo: string;
  salesmanName: string;
  ruleId?: string;
  ruleName?: string;
  status: 'pending' | 'approved' | 'paid';
  amount: number;
  period: string;
  companyId: string;
  createdAt: string;
}

// ===== Master Data =====
export interface FinanceCompany {
  id: string;
  code: string;
  name: string;
  companyId: string;
  createdAt: string;
}

export interface InsuranceCompany {
  id: string;
  code: string;
  name: string;
  companyId: string;
  createdAt: string;
}

export interface VehicleModel {
  id: string;
  code: string;
  name: string;
  basePrice?: number;
  companyId: string;
  createdAt: string;
}

export interface VehicleColour {
  id: string;
  code: string;
  name: string;
  hex?: string;
  companyId: string;
  createdAt: string;
}

export interface BranchRecord {
  id: string;
  code: string;
  name: string;
  orSeries?: string;
  vdoSeries?: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TinType { id: string; code: string; name: string; status: string; companyId: string; createdAt: string; }
export interface RegistrationFee { id: string; description: string; price: number; status: string; companyId: string; createdAt: string; }
export interface RoadTaxFee { id: string; description: string; price: number; status: string; companyId: string; createdAt: string; }
export interface InspectionFee { id: string; itemCode?: string; description: string; price: number; status: string; companyId: string; createdAt: string; }
export interface HandlingFee { id: string; itemCode?: string; description: string; price: number; billing?: string; status: string; companyId: string; createdAt: string; }
export interface AdditionalItem { id: string; itemCode?: string; description: string; unitPrice: number; status: string; companyId: string; createdAt: string; }
export interface PaymentType { id: string; name: string; billing?: string; status: string; companyId: string; createdAt: string; }
export interface BankRecord { id: string; name: string; accountNo?: string; status: string; companyId: string; createdAt: string; }
export interface Supplier { id: string; name: string; code?: string; companyRegNo?: string; companyAddress?: string; mailingAddress?: string; attn?: string; contactNo?: string; email?: string; status: string; companyId: string; createdAt: string; }
export interface Dealer { id: string; name: string; accCode?: string; companyRegNo?: string; companyAddress?: string; mailingAddress?: string; attn?: string; contactNo?: string; email?: string; status: string; companyId: string; createdAt: string; }
export interface UserGroup { id: string; name: string; status: string; companyId: string; createdAt: string; }
export interface DealerInvoice { id: string; invoiceNo: string; branch?: string; dealerName?: string; carModel?: string; carColour?: string; chassisNo?: string; salesPrice?: number; invoiceDate?: string; status: string; companyId: string; createdAt: string; }
export interface OfficialReceipt { id: string; receiptDate?: string; branch?: string; receiptNo: string; amount?: number; attachmentUrl?: string; verifiedBy?: string; status: string; companyId: string; createdAt: string; }

// ===== General Ledger (Stage 6) =====

export type GlAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type AccountingPeriodStatus = 'open' | 'closed' | 'locked';

export type JournalEntrySourceType = 'ar_payment' | 'ap_payment' | 'manual' | 'adjustment';

export interface GlAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: GlAccountType;
  isSystem: boolean;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingPeriod {
  id: string;
  companyId: string;
  name: string;
  periodYear: number;
  periodMonth: number;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  companyId: string;
  periodId: string;
  entryDate: string;
  description: string;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  referenceNo?: string;
  postedBy?: string;
  postedAt: string;
  createdAt: string;
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  description?: string;
  debit: number;
  credit: number;
  createdAt: string;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: GlAccountType;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}

export interface ProfitLossRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: Extract<GlAccountType, 'revenue' | 'expense'>;
  amount: number;
}

export interface BalanceSheetRow {
  // accountId is null for the synthetic "Current Period Earnings" row.
  accountId: string | null;
  accountCode: string;
  accountName: string;
  accountType: Extract<GlAccountType, 'asset' | 'liability' | 'equity'>;
  balance: number;
}

export interface CashPositionRow {
  positionDate: string;     // ISO date (YYYY-MM-DD)
  dailyDebit: number;
  dailyCredit: number;
  dailyNet: number;
  runningBalance: number;
}

export interface PeriodCloseSummary {
  periodStatus: AccountingPeriodStatus;
  periodStartDate: string;
  periodEndDate: string;
  journalEntryCount: number;
  totalDebit: number;
  totalCredit: number;
  unpostedArPaymentCount: number;
  unpostedArPaymentAmount: number;
  unpostedApPaymentCount: number;
  unpostedApPaymentAmount: number;
  openArInvoiceCount: number;
  openArInvoiceOutstanding: number;
  openApInvoiceCount: number;
  openApInvoiceOutstanding: number;
}

export interface PeriodCloseUnpostedRow {
  kind: 'ar_payment' | 'ap_payment';
  eventId: string;
  documentId: string;
  paymentDate: string;
  amount: number;
  reference: string | null;
}

export type AgingBucket = 'no_due_date' | 'current' | '1_30_days' | '31_60_days' | '61_90_days' | 'over_90_days';

export interface AgingByBranchRow {
  branchCode: string;
  bucket: AgingBucket;
  invoiceCount: number;
  totalOutstanding: number;
  overdueAmount: number;
}

export interface CreateAccountingPeriodInput {
  name: string;
  periodYear: number;
  periodMonth: number;
  startDate: string;
  endDate: string;
}

export interface CreateGlAccountInput {
  code: string;
  name: string;
  type: GlAccountType;
  description?: string;
}
