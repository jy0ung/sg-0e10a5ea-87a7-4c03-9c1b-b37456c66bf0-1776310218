import type { VehicleCanonical, KpiSummary, SlaPolicy } from '@/types';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { loadExcelJS } from '@/lib/exceljs-loader';

export interface ReportOptions {
  branchFilter?: string;
  modelFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Aging Summary Report ─────────────────────────────────────────────────────

export function generateAgingSummaryData(
  vehicles: VehicleCanonical[],
  kpiSummaries: KpiSummary[],
  options: ReportOptions = {},
): Record<string, unknown>[] {
  let filtered = vehicles;
  if (options.branchFilter) filtered = filtered.filter(v => v.branch_code === options.branchFilter);
  if (options.modelFilter) filtered = filtered.filter(v => v.model === options.modelFilter);

  return kpiSummaries.map(s => ({
    KPI: s.label,
    'Short Label': s.shortLabel,
    'Valid Vehicles': s.validCount,
    'Missing': s.missingCount,
    'Invalid': s.invalidCount,
    'Median (days)': s.median,
    'Average (days)': s.average,
    'P90 (days)': s.p90,
    'SLA (days)': s.slaDays,
    'Overdue': s.overdueCount,
    'Overdue %': s.validCount > 0 ? `${Math.round((s.overdueCount / s.validCount) * 100)}%` : '0%',
  }));
}

// ─── SLA Compliance Report ────────────────────────────────────────────────────

export function generateSlaComplianceData(
  vehicles: VehicleCanonical[],
  slas: SlaPolicy[],
  options: ReportOptions = {},
): Record<string, unknown>[] {
  let filtered = vehicles;
  if (options.branchFilter) filtered = filtered.filter(v => v.branch_code === options.branchFilter);

  const branchGroups: Record<string, VehicleCanonical[]> = {};
  for (const v of filtered) {
    if (!branchGroups[v.branch_code]) branchGroups[v.branch_code] = [];
    branchGroups[v.branch_code].push(v);
  }

  const rows: Record<string, unknown>[] = [];

  for (const [branch, bVehicles] of Object.entries(branchGroups)) {
    const row: Record<string, unknown> = { Branch: branch, Vehicles: bVehicles.length };
    for (const kpi of KPI_DEFINITIONS) {
      const sla = slas.find(s => s.kpiId === kpi.id)?.slaDays ?? kpi.slaDefault;
      const values = bVehicles.map(v => v[kpi.computedField] as number | null).filter((v): v is number => v !== null && v >= 0);
      const overdue = values.filter(v => v > sla).length;
      row[`${kpi.shortLabel} Median`] = values.length > 0 ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : '—';
      row[`${kpi.shortLabel} Overdue`] = overdue;
    }
    rows.push(row);
  }

  return rows;
}

// ─── Salesman Performance Report ─────────────────────────────────────────────

export function generateSalesmanPerformanceData(
  vehicles: VehicleCanonical[],
  options: ReportOptions = {},
): Record<string, unknown>[] {
  let filtered = vehicles;
  if (options.branchFilter) filtered = filtered.filter(v => v.branch_code === options.branchFilter);
  if (options.dateFrom) filtered = filtered.filter(v => !v.bg_date || v.bg_date >= options.dateFrom!);
  if (options.dateTo) filtered = filtered.filter(v => !v.bg_date || v.bg_date <= options.dateTo!);

  const salesmanGroups: Record<string, VehicleCanonical[]> = {};
  for (const v of filtered) {
    if (!salesmanGroups[v.salesman_name]) salesmanGroups[v.salesman_name] = [];
    salesmanGroups[v.salesman_name].push(v);
  }

  return Object.entries(salesmanGroups).map(([salesman, vList]) => {
    const delivered = vList.filter(v => v.delivery_date).length;
    const bgToDelivery = vList.map(v => v.bg_to_delivery).filter((v): v is number => v !== null && v !== undefined && v >= 0);
    const avgDays = bgToDelivery.length > 0 ? Math.round(bgToDelivery.reduce((a, b) => a + b, 0) / bgToDelivery.length) : '—';
    return {
      Salesman: salesman,
      Branch: vList[0]?.branch_code ?? '—',
      'Total Vehicles': vList.length,
      'Delivered': delivered,
      'Avg BG→Delivery (days)': avgDays,
    };
  }).sort((a, b) => (b['Delivered'] as number) - (a['Delivered'] as number));
}

// ─── Vehicle Full Export ──────────────────────────────────────────────────────

export function generateVehicleExportData(
  vehicles: VehicleCanonical[],
  options: ReportOptions = {},
): Record<string, unknown>[] {
  let filtered = vehicles;
  if (options.branchFilter) filtered = filtered.filter(v => v.branch_code === options.branchFilter);
  if (options.modelFilter) filtered = filtered.filter(v => v.model === options.modelFilter);
  if (options.dateFrom) filtered = filtered.filter(v => !v.bg_date || v.bg_date >= options.dateFrom!);
  if (options.dateTo) filtered = filtered.filter(v => !v.bg_date || v.bg_date <= options.dateTo!);

  return filtered.map(v => ({
    'CHASSIS NO.': v.chassis_no,
    'BRCH K1': v.branch_code,
    MODEL: v.model,
    VAR: v.variant ?? '',
    COLOR: v.color ?? '',
    'CUST NAME': v.customer_name,
    'SA NAME': v.salesman_name,
    'PAYMENT METHOD': v.payment_method,
    'BG DATE': v.bg_date ?? '',
    'VAA DATE': v.vaa_date ?? '',
    'FULL PAYMENT TYPE': v.full_payment_type ?? '',
    'FULL PAYMENT DATE': v.full_payment_date ?? '',
    'SHIPMENT NAME': v.shipment_name ?? '',
    'SHIPMENT ETD PKG': v.shipment_etd_pkg ?? '',
    'DATE SHIPMENT ETA KK/TWU/SDK': v.shipment_eta_kk_twu_sdk ?? '',
    'RECEIVED BY OUTLET': v.date_received_by_outlet ?? '',
    'LOU': v.lou ?? '',
    'CONTRA SOLA': v.contra_sola ?? '',
    'REG NO': v.reg_no ?? '',
    'REG DATE': v.reg_date ?? '',
    'INV No.': v.invoice_no ?? '',
    OBR: v.obr ?? '',
    'DELIVERY DATE': v.delivery_date ?? '',
    'DISB. DATE': v.disb_date ?? '',
    'COMM PAYOUT': v.commission_paid === true ? 'Paid' : v.commission_paid === false ? 'Not Paid' : '',
    'COMM REMARK': v.commission_remark ?? '',
    REMARK: v.remark ?? '',
    'DTP (Dealer Transfer Price)': v.dealer_transfer_price ?? '',
    'BG→Delivery (d)': v.bg_to_delivery ?? '',
    'BG→ETD (d)': v.bg_to_shipment_etd ?? '',
    'ETD→Outlet (d)': v.etd_to_outlet ?? '',
    'Outlet→Reg (d)': v.outlet_to_reg ?? '',
    'Reg→Delivery (d)': v.reg_to_delivery ?? '',
    'BG→Disb (d)': v.bg_to_disb ?? '',
    'Delivery→Disb (d)': v.delivery_to_disb ?? '',
    D2D: v.is_d2d ? 'Yes' : 'No',
  }));
}

// ─── XLSX Download Helpers ────────────────────────────────────────────────────

export async function downloadAsXlsx(rows: Record<string, unknown>[], fileName: string, sheetName = 'Report') {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || 'Report');
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  worksheet.columns = headers.map(header => ({ header, key: header, width: Math.max(12, Math.min(32, header.length + 4)) }));
  worksheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAsCsv(rows: Record<string, unknown>[], fileName: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
