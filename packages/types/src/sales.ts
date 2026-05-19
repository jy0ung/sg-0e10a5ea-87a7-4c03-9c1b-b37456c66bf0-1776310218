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
  invoiceType: InvoiceType;
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

// ===== Accounts Payable =====
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
