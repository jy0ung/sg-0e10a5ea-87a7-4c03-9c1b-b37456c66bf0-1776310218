// ===== User & Auth =====
export type AppRole = 'super_admin' | 'company_admin' | 'director' | 'general_manager' | 'manager' | 'sales' | 'accounts' | 'analyst';
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

export type SalesOrderStatus = 'active' | 'won' | 'lost';

export interface SalesOrder {
  id: string;
  customerId?: string;
  customerName?: string;       // joined from customers table
  salesmanName: string;
  branchCode: string;
  model: string;
  variant?: string;
  color?: string;
  bookingAmount?: number;
  discount?: number;
  sellingPrice?: number;
  paymentMethod?: string;
  stageId?: string;
  stageName?: string;          // joined from deal_stages
  stageColor?: string;
  bookingDate: string;
  expectedDeliveryDate?: string;
  notes?: string;
  chassisNo?: string;          // set when linked to a vehicle BG entry
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Invoice {
  id: string;
  salesOrderId: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  paymentStatus: InvoicePaymentStatus;
  paidAmount: number;
  dueDate?: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
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
