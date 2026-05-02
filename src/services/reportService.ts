import type { VehicleCanonical, KpiSummary, SlaPolicy } from '@/types';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { loadExcelJS } from '@/lib/exceljs-loader';
import { supabase } from '@/integrations/supabase/client';

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
  // Note: filtering is applied upstream via kpiSummaries; options reserved for future use
  void vehicles; void options;

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

// ─── Business Reports (ReportsCenter) ─────────────────────────────────────────

export const REPORT_PAGE_SIZE = 100;

export interface ReportRow {
  [key: string]: string | number | null | undefined;
}

export interface ReportConfig {
  id: string;
  label: string;
  description: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  query: (companyId: string, from: string, to: string, page: number) => Promise<{ data: ReportRow[]; count: number }>;
  fetchAll: (companyId: string, from: string, to: string) => Promise<ReportRow[]>;
}

async function queryTable(
  table: string,
  companyId: string,
  from: string,
  to: string,
  dateCol: string,
  select: string,
  page: number,
): Promise<{ data: ReportRow[]; count: number }> {
  let q = supabase
    .from(table as 'vehicles')
    .select(select, { count: 'exact' })
    .eq('company_id', companyId);
  if (from) q = q.gte(dateCol, from);
  if (to) q = q.lte(dateCol, to);
  const { data, count } = await q
    .order(dateCol, { ascending: false })
    .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
  return { data: (data ?? []) as ReportRow[], count: count ?? 0 };
}

async function fetchAllPages(
  table: string,
  companyId: string,
  from: string,
  to: string,
  dateCol: string,
  select: string,
): Promise<ReportRow[]> {
  const results: ReportRow[] = [];
  let page = 0;
  while (true) {
    const { data } = await queryTable(table, companyId, from, to, dateCol, select, page);
    results.push(...data);
    if (data.length < REPORT_PAGE_SIZE) break;
    page++;
  }
  return results;
}

export const REPORTS: ReportConfig[] = [
  {
    id: 'stock',
    label: 'Stock Balance',
    description: 'Current vehicle stock balance by model and branch',
    columns: [
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'model', label: 'Model' },
      { key: 'colour', label: 'Colour' },
      { key: 'branch_id', label: 'Branch' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Date In' },
    ],
    query: async (companyId, _from, _to, page) => {
      const { data, count } = await supabase
        .from('vehicles')
        .select('chassis_no,model,colour,branch_id,status,created_at', { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
      return { data: (data ?? []) as ReportRow[], count: count ?? 0 };
    },
    fetchAll: async (companyId) => {
      const results: ReportRow[] = [];
      let page = 0;
      while (true) {
        const { data } = await supabase
          .from('vehicles')
          .select('chassis_no,model,colour,branch_id,status,created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
        results.push(...((data ?? []) as ReportRow[]));
        if ((data ?? []).length < REPORT_PAGE_SIZE) break;
        page++;
      }
      return results;
    },
  },
  {
    id: 'register',
    label: 'Vehicle Register',
    description: 'Full vehicle registration log with plate numbers',
    columns: [
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'plate_no', label: 'Plate No' },
      { key: 'model', label: 'Model' },
      { key: 'engine_no', label: 'Engine No' },
      { key: 'colour', label: 'Colour' },
      { key: 'status', label: 'Status' },
    ],
    query: async (companyId, _from, _to, page) => {
      const { data, count } = await supabase
        .from('vehicles')
        .select('chassis_no,plate_no,model,engine_no,colour,status', { count: 'exact' })
        .eq('company_id', companyId)
        .order('chassis_no')
        .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
      return { data: (data ?? []) as ReportRow[], count: count ?? 0 };
    },
    fetchAll: async (companyId) => {
      const results: ReportRow[] = [];
      let page = 0;
      while (true) {
        const { data } = await supabase
          .from('vehicles')
          .select('chassis_no,plate_no,model,engine_no,colour,status')
          .eq('company_id', companyId)
          .order('chassis_no')
          .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
        results.push(...((data ?? []) as ReportRow[]));
        if ((data ?? []).length < REPORT_PAGE_SIZE) break;
        page++;
      }
      return results;
    },
  },
  {
    id: 'booking',
    label: 'Collection Booking',
    description: 'Sales order booking report within date range',
    columns: [
      { key: 'order_no', label: 'Order No' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'model', label: 'Model' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Booking Date' },
      { key: 'total_price', label: 'Price (RM)', numeric: true },
    ],
    query: (companyId, from, to, page) => queryTable('sales_orders', companyId, from, to, 'created_at', 'order_no,customer_name,model,status,created_at,total_price', page),
    fetchAll: (companyId, from, to) => fetchAllPages('sales_orders', companyId, from, to, 'created_at', 'order_no,customer_name,model,status,created_at,total_price'),
  },
  {
    id: 'disbursement',
    label: 'Loan Disbursement',
    description: 'Loan disbursement report from financed orders',
    columns: [
      { key: 'order_no', label: 'Order No' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'finance_company', label: 'Finance Co.' },
      { key: 'loan_amount', label: 'Loan Amount (RM)', numeric: true },
      { key: 'disbursement_date', label: 'Disbursement Date' },
      { key: 'status', label: 'Status' },
    ],
    query: (companyId, from, to, page) => queryTable('sales_orders', companyId, from, to, 'created_at', 'order_no,customer_name,finance_company,loan_amount,disbursement_date,status', page),
    fetchAll: (companyId, from, to) => fetchAllPages('sales_orders', companyId, from, to, 'created_at', 'order_no,customer_name,finance_company,loan_amount,disbursement_date,status'),
  },
  {
    id: 'purchase',
    label: 'Purchase Report',
    description: 'Vehicle purchase invoices from suppliers',
    columns: [
      { key: 'invoice_no', label: 'Invoice No' },
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'model', label: 'Model' },
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'purchase_price', label: 'Price (RM)', numeric: true },
      { key: 'invoice_date', label: 'Invoice Date' },
    ],
    query: (companyId, from, to, page) => queryTable('purchase_invoices', companyId, from, to, 'invoice_date', 'invoice_no,supplier_name,model,chassis_no,purchase_price,invoice_date', page),
    fetchAll: (companyId, from, to) => fetchAllPages('purchase_invoices', companyId, from, to, 'invoice_date', 'invoice_no,supplier_name,model,chassis_no,purchase_price,invoice_date'),
  },
  {
    id: 'transfer',
    label: 'Vehicle Transfer',
    description: 'Inter-branch vehicle transfer history',
    columns: [
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'from_branch', label: 'From Branch' },
      { key: 'to_branch', label: 'To Branch' },
      { key: 'transfer_date', label: 'Transfer Date' },
      { key: 'transferred_by', label: 'Transferred By' },
      { key: 'status', label: 'Status' },
    ],
    query: (companyId, from, to, page) => queryTable('vehicle_transfers', companyId, from, to, 'transfer_date', 'chassis_no,from_branch,to_branch,transfer_date,transferred_by,status', page),
    fetchAll: (companyId, from, to) => fetchAllPages('vehicle_transfers', companyId, from, to, 'transfer_date', 'chassis_no,from_branch,to_branch,transfer_date,transferred_by,status'),
  },
  {
    id: 'invoice',
    label: 'Sales Invoice',
    description: 'Sales invoices issued within date range',
    columns: [
      { key: 'invoice_no', label: 'Invoice No' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'model', label: 'Model' },
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'invoice_amount', label: 'Amount (RM)', numeric: true },
      { key: 'invoice_date', label: 'Invoice Date' },
    ],
    query: (companyId, from, to, page) => queryTable('sales_invoices', companyId, from, to, 'invoice_date', 'invoice_no,customer_name,model,chassis_no,invoice_amount,invoice_date', page),
    fetchAll: (companyId, from, to) => fetchAllPages('sales_invoices', companyId, from, to, 'invoice_date', 'invoice_no,customer_name,model,chassis_no,invoice_amount,invoice_date'),
  },
];
