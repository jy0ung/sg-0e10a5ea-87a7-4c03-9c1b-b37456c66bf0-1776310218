// ===== Vehicle =====
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
  commission_paid?: boolean;
  commission_remark?: string;
  stage?: VehicleStage | null;
  stage_override?: VehicleStage | null;
  bg_to_delivery?: number | null;
  bg_to_shipment_etd?: number | null;
  etd_to_outlet?: number | null;
  outlet_to_reg?: number | null;
  reg_to_delivery?: number | null;
  bg_to_disb?: number | null;
  delivery_to_disb?: number | null;
  is_incomplete?: boolean;
  pending_fields?: string[];
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
