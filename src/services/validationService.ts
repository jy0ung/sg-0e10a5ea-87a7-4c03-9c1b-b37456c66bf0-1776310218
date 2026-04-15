import { supabase } from "@/integrations/supabase/client";
import { loggingService } from "./loggingService";
import { performanceService } from "./performanceService";

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Allowed values for enum fields
const ALLOWED_STATUSES = ['uploaded', 'validated', 'failed', 'publish_in_progress', 'published'] as const;
type ImportBatchStatus = typeof ALLOWED_STATUSES[number];

const ALLOWED_SEVERITIES = ['info', 'warning', 'error'] as const;
type QualityIssueSeverity = typeof ALLOWED_SEVERITIES[number];

const ALLOWED_ISSUE_TYPES = ['missing', 'duplicate', 'negative', 'invalid', 'format'] as const;
type QualityIssueType = typeof ALLOWED_ISSUE_TYPES[number];

/**
 * Validate a vehicle row against schema and business rules
 */
export async function validateVehicleRow(
  row: Record<string, unknown>,
  companyId: string,
  rowNumber: number
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Required fields
  const requiredFields = [
    'chassis_no',
    'branch_code',
    'model',
    'customer_name',
    'salesman_name',
    'payment_method',
  ];

  requiredFields.forEach(field => {
    const value = row[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      errors.push({
        field,
        message: `Row ${rowNumber}: ${field} is required`,
        code: 'REQUIRED_FIELD_MISSING',
        severity: 'error',
      });
    }
  });

  // Chassis number validation
  if (row.chassis_no) {
    const chassis = String(row.chassis_no).trim();
    if (chassis.length < 5) {
      errors.push({
        field: 'chassis_no',
        message: `Row ${rowNumber}: Chassis number is too short (min 5 characters)`,
        code: 'CHASSIS_TOO_SHORT',
        severity: 'error',
      });
    }
    
    // Check for duplicate chassis in database
    const { data: existingVehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('chassis_no', chassis)
      .eq('company_id', companyId)
      .maybeSingle();

    if (existingVehicle) {
      errors.push({
        field: 'chassis_no',
        message: `Row ${rowNumber}: Chassis ${chassis} already exists in database`,
        code: 'DUPLICATE_CHASSIS',
        severity: 'error',
      });
    }
  }

  // Branch code validation (reference data check)
  if (row.branch_code) {
    const queryId = `validate-branch-${row.branch_code}`;
    performanceService.startQueryTimer(queryId);
    
    const { data: branch } = await supabase
      .from('branches')
      .select('id, code')
      .eq('code', String(row.branch_code))
      .eq('company_id', companyId)
      .maybeSingle();

    performanceService.endQueryTimer(queryId, "validate_branch_code");

    if (!branch) {
      errors.push({
        field: 'branch_code',
        message: `Row ${rowNumber}: Branch code '${row.branch_code}' does not exist`,
        code: 'INVALID_BRANCH_CODE',
        severity: 'error',
      });
    }
  }

  // Date field validation
  const dateFields = [
    'bg_date',
    'shipment_etd_pkg',
    'shipment_eta_kk_twu_sdk',
    'date_received_by_outlet',
    'reg_date',
    'delivery_date',
    'disb_date',
    'vaa_date',
    'full_payment_date',
  ];

  const parsedDates: Record<string, Date | null> = {};

  dateFields.forEach(field => {
    const value = row[field];
    if (value && typeof value === 'string' && value.trim() !== '') {
      const date = parseDate(value);
      if (!date) {
        errors.push({
          field,
          message: `Row ${rowNumber}: ${field} has invalid date format`,
          code: 'INVALID_DATE_FORMAT',
          severity: 'error',
        });
      } else {
        parsedDates[field] = date;
      }
    }
  });

  // Business logic: dates should be in logical order
  if (parsedDates.bg_date && parsedDates.shipment_etd_pkg) {
    if (parsedDates.shipment_etd_pkg < parsedDates.bg_date) {
      warnings.push({
        field: 'shipment_etd_pkg',
        message: `Row ${rowNumber}: Shipment ETD is before BG date (likely incorrect)`,
        code: 'DATE_ORDER_WARNING',
        severity: 'warning',
      });
    }
  }

  // Numeric field validation
  if (row.dealer_transfer_price) {
    const price = parseFloat(String(row.dealer_transfer_price));
    if (isNaN(price)) {
      errors.push({
        field: 'dealer_transfer_price',
        message: `Row ${rowNumber}: Dealer transfer price must be a valid number`,
        code: 'INVALID_NUMBER',
        severity: 'error',
      });
    }
  }

  // Payment method validation (common values)
  if (row.payment_method) {
    const paymentMethod = String(row.payment_method).trim().toLowerCase();
    const validMethods = ['cash', 'loan', 'hire purchase', 'hp', 'bank loan', 'leasing'];
    if (!validMethods.some(vm => paymentMethod.includes(vm))) {
      warnings.push({
        field: 'payment_method',
        message: `Row ${rowNumber}: Unusual payment method '${row.payment_method}'`,
        code: 'UNUSUAL_PAYMENT_METHOD',
        severity: 'warning',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate import batch metadata
 */
export async function validateImportBatch(
  batch: {
    fileName?: string;
    companyId?: string;
    totalRows?: number;
    status?: string;
  }
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!batch.fileName || batch.fileName.trim() === '') {
    errors.push({
      field: 'file_name',
      message: 'File name is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  }

  if (!batch.companyId || batch.companyId.trim() === '') {
    errors.push({
      field: 'company_id',
      message: 'Company ID is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  } else {
    // Validate company exists
    const queryId = `validate-company-${batch.companyId}`;
    performanceService.startQueryTimer(queryId);
    
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', batch.companyId)
      .maybeSingle();

    performanceService.endQueryTimer(queryId, "validate_company_id");

    if (!company) {
      errors.push({
        field: 'company_id',
        message: `Company '${batch.companyId}' does not exist`,
        code: 'INVALID_COMPANY',
        severity: 'error',
      });
    }
  }

  if (batch.status && !ALLOWED_STATUSES.includes(batch.status as ImportBatchStatus)) {
    errors.push({
      field: 'status',
      message: `Invalid status '${batch.status}'. Must be one of: ${ALLOWED_STATUSES.join(', ')}`,
      code: 'INVALID_ENUM_VALUE',
      severity: 'error',
    });
  }

  if (batch.totalRows !== undefined && (batch.totalRows < 0 || !Number.isInteger(batch.totalRows))) {
    errors.push({
      field: 'total_rows',
      message: 'Total rows must be a non-negative integer',
      code: 'INVALID_NUMBER',
      severity: 'error',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate SLA policy
 */
export async function validateSlaPolicy(
  policy: {
    kpiId?: string;
    slaDays?: number;
    companyId?: string;
    label?: string;
  }
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!policy.kpiId || policy.kpiId.trim() === '') {
    errors.push({
      field: 'kpi_id',
      message: 'KPI ID is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  }

  if (!policy.label || policy.label.trim() === '') {
    errors.push({
      field: 'label',
      message: 'Label is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  }

  if (policy.slaDays === undefined || policy.slaDays === null) {
    errors.push({
      field: 'sla_days',
      message: 'SLA days is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  } else if (policy.slaDays < 1 || policy.slaDays > 365) {
    errors.push({
      field: 'sla_days',
      message: 'SLA days must be between 1 and 365',
      code: 'OUT_OF_RANGE',
      severity: 'error',
    });
  }

  if (!policy.companyId || policy.companyId.trim() === '') {
    errors.push({
      field: 'company_id',
      message: 'Company ID is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  } else {
    const queryId = `validate-company-${policy.companyId}`;
    performanceService.startQueryTimer(queryId);
    
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', policy.companyId)
      .maybeSingle();

    performanceService.endQueryTimer(queryId, "validate_sla_company");

    if (!company) {
      errors.push({
        field: 'company_id',
        message: `Company '${policy.companyId}' does not exist`,
        code: 'INVALID_COMPANY',
        severity: 'error',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate quality issue entry
 */
export function validateQualityIssue(
  issue: {
    chassisNo?: string;
    field?: string;
    issueType?: string;
    message?: string;
    severity?: string;
  }
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!issue.chassisNo || issue.chassisNo.trim() === '') {
    errors.push({
      field: 'chassis_no',
      message: 'Chassis number is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  }

  if (!issue.field || issue.field.trim() === '') {
    errors.push({
      field: 'field',
      message: 'Field name is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  }

  if (!issue.issueType || !ALLOWED_ISSUE_TYPES.includes(issue.issueType as QualityIssueType)) {
    errors.push({
      field: 'issue_type',
      message: `Invalid issue type. Must be one of: ${ALLOWED_ISSUE_TYPES.join(', ')}`,
      code: 'INVALID_ENUM_VALUE',
      severity: 'error',
    });
  }

  if (!issue.message || issue.message.trim() === '') {
    errors.push({
      field: 'message',
      message: 'Message is required',
      code: 'REQUIRED_FIELD_MISSING',
      severity: 'error',
    });
  }

  if (!issue.severity || !ALLOWED_SEVERITIES.includes(issue.severity as QualityIssueSeverity)) {
    errors.push({
      field: 'severity',
      message: `Invalid severity. Must be one of: ${ALLOWED_SEVERITIES.join(', ')}`,
      code: 'INVALID_ENUM_VALUE',
      severity: 'error',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Helper function to parse date strings
 */
function parseDate(value: string): Date | null {
  // Try ISO format first
  const isoDate = new Date(value);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try DD.MM.YYYY or DD.MM.YY
  const dotMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1]);
    const month = parseInt(dotMatch[2]) - 1;
    let year = parseInt(dotMatch[3]);
    if (year < 100) {
      year += year > 50 ? 1900 : 2000;
    }
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try DD/MM/YYYY or DD/MM/YY
  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1]);
    const month = parseInt(slashMatch[2]) - 1;
    let year = parseInt(slashMatch[3]);
    if (year < 100) {
      year += year > 50 ? 1900 : 2000;
    }
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

/**
 * Validate an entire import batch of vehicles
 */
export async function validateVehicleImportBatch(
  rows: Record<string, unknown>[],
  companyId: string
): Promise<{
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
  };
}> {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = await validateVehicleRow(row, companyId, i + 1);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  const summary = {
    totalRows: rows.length,
    validRows: rows.length - allErrors.length,
    errorRows: allErrors.length,
    warningRows: allWarnings.length,
  };

  loggingService.info("Vehicle import validation completed", summary, "ValidationService");

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    summary,
  };
}