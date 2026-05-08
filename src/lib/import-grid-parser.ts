import { type DataQualityIssue, type VehicleRaw } from '@/types';
import { normalizeVehicleRawCell } from '@/lib/import-normalization';

export const REQUIRED_DB_COLUMNS: (keyof VehicleRaw)[] = [
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
  'DAYS SINCE BG',
  'DAYS SINCE ETD',
  'DAYS SINCE OUTLET',
  'DAYS SINCE REG',
  'DAYS SINCE DELIVERY',
  'AGING',
  'AGING DAYS',
]);

const COMM_PAYOUT_HEADER = /^COMM\s*PAYOUT\b/;
const MIN_HEADER_HITS = 5;

const DATE_FIELDS = new Set<keyof VehicleRaw>([
  'bg_date', 'shipment_etd_pkg', 'shipment_eta_kk_twu_sdk',
  'date_received_by_outlet', 'delivery_date', 'disb_date',
  'vaa_date', 'full_payment_date', 'reg_date',
]);

const SECTION_LABEL_REGEX =
  /PENDING\s+REGISTER|PENDING\s+DELIVER|LOAN\s+DISBURSE|COMPLETE\b|FREE\s+STOCK|TEST\s+DRIVE|PRE[\s-]*REG(?:ISTER)?|STOCK\s+IN|DEPOSIT\s+PAYMENT|FULL\s+PAYMENT|OUTLET\s+ADMIN|SALES\s+MANAGER/i;

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .toUpperCase();
}

function parseExcelDate(value: unknown): string | undefined {
  const normalized = normalizeVehicleRawCell('bg_date', value);
  return normalized.value && !normalized.invalid ? String(normalized.value) : undefined;
}

function parseCommPayout(value: unknown): { paid?: boolean; remark?: string } {
  if (value === null || value === undefined || value === '') return {};
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { paid: true, remark: value.toISOString().slice(0, 10) };
  }
  if (typeof value === 'number') {
    return { paid: true, remark: String(value) };
  }

  const text = String(value).trim();
  if (!text) return {};
  const lower = text.toLowerCase();
  if (/\bnot\s*paid\b|\bunpaid\b|\bpending\b/.test(lower)) {
    return { paid: false, remark: text };
  }
  if (/\bpaid\b|\bdone\b|\byes\b/.test(lower)) {
    return { paid: true, remark: text };
  }
  return { remark: text };
}

export function parseVehicleGrid(
  grid: unknown[][],
  options: { sheetIndex: number; sheetName: string; batchId: string },
): { rows: VehicleRaw[]; issues: DataQualityIssue[]; mappedColumns: Set<keyof VehicleRaw>; parsed: boolean } {
  if (grid.length === 0) {
    return { rows: [], issues: [], mappedColumns: new Set(), parsed: false };
  }

  let headerRowIdx = 0;
  let bestHits = -1;
  const scanLimit = Math.min(10, grid.length);
  for (let i = 0; i < scanLimit; i += 1) {
    const row = grid[i] ?? [];
    let hits = 0;
    for (const cell of row) {
      const normalized = normalizeHeader(cell);
      if (HEADER_ALIAS_MAP[normalized] || COMM_PAYOUT_HEADER.test(normalized)) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      headerRowIdx = i;
    }
  }

  if (bestHits < MIN_HEADER_HITS) {
    return { rows: [], issues: [], mappedColumns: new Set(), parsed: false };
  }

  const headerCells = (grid[headerRowIdx] ?? []).map((cell) => normalizeHeader(cell));
  const columnMapping = new Map<number, keyof VehicleRaw | 'COMM_PAYOUT'>();
  headerCells.forEach((normalized, columnIndex) => {
    if (!normalized || IGNORED_HEADERS.has(normalized)) return;
    if (COMM_PAYOUT_HEADER.test(normalized)) {
      columnMapping.set(columnIndex, 'COMM_PAYOUT');
      return;
    }
    const key = HEADER_ALIAS_MAP[normalized];
    if (key) columnMapping.set(columnIndex, key);
  });

  const mappedColumns = new Set(
    Array.from(columnMapping.values()).filter((value): value is keyof VehicleRaw => value !== 'COMM_PAYOUT'),
  );
  if (mappedColumns.size === 0 && !Array.from(columnMapping.values()).includes('COMM_PAYOUT')) {
    return { rows: [], issues: [], mappedColumns, parsed: false };
  }

  const chassisColumnIndex = Array.from(columnMapping.entries())
    .find(([, value]) => value === 'chassis_no')?.[0];
  const rows: VehicleRaw[] = [];
  const issues: DataQualityIssue[] = [];

  for (let rowIndex = headerRowIdx + 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex] ?? [];
    const rowNumber = rowIndex + 1;
    const hasAnyValue = row.some((cell) => cell !== '' && cell !== null && cell !== undefined);
    if (!hasAnyValue) continue;

    const chassisValue = chassisColumnIndex !== undefined ? row[chassisColumnIndex] : undefined;
    const hasChassis = chassisValue !== undefined && String(chassisValue).trim() !== '';
    if (!hasChassis) {
      const looksLikeSection = row.some((cell) => {
        if (cell === '' || cell === null || cell === undefined) return false;
        return SECTION_LABEL_REGEX.test(String(cell));
      });
      if (looksLikeSection) continue;
    }

    const vehicle: Partial<VehicleRaw> = {
      id: `raw-${options.sheetIndex}-${rowIndex}`,
      import_batch_id: options.batchId,
      row_number: rowNumber,
    };

    columnMapping.forEach((dbColumn, columnIndex) => {
      const value = row[columnIndex];
      if (dbColumn === 'COMM_PAYOUT') {
        const parsed = parseCommPayout(value);
        if (parsed.remark !== undefined) vehicle.commission_remark = parsed.remark;
        if (parsed.paid !== undefined) vehicle.commission_paid = parsed.paid;
        return;
      }
      if (DATE_FIELDS.has(dbColumn)) {
        (vehicle as Record<string, unknown>)[dbColumn] = parseExcelDate(value);
      } else {
        (vehicle as Record<string, unknown>)[dbColumn] = value !== undefined && value !== null && value !== ''
          ? String(value).trim()
          : undefined;
      }
    });

    if (!vehicle.chassis_no) {
      issues.push({
        id: `iss-${options.sheetIndex}-${rowIndex}-chassis`,
        chassisNo: '',
        field: 'chassis_no',
        issueType: 'missing',
        message: `${options.sheetName} row ${rowNumber}: Missing chassis number`,
        severity: 'error',
        importBatchId: options.batchId,
      });
    }

    vehicle.is_d2d = vehicle.remark?.toLowerCase().includes('d2d')
      || vehicle.remark?.toLowerCase().includes('transfer')
      || false;
    rows.push(vehicle as VehicleRaw);
  }

  return { rows, issues, mappedColumns, parsed: true };
}