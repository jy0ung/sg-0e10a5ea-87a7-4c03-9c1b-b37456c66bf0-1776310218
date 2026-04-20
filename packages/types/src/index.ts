// ===== User & Auth =====
export type AppRole = 'super_admin' | 'company_admin' | 'director' | 'general_manager' | 'manager' | 'sales' | 'accounts' | 'analyst' | 'creator_updater';
export type AccessScope = 'self' | 'branch' | 'company' | 'global';

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
export type EmployeeStatus = 'active' | 'inactive' | 'resigned';

export interface Employee {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  branchId?: string;
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
}

// ===== HRMS — Leave =====
export interface LeaveType {
  id: string;
  companyId: string;
  name: string;
  code: string;
  daysPerYear: number;
  isPaid: boolean;
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
  reason?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveRequestInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
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
  isPaid: boolean;
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

// ===== HRMS — Approval Flows =====
export type ApproverType = 'role' | 'specific_user' | 'direct_manager';
export type FlowEntityType = 'leave_request' | 'payroll_run' | 'appraisal' | 'general';

export interface ApprovalStep {
  id: string;
  flowId: string;
  stepOrder: number;
  name: string;
  approverType: ApproverType;
  approverRole?: string;
  approverUserId?: string;
  approverUserName?: string;
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
  steps: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalFlowInput {
  name: string;
  description?: string;
  entityType: FlowEntityType;
  isActive: boolean;
  steps: Omit<ApprovalStep, 'id' | 'flowId' | 'approverUserName'>[];
}
export type UpdateApprovalFlowInput = CreateApprovalFlowInput;

// ===== Import Pipeline =====
export type ImportStatus = 'uploaded' | 'validating' | 'validated' | 'normalization_in_progress' | 'normalization_complete' | 'publish_in_progress' | 'published' | 'failed';

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
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
  rowNumber?: number;
}

// ===== Vehicle =====
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
  dealer_transfer_price?: string;
  full_payment_type?: string;
  shipment_name?: string;
  lou?: string;
  contra_sola?: string;
  reg_no?: string;
  invoice_no?: string;
  obr?: string;
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
  is_d2d: boolean;
  import_batch_id: string;
  source_row_id: string;
  // Optional fields
  variant?: string;
  dealer_transfer_price?: string;
  full_payment_type?: string;
  shipment_name?: string;
  lou?: string;
  contra_sola?: string;
  reg_no?: string;
  invoice_no?: string;
  obr?: string;
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
}

// ===== SLA =====
export interface SlaPolicy {
  id: string;
  kpiId: string;
  label: string;
  slaDays: number;
  companyId: string;
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
