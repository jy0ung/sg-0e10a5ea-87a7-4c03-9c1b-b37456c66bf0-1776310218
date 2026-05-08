import { VehicleRaw } from '@/types';

export type NormalizedCell = {
  value?: string | boolean;
  invalid?: boolean;
};

const PAYMENT_METHOD_CANONICAL: Record<string, string> = {
  cash: 'Cash',
  loan: 'Loan',
  'hire purchase': 'Hire Purchase',
  hp: 'HP',
  'bank loan': 'Bank Loan',
  leasing: 'Leasing',
  credit: 'Credit',
};

const DATE_FIELDS = new Set<keyof VehicleRaw>([
  'bg_date', 'shipment_etd_pkg', 'shipment_eta_kk_twu_sdk',
  'date_received_by_outlet', 'delivery_date', 'disb_date',
  'vaa_date', 'full_payment_date', 'reg_date',
]);

const CODE_FIELDS = new Set<keyof VehicleRaw>([
  'chassis_no', 'branch_code', 'lou', 'contra_sola', 'reg_no', 'invoice_no', 'obr',
]);

function collapseWhitespace(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const text = String(raw).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text ? text : undefined;
}

function buildUtcDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return date.toISOString().split('T')[0];
}

function normalizeDateCell(raw: unknown): NormalizedCell {
  if (raw === null || raw === undefined) return {};

  if (typeof raw === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.floor(raw) * 86_400_000);
    if (!Number.isNaN(date.getTime())) {
      return { value: date.toISOString().split('T')[0] };
    }
    return {};
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
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
    is_d2d: Boolean(normalizedRemark && typeof normalizedRemark === 'string' && (normalizedRemark.toLowerCase().includes('d2d') || normalizedRemark.toLowerCase().includes('transfer'))),
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