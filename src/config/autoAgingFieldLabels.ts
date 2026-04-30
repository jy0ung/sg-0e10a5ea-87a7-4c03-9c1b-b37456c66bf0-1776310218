import type { VehicleCanonical } from '@/types';

export const AUTO_AGING_FIELD_LABELS = {
  chassis_no: 'CHASSIS NO.',
  branch_code: 'BRCH K1',
  model: 'MODEL',
  variant: 'VAR',
  color: 'COLOR',
  customer_name: 'CUST NAME',
  salesman_name: 'SA NAME',
  payment_method: 'PAYMENT METHOD',
  bg_date: 'BG DATE',
  shipment_etd_pkg: 'SHIPMENT ETD PKG',
  shipment_eta_kk_twu_sdk: 'DATE SHIPMENT ETA KK/TWU/SDK',
  date_received_by_outlet: 'RECEIVED BY OUTLET',
  reg_date: 'REG DATE',
  reg_no: 'REG NO',
  delivery_date: 'DELIVERY DATE',
  disb_date: 'DISB. DATE',
  full_payment_type: 'FULL PAYMENT TYPE',
  full_payment_date: 'FULL PAYMENT DATE',
  vaa_date: 'VAA DATE',
  invoice_no: 'INV No.',
  obr: 'OBR',
  dealer_transfer_price: 'DTP (DEALER TRANSFER PRICE)',
  shipment_name: 'SHIPMENT NAME',
  lou: 'LOU',
  contra_sola: 'CONTRA SOLA',
  is_d2d: 'D2D',
  commission_paid: 'COMM PAYOUT',
  commission_remark: 'COMM REMARK',
  remark: 'REMARK',
} satisfies Partial<Record<keyof VehicleCanonical, string>>;

export function getAutoAgingFieldLabel(field: keyof VehicleCanonical, fallback: string): string {
  return AUTO_AGING_FIELD_LABELS[field] ?? fallback;
}

export const AUTO_AGING_BG_DATE_PERIOD_LABEL = `Date period (${AUTO_AGING_FIELD_LABELS.bg_date})`;
export const AUTO_AGING_BG_DATE_RANGE_LABEL = `Date Range (${AUTO_AGING_FIELD_LABELS.bg_date})`;