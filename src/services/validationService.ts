import { supabase } from "@/integrations/supabase/client";
import { loggingService } from "./loggingService";
import { performanceService } from "./performanceService";
import type { ValidationError } from "@/types";

// Allowed values for enum fields
const ALLOWED_STATUSES = ['uploaded', 'validated', 'failed', 'publish_in_progress', 'published'] as const;
type ImportBatchStatus = typeof ALLOWED_STATUSES[number];

const ALLOWED_SEVERITIES = ['info', 'warning', 'error'] as const;
type QualityIssueSeverity = typeof ALLOWED_SEVERITIES[number];

const ALLOWED_ISSUE_TYPES = ['missing', 'duplicate', 'negative', 'invalid', 'format'] as const;
type QualityIssueType = typeof ALLOWED_ISSUE_TYPES[number];

// Reference data cache
const branchesCache: string[] = [];
const modelsCache: string[] = [];
const paymentMethodsCache: string[] = [];
const cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const DATE_FIELD_NAMES = [
  'bg_date', 'shipment_etd_pkg', 'shipment_eta_kk_twu_sdk',
  'date_received_by_outlet', 'reg_date', 'delivery_date',
  'disb_date', 'vaa_date', 'full_payment_date',
];

const REQUIRED_FIELDS = [
  'chassis_no', 'branch_code', 'model', 'customer_name', 'salesman_name', 'payment_method',
];

const VALID_PAYMENT_METHODS = ['cash', 'loan', 'hire purchase', 'hp', 'bank loan', 'leasing'];

/**
 * Synchronous per-row validation — no DB calls.
 * Requires pre-fetched reference sets from validateVehicleImportBatch.
 */
export function validateVehicleRowSync(
  row: Record<string, unknown>,
  rowNumber: number,
  existingChassisSet: Set<string>,
  knownBranchSet: Set<string>,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Required fields
  REQUIRED_FIELDS.forEach(field => {
    const value = row[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      errors.push({ field, message: `Row ${rowNumber}: ${field} is required`, code: 'REQUIRED_FIELD_MISSING', severity: 'error', rowNumber });
    }
  });

  // Chassis number validation
  if (row.chassis_no) {
    const chassis = String(row.chassis_no).trim();
    if (chassis.length < 5) {
      errors.push({ field: 'chassis_no', message: `Row ${rowNumber}: Chassis number is too short (min 5 characters)`, code: 'CHASSIS_TOO_SHORT', severity: 'error', rowNumber });
    } else if (existingChassisSet.has(chassis)) {
      errors.push({ field: 'chassis_no', message: `Row ${rowNumber}: Chassis ${chassis} already exists in database`, code: 'DUPLICATE_CHASSIS', severity: 'error', rowNumber });
    }
  }

  // Branch code validation against pre-fetched set
  if (row.branch_code) {
    const code = String(row.branch_code).toUpperCase();
    if (!knownBranchSet.has(code)) {
      errors.push({ field: 'branch_code', message: `Row ${rowNumber}: Branch code '${row.branch_code}' does not exist`, code: 'INVALID_BRANCH_CODE', severity: 'error', rowNumber });
    }
  }

  // Date field validation
  const parsedDates: Record<string, Date | null> = {};
  DATE_FIELD_NAMES.forEach(field => {
    const value = row[field];
    if (value && typeof value === 'string' && value.trim() !== '') {
      const date = parseDate(value);
      if (!date) {
        errors.push({ field, message: `Row ${rowNumber}: ${field} has invalid date format`, code: 'INVALID_DATE_FORMAT', severity: 'error', rowNumber });
      } else {
        parsedDates[field] = date;
      }
    }
  });

  // Date order
  if (parsedDates.bg_date && parsedDates.shipment_etd_pkg && parsedDates.shipment_etd_pkg < parsedDates.bg_date) {
    warnings.push({ field: 'shipment_etd_pkg', message: `Row ${rowNumber}: Shipment ETD is before BG date (likely incorrect)`, code: 'DATE_ORDER_WARNING', severity: 'warning', rowNumber });
  }

  // Numeric field
  if (row.dealer_transfer_price) {
    const price = parseFloat(String(row.dealer_transfer_price));
    if (isNaN(price)) {
      errors.push({ field: 'dealer_transfer_price', message: `Row ${rowNumber}: Dealer transfer price must be a valid number`, code: 'INVALID_NUMBER', severity: 'error', rowNumber });
    }
  }

  // Payment method
  if (row.payment_method) {
    const paymentMethod = String(row.payment_method).trim().toLowerCase();
    if (!VALID_PAYMENT_METHODS.some(vm => paymentMethod.includes(vm))) {
      warnings.push({ field: 'payment_method', message: `Row ${rowNumber}: Unusual payment method '${row.payment_method}'`, code: 'UNUSUAL_PAYMENT_METHOD', severity: 'warning', rowNumber });
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Validate a single vehicle row against schema and business rules.
 * Fetches reference data itself — use validateVehicleImportBatch for bulk imports.
 */
export async function validateVehicleRow(
  row: Record<string, unknown>,
  companyId: string,
  rowNumber: number
): Promise<ValidationResult> {
  const chassis = row.chassis_no ? String(row.chassis_no).trim() : '';
  const branchCode = row.branch_code ? String(row.branch_code).toUpperCase() : '';

  const [chassisResult, branchesResult] = await Promise.all([
    chassis.length >= 5
      ? supabase.from('vehicles').select('chassis_no').eq('chassis_no', chassis).eq('company_id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    branchCode
      ? supabase.from('branches').select('code').eq('company_id', companyId)
      : Promise.resolve({ data: [] }),
  ]);

  const existingChassisSet = new Set<string>(chassisResult.data ? [chassis] : []);
  const knownBranchSet = new Set<string>((branchesResult.data ?? []).map((b: { code: string }) => b.code.toUpperCase()));

  return validateVehicleRowSync(row, rowNumber, existingChassisSet, knownBranchSet);
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
 * Validate an entire import batch of vehicles.
 * Pre-fetches all reference data in 2 parallel queries, then validates every
 * row synchronously — O(2) DB round-trips regardless of batch size.
 */
export async function validateVehicleImportBatch(
  rows: Record<string, unknown>[],
  companyId: string,
  onProgress?: (processed: number, total: number) => void
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
  const qid = `batch-validate-${Date.now()}`;
  performanceService.startQueryTimer(qid);

  // Collect unique chassis numbers that are long enough to be real
  const uniqueChassis = [...new Set(
    rows.map(r => String(r.chassis_no ?? '').trim()).filter(c => c.length >= 5)
  )];

  // 2 parallel queries: existing chassis + all company branch codes
  const [chassisResult, branchesResult] = await Promise.all([
    uniqueChassis.length > 0
      ? supabase.from('vehicles').select('chassis_no').eq('company_id', companyId).in('chassis_no', uniqueChassis)
      : Promise.resolve({ data: [] as { chassis_no: string }[], error: null }),
    supabase.from('branches').select('code').eq('company_id', companyId),
  ]);

  const existingChassisSet = new Set<string>((chassisResult.data ?? []).map(v => v.chassis_no));
  const knownBranchSet = new Set<string>((branchesResult.data ?? []).map((b: { code: string }) => b.code.toUpperCase()));

  performanceService.endQueryTimer(qid, 'batch_validate_prefetch');

  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  onProgress?.(0, rows.length);
  for (let i = 0; i < rows.length; i++) {
    const result = validateVehicleRowSync(rows[i], i + 1, existingChassisSet, knownBranchSet);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
    if ((i + 1) % 50 === 0 || i === rows.length - 1) onProgress?.(i + 1, rows.length);
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