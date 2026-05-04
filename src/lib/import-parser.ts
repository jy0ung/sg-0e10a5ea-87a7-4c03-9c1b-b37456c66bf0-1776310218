import { VehicleRaw, DataQualityIssue, VehicleCanonical } from '@/types';
import { normalizeSupportedDateValue, parseSupportedDateString } from '@/lib/dateParsing';
import { normalizeImportNumericText } from '@/lib/importNumeric';
import { loggingService } from '@/services/loggingService';
import { deriveVehicleStage } from '@/utils/vehicleStage';
import { loadExcelJS } from '@/lib/exceljs-loader';

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .toUpperCase();
}

const HEADER_ALIAS_MAP: Record<string, keyof VehicleRaw> = {
  'CHASSIS NO.': 'chassis_no',
  'CHASSIS NO': 'chassis_no',
  'BG DATE': 'bg_date',
  'SHIPMENT ETD PKG': 'shipment_etd_pkg',
  'SHIPMENT ETA KK/TWU/SDK': 'shipment_eta_kk_twu_sdk',
  'DATE SHIPMENT ETA KK/TWU/SDK': 'shipment_eta_kk_twu_sdk',
  'SHIPMENT ETA': 'shipment_eta_kk_twu_sdk',
  'DATE RECEIVED BY OUTLET': 'date_received_by_outlet',
  'RECEIVED BY OUTLET': 'date_received_by_outlet',
  'REG DATE': 'reg_date',
  'DELIVERY DATE': 'delivery_date',
  'DISB. DATE': 'disb_date',
  'DISB DATE': 'disb_date',
  'BRCH': 'branch_code',
  'BRCH K1': 'branch_code',
  'BRANCH': 'branch_code',
  'MODEL': 'model',
  'PAYMENT METHOD': 'payment_method',
  'SA NAME': 'salesman_name',
  'SALESMAN': 'salesman_name',
  'SALESMAN NAME': 'salesman_name',
  'CUST NAME': 'customer_name',
  'CUSTOMER NAME': 'customer_name',
  'REMARK': 'remark',
  'REMARKS': 'remark',
  'VAA DATE': 'vaa_date',
  'FULL PAYMENT DATE': 'full_payment_date',
  // Optional columns
  'NO.': 'source_row_no',
  'VAR': 'variant',
  'VARIANT': 'variant',
  'COLOR': 'color',
  'COLOUR': 'color',
  'DTP (DEALER TRANSFER PRICE)': 'dealer_transfer_price',
  'FULL PAYMENT TYPE': 'full_payment_type',
  'SHIPMENT NAME': 'shipment_name',
  'LOU': 'lou',
  'CONTRA SOLA': 'contra_sola',
  'REG NO': 'reg_no',
  'REG NO.': 'reg_no',
  'INV NO.': 'invoice_no',
  'INV NO': 'invoice_no',
  'OBR': 'obr',
};

/**
 * Headers from the new "auto aging (CHASSIS)" template that carry section
 * titles or pre-computed aging counters. We deliberately skip them during
 * import because they are either presentational or recomputed downstream;
 * listing them keeps the importer quiet about "unknown columns".
 */
const IGNORED_HEADERS = new Set<string>([
  '',
  'NO',
  '1. PENDING REGISTER & FREE STOCK',
  '2. PENDING DELIVER & LOAN DISBURSE',
  '3. COMPLETE',
  'STOCK IN',
  'DEPOSIT PAYMENT',
  'FULL PAYMENT',
  'OUTLET ADMIN',
  'SALES MANAGER',
  // Pre-computed aging counters — we derive these from dates ourselves.
  'DAYS SINCE BG',
  'DAYS SINCE ETD',
  'DAYS SINCE OUTLET',
  'DAYS SINCE REG',
  'DAYS SINCE DELIVERY',
  'AGING',
  'AGING DAYS',
]);

/** Regex that matches the variable "COMM PAYOUT (for disbursement ...)" header. */
const COMM_PAYOUT_HEADER = /^COMM\s*PAYOUT\b/;

const MIN_HEADER_HITS = 5;

/** Cues that a row is a visual section separator (no chassis) and should be skipped. */
const SECTION_LABEL_REGEX =
  /PENDING\s+REGISTER|PENDING\s+DELIVER|LOAN\s+DISBURSE|COMPLETE\b|FREE\s+STOCK|TEST\s+DRIVE|PRE[\s-]*REG(?:ISTER)?|STOCK\s+IN|DEPOSIT\s+PAYMENT|FULL\s+PAYMENT|OUTLET\s+ADMIN|SALES\s+MANAGER/i;

const REQUIRED_DB_COLUMNS: (keyof VehicleRaw)[] = [
  'chassis_no',
  'bg_date',
  'shipment_etd_pkg',
  'date_received_by_outlet',
  'reg_date',
  'delivery_date',
  'disb_date',
  'branch_code',
  'model',
  'payment_method',
];

const DATE_FIELDS = new Set<keyof VehicleRaw>([
  'bg_date', 'shipment_etd_pkg', 'shipment_eta_kk_twu_sdk',
  'date_received_by_outlet', 'delivery_date', 'disb_date',
  'vaa_date', 'full_payment_date', 'reg_date',
]);

const CODE_FIELDS = new Set<keyof VehicleRaw>([
  'chassis_no', 'branch_code', 'lou', 'contra_sola', 'reg_no', 'invoice_no', 'obr',
]);

const PAYMENT_METHOD_CANONICAL: Record<string, string> = {
  cash: 'Cash',
  loan: 'Loan',
  'hire purchase': 'Hire Purchase',
  hp: 'HP',
  'bank loan': 'Bank Loan',
  leasing: 'Leasing',
  credit: 'Credit',
};

export type NormalizedCell = {
  value?: string | boolean;
  invalid?: boolean;
};

function collapseWhitespace(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const text = String(raw).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text ? text : undefined;
}

function buildUtcDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return date.toISOString().split('T')[0];
}

function normalizeDateCell(raw: unknown): NormalizedCell {
  if (raw === null || raw === undefined) return {};

  if (typeof raw === 'number') {
    try {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed?.y && parsed.m && parsed.d) {
        return { value: buildUtcDate(parsed.y, parsed.m, parsed.d) };
      }
    } catch {
      return {};
    }
    return {};
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return { value: raw.toISOString().split('T')[0] };
  }

  if (typeof raw !== 'string') {
    const text = collapseWhitespace(raw);
    return text ? { value: text, invalid: true } : {};
  }

  const trimmed = collapseWhitespace(raw);
  if (!trimmed) return {};

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const value = buildUtcDate(year, month, day);
    return value ? { value } : { value: trimmed, invalid: true };
  }

  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotMatch) {
    const day = Number(dotMatch[1]);
    const month = Number(dotMatch[2]);
    let year = Number(dotMatch[3]);
    if (year < 100) {
      year += year > 50 ? 1900 : 2000;
    }
    const value = buildUtcDate(year, month, day);
    return value ? { value } : { value: trimmed, invalid: true };
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) {
      year += year > 50 ? 1900 : 2000;
    }
    const value = buildUtcDate(year, month, day);
    return value ? { value } : { value: trimmed, invalid: true };
  }

  return { value: trimmed, invalid: true };
}

function normalizeTextCell(raw: unknown): NormalizedCell {
  const text = collapseWhitespace(raw);
  return text ? { value: text } : {};
}

function normalizeCodeCell(raw: unknown): NormalizedCell {
  const text = collapseWhitespace(raw);
  return text ? { value: text.toUpperCase().replace(/\s+/g, '') } : {};
}

function normalizePaymentMethodCell(raw: unknown): NormalizedCell {
  const text = collapseWhitespace(raw);
  if (!text) return {};

  const canonical = PAYMENT_METHOD_CANONICAL[text.toLowerCase()];
  return { value: canonical ?? text };
}

function normalizeNumericCell(raw: unknown): NormalizedCell {
  const text = collapseWhitespace(raw);
  return text ? { value: text.replace(/,/g, '') } : {};
}

export function normalizeVehicleRawCell(field: keyof VehicleRaw, raw: unknown): NormalizedCell {
  if (DATE_FIELDS.has(field)) return normalizeDateCell(raw);
  if (field === 'payment_method') return normalizePaymentMethodCell(raw);
  if (field === 'dealer_transfer_price') return normalizeNumericCell(raw);
  if (CODE_FIELDS.has(field)) return normalizeCodeCell(raw);
  if (field === 'is_d2d') return { value: Boolean(raw) };
  return normalizeTextCell(raw);
}

export function normalizeVehicleRawRow(row: Partial<VehicleRaw>): VehicleRaw {
  const normalizedRemark = normalizeTextCell(row.remark).value;

  return {
    id: String(row.id ?? ''),
    import_batch_id: String(row.import_batch_id ?? ''),
    row_number: Number(row.row_number ?? 0),
    chassis_no: String(normalizeVehicleRawCell('chassis_no', row.chassis_no).value ?? ''),
    bg_date: String(normalizeVehicleRawCell('bg_date', row.bg_date).value ?? '') || undefined,
    shipment_etd_pkg: String(normalizeVehicleRawCell('shipment_etd_pkg', row.shipment_etd_pkg).value ?? '') || undefined,
    shipment_eta_kk_twu_sdk: String(normalizeVehicleRawCell('shipment_eta_kk_twu_sdk', row.shipment_eta_kk_twu_sdk).value ?? '') || undefined,
    date_received_by_outlet: String(normalizeVehicleRawCell('date_received_by_outlet', row.date_received_by_outlet).value ?? '') || undefined,
    reg_date: String(normalizeVehicleRawCell('reg_date', row.reg_date).value ?? '') || undefined,
    delivery_date: String(normalizeVehicleRawCell('delivery_date', row.delivery_date).value ?? '') || undefined,
    disb_date: String(normalizeVehicleRawCell('disb_date', row.disb_date).value ?? '') || undefined,
    branch_code: normalizeVehicleRawCell('branch_code', row.branch_code).value ? String(normalizeVehicleRawCell('branch_code', row.branch_code).value) : undefined,
    model: normalizeVehicleRawCell('model', row.model).value ? String(normalizeVehicleRawCell('model', row.model).value) : undefined,
    payment_method: normalizeVehicleRawCell('payment_method', row.payment_method).value ? String(normalizeVehicleRawCell('payment_method', row.payment_method).value) : undefined,
    salesman_name: normalizeVehicleRawCell('salesman_name', row.salesman_name).value ? String(normalizeVehicleRawCell('salesman_name', row.salesman_name).value) : undefined,
    customer_name: normalizeVehicleRawCell('customer_name', row.customer_name).value ? String(normalizeVehicleRawCell('customer_name', row.customer_name).value) : undefined,
    remark: normalizedRemark ? String(normalizedRemark) : undefined,
    vaa_date: String(normalizeVehicleRawCell('vaa_date', row.vaa_date).value ?? '') || undefined,
    full_payment_date: String(normalizeVehicleRawCell('full_payment_date', row.full_payment_date).value ?? '') || undefined,
    is_d2d: Boolean(normalizedRemark && (normalizedRemark.toLowerCase().includes('d2d') || normalizedRemark.toLowerCase().includes('transfer'))),
    source_row_no: normalizeVehicleRawCell('source_row_no', row.source_row_no).value ? String(normalizeVehicleRawCell('source_row_no', row.source_row_no).value) : undefined,
    variant: normalizeVehicleRawCell('variant', row.variant).value ? String(normalizeVehicleRawCell('variant', row.variant).value) : undefined,
    dealer_transfer_price: normalizeVehicleRawCell('dealer_transfer_price', row.dealer_transfer_price).value ? String(normalizeVehicleRawCell('dealer_transfer_price', row.dealer_transfer_price).value) : undefined,
    full_payment_type: normalizeVehicleRawCell('full_payment_type', row.full_payment_type).value ? String(normalizeVehicleRawCell('full_payment_type', row.full_payment_type).value) : undefined,
    shipment_name: normalizeVehicleRawCell('shipment_name', row.shipment_name).value ? String(normalizeVehicleRawCell('shipment_name', row.shipment_name).value) : undefined,
    lou: normalizeVehicleRawCell('lou', row.lou).value ? String(normalizeVehicleRawCell('lou', row.lou).value) : undefined,
    contra_sola: normalizeVehicleRawCell('contra_sola', row.contra_sola).value ? String(normalizeVehicleRawCell('contra_sola', row.contra_sola).value) : undefined,
    reg_no: normalizeVehicleRawCell('reg_no', row.reg_no).value ? String(normalizeVehicleRawCell('reg_no', row.reg_no).value) : undefined,
    invoice_no: normalizeVehicleRawCell('invoice_no', row.invoice_no).value ? String(normalizeVehicleRawCell('invoice_no', row.invoice_no).value) : undefined,
    obr: normalizeVehicleRawCell('obr', row.obr).value ? String(normalizeVehicleRawCell('obr', row.obr).value) : undefined,
  };
}

export function parseExcelDate(val: unknown): string | undefined {
  const normalized = normalizeDateCell(val);
  return normalized.value ? String(normalized.value) : undefined;
}

export async function parseWorkbook(file: ArrayBuffer): Promise<{ rows: VehicleRaw[]; issues: DataQualityIssue[]; missingColumns: string[] }> {
  try {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file);

    if (!wb.worksheets || wb.worksheets.length === 0) {
      return { rows: [], issues: [], missingColumns: ['No sheets found in workbook'] };
    }

    const rows: VehicleRaw[] = [];
    const issues: DataQualityIssue[] = [];
    const batchId = `import-${Date.now()}`;

    const mappedDbColumns = new Set<keyof VehicleRaw>();
    let parsedSheetCount = 0;

    for (const [sheetIndex, ws] of wb.worksheets.entries()) {
      // Pull each worksheet as a 2D grid so we can locate the header row.
      const grid: unknown[][] = [];
      ws.eachRow({ includeEmpty: true }, (row) => {
        const values = row.values as unknown[];
        grid.push(values.slice(1).map(value => value ?? ''));
      });

      if (grid.length === 0) {
        continue;
      }

      let headerRowIdx = 0;
      let bestHits = -1;
      const scanLimit = Math.min(10, grid.length);
      for (let i = 0; i < scanLimit; i++) {
        const row = grid[i] ?? [];
        let hits = 0;
        for (const cell of row) {
          const norm = normalizeHeader(cell);
          if (HEADER_ALIAS_MAP[norm] || COMM_PAYOUT_HEADER.test(norm)) hits++;
        }
        if (hits > bestHits) {
          bestHits = hits;
          headerRowIdx = i;
        }
      }

      if (bestHits < MIN_HEADER_HITS) {
        continue;
      }

      const headerCells = (grid[headerRowIdx] ?? []).map(c => normalizeHeader(c));
      const columnMapping = new Map<number, keyof VehicleRaw | 'COMM_PAYOUT'>();
      headerCells.forEach((norm, colIdx) => {
        if (!norm || IGNORED_HEADERS.has(norm)) return;
        if (COMM_PAYOUT_HEADER.test(norm)) {
          columnMapping.set(colIdx, 'COMM_PAYOUT');
          return;
        }
        const key = HEADER_ALIAS_MAP[norm];
        if (key) columnMapping.set(colIdx, key);
      });

      const sheetMappedColumns = new Set(
        Array.from(columnMapping.values()).filter((value): value is keyof VehicleRaw => value !== 'COMM_PAYOUT'),
      );
      if (sheetMappedColumns.size === 0 && !Array.from(columnMapping.values()).includes('COMM_PAYOUT')) {
        continue;
      }

      parsedSheetCount++;
      sheetMappedColumns.forEach(column => mappedDbColumns.add(column));

      const chassisColIdx = Array.from(columnMapping.entries())
        .find(([, value]) => value === 'chassis_no')?.[0];

      for (let rIdx = headerRowIdx + 1; rIdx < grid.length; rIdx++) {
        const row = grid[rIdx] ?? [];
        const rowNumber = rIdx + 1;

        const hasAnyValue = row.some(c => c !== '' && c !== null && c !== undefined);
        if (!hasAnyValue) continue;

        const chassisVal = chassisColIdx !== undefined ? row[chassisColIdx] : undefined;
        const hasChassis = chassisVal !== undefined && String(chassisVal).trim() !== '';
        if (!hasChassis) {
          const looksLikeSection = row.some(c => {
            if (c === '' || c === null || c === undefined) return false;
            return SECTION_LABEL_REGEX.test(String(c));
          });
          if (looksLikeSection) continue;
        }

        const vehicle: Partial<VehicleRaw> = {
          id: `raw-${sheetIndex}-${rIdx}`,
          import_batch_id: batchId,
          row_number: rowNumber,
        };

        columnMapping.forEach((dbColumn, colIdx) => {
          const val = row[colIdx];
          if (dbColumn === 'COMM_PAYOUT') {
            const parsed = parseCommPayout(val);
            if (parsed.remark !== undefined) vehicle.commission_remark = parsed.remark;
            if (parsed.paid !== undefined) vehicle.commission_paid = parsed.paid;
            return;
          }
          if (DATE_FIELDS.has(dbColumn)) {
            (vehicle as Record<string, unknown>)[dbColumn] = parseExcelDate(val);
          } else {
            (vehicle as Record<string, unknown>)[dbColumn] = val !== undefined && val !== null && val !== ''
              ? String(val).trim()
              : undefined;
          }
        });

        if (!vehicle.chassis_no) {
          issues.push({
            id: `iss-${sheetIndex}-${rIdx}-chassis`,
            chassisNo: '',
            field: 'chassis_no',
            issueType: 'missing',
            message: `Sheet ${ws.name} row ${rowNumber}: Missing chassis number`,
            severity: 'error',
            importBatchId: batchId,
          });
        }

        vehicle.is_d2d = vehicle.remark?.toLowerCase().includes('d2d')
          || vehicle.remark?.toLowerCase().includes('transfer')
          || false;
        rows.push(vehicle as VehicleRaw);
      }
    }

    if (parsedSheetCount === 0) {
      return { rows: [], issues: [], missingColumns: ['No supported data sheets found in workbook'] };
    }

    const missingColumns = REQUIRED_DB_COLUMNS.filter(rc => !mappedDbColumns.has(rc));

    const chassisCount = new Map<string, number>();
    rows.forEach(r => {
      if (r.chassis_no) {
        chassisCount.set(r.chassis_no, (chassisCount.get(r.chassis_no) || 0) + 1);
      }
    });

    chassisCount.forEach((count, chassis) => {
      if (count > 1) {
        issues.push({
          id: `iss-dup-${chassis}`,
          chassisNo: chassis,
          field: 'chassis_no',
          issueType: 'duplicate',
          message: `Chassis ${chassis} appears ${count} times`,
          severity: 'warning',
          importBatchId: batchId,
        });
      }
    });

    return { rows, issues, missingColumns };
  } catch (error) {
    loggingService.error('Error parsing workbook', { error }, 'ImportParser');
    return {
      rows: [],
      issues: [],
      missingColumns: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

export function publishCanonical(
  rows: VehicleRaw[],
  branchMap?: Map<string, string>,
  paymentMap?: Map<string, string>,
  nameToIdMap?: Map<string, string>,
): { canonical: VehicleCanonical[]; issues: DataQualityIssue[] } {
  try {
    const grouped = new Map<string, VehicleRaw[]>();
    rows.filter(r => r.chassis_no).forEach(r => {
      const arr = grouped.get(r.chassis_no) || [];
      arr.push(r);
      grouped.set(r.chassis_no, arr);
    });

    const canonical: VehicleCanonical[] = [];
    const issues: DataQualityIssue[] = [];

    grouped.forEach((group, chassis) => {
      const best = group.sort((a, b) => {
        const countFields = (v: VehicleRaw) => Object.values(v).filter(x => x !== undefined && x !== '').length;
        return countFields(b) - countFields(a);
      })[0];

      const normalizedDates = {
        bg_date: normalizeSupportedDateValue(best.bg_date),
        shipment_etd_pkg: normalizeSupportedDateValue(best.shipment_etd_pkg),
        shipment_eta_kk_twu_sdk: normalizeSupportedDateValue(best.shipment_eta_kk_twu_sdk),
        date_received_by_outlet: normalizeSupportedDateValue(best.date_received_by_outlet),
        reg_date: normalizeSupportedDateValue(best.reg_date),
        delivery_date: normalizeSupportedDateValue(best.delivery_date),
        disb_date: normalizeSupportedDateValue(best.disb_date),
        vaa_date: normalizeSupportedDateValue(best.vaa_date),
        full_payment_date: normalizeSupportedDateValue(best.full_payment_date),
      };

      const diffDays = (from?: string, to?: string): number | null => {
        if (!from || !to) return null;
        const fromDate = parseSupportedDateString(from);
        const toDate = parseSupportedDateString(to);
        if (!fromDate || !toDate) {
          return null;
        }
        const diff = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
        return isNaN(diff) ? null : diff;
      };

      const normalizedBranchCode = best.branch_code?.trim();
      const resolvedBranchCode = (branchMap && normalizedBranchCode
        ? (branchMap.get(normalizedBranchCode.toUpperCase()) ?? normalizedBranchCode)
        : normalizedBranchCode) || undefined;

      // Detect fields that are genuinely missing (need real-world data to complete)
      const pendingFields: string[] = [];
      if (!best.salesman_name) pendingFields.push('salesman_name');
      if (!best.customer_name) pendingFields.push('customer_name');
      if (!best.model) pendingFields.push('model');
      if (!best.payment_method) pendingFields.push('payment_method');
      if (!resolvedBranchCode) pendingFields.push('branch_code');

      const v: VehicleCanonical = {
        id: `canon-${chassis}`,
        chassis_no: chassis,
        bg_date: normalizedDates.bg_date,
        shipment_etd_pkg: normalizedDates.shipment_etd_pkg,
        shipment_eta_kk_twu_sdk: normalizedDates.shipment_eta_kk_twu_sdk,
        date_received_by_outlet: normalizedDates.date_received_by_outlet,
        reg_date: normalizedDates.reg_date,
        delivery_date: normalizedDates.delivery_date,
        disb_date: normalizedDates.disb_date,
        branch_code: resolvedBranchCode || 'Unknown',
        model: best.model || 'Unknown',
        payment_method: (paymentMap && best.payment_method?.trim()
          ? (paymentMap.get(best.payment_method.trim().toUpperCase()) ?? best.payment_method.trim())
          : best.payment_method?.trim()) || 'Unknown',
        salesman_name: best.salesman_name || 'Pending',
        customer_name: best.customer_name || 'Pending',
        remark: best.remark,
        vaa_date: normalizedDates.vaa_date,
        full_payment_date: normalizedDates.full_payment_date,
        is_d2d: best.is_d2d || false,
        import_batch_id: best.import_batch_id,
        source_row_id: best.id,
        variant: best.variant,
        color: best.color,
        dealer_transfer_price: normalizeImportNumericText(best.dealer_transfer_price),
        full_payment_type: best.full_payment_type,
        shipment_name: best.shipment_name,
        lou: best.lou,
        contra_sola: best.contra_sola,
        reg_no: best.reg_no,
        invoice_no: best.invoice_no,
        obr: best.obr,
        commission_paid: best.commission_paid,
        commission_remark: best.commission_remark,
        // New flow: BG → ETD → Outlet → Reg → Delivery → Disb
        bg_to_delivery: diffDays(normalizedDates.bg_date, normalizedDates.delivery_date),
        bg_to_shipment_etd: diffDays(normalizedDates.bg_date, normalizedDates.shipment_etd_pkg),
        etd_to_outlet: diffDays(normalizedDates.shipment_etd_pkg, normalizedDates.date_received_by_outlet),
        outlet_to_reg: diffDays(normalizedDates.date_received_by_outlet, normalizedDates.reg_date),
        reg_to_delivery: diffDays(normalizedDates.reg_date, normalizedDates.delivery_date),
        bg_to_disb: diffDays(normalizedDates.bg_date, normalizedDates.disb_date),
        delivery_to_disb: diffDays(normalizedDates.delivery_date, normalizedDates.disb_date),
        is_incomplete: pendingFields.length > 0,
        pending_fields: pendingFields.length > 0 ? pendingFields : undefined,
        salesman_id: (nameToIdMap && best.salesman_name)
          ? (nameToIdMap.get(best.salesman_name) ?? null)
          : null,
      };

      // Derive stage from the canonical date set so the dashboard pipeline
      // has a value even before the DB trigger fires on insert.
      v.stage = deriveVehicleStage(v);

      const kpiFields = [
        ['bg_to_delivery', 'BG→Delivery'], ['bg_to_shipment_etd', 'BG→ETD'], ['etd_to_outlet', 'ETD→Outlet'],
        ['outlet_to_reg', 'Outlet→Reg'], ['reg_to_delivery', 'Reg→Delivery'],
        ['bg_to_disb', 'BG→Disb'], ['delivery_to_disb', 'Delivery→Disb'],
      ] as const;

      kpiFields.forEach(([field, label]) => {
        const val = v[field];
        if (val !== null && val !== undefined && val < 0) {
          issues.push({ 
            id: `neg-${chassis}-${field}`, 
            chassisNo: chassis, 
            field, 
            issueType: 'negative', 
            message: `${label} is negative (${val} days)`, 
            severity: 'error', 
            importBatchId: best.import_batch_id 
          });
        }
      });

      canonical.push(v);
    });

    return { canonical, issues };
  } catch (error) {
    loggingService.error('Error publishing canonical', { error }, 'ImportParser');
    return { canonical: [], issues: [] };
  }
}
