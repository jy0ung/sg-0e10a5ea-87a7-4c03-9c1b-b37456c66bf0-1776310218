import { supabase } from '@flc/supabase';

export const REPORT_PAGE_SIZE = 100;
export const REPORT_EXPORT_CAP = 10_000;

export interface ReportRow {
  [key: string]: string | number | null | undefined;
}

export interface ReportConfig {
  id: string;
  label: string;
  description: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  query: (companyId: string, from: string, to: string, page: number) => Promise<{ data: ReportRow[]; count: number }>;
  fetchAll: (companyId: string, from: string, to: string) => Promise<{ rows: ReportRow[]; totalCount: number }>;
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
  let query = supabase
    .from(table as 'vehicles')
    .select(select, { count: 'exact' })
    .eq('company_id', companyId);
  if (from) query = query.gte(dateCol, from);
  if (to) query = query.lte(dateCol, to);

  const { data, count } = await query
    .order(dateCol, { ascending: false })
    .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
  return { data: (data ?? []) as unknown as ReportRow[], count: count ?? 0 };
}

async function fetchAllPages(
  table: string,
  companyId: string,
  from: string,
  to: string,
  dateCol: string,
  select: string,
): Promise<{ rows: ReportRow[]; totalCount: number }> {
  // First page also gets the total count
  const results: ReportRow[] = [];
  let totalCount = 0;
  let page = 0;
  while (results.length < REPORT_EXPORT_CAP) {
    const { data, count } = await queryTable(table, companyId, from, to, dateCol, select, page);
    if (page === 0) totalCount = count;
    results.push(...data);
    if (data.length < REPORT_PAGE_SIZE) break;
    page += 1;
  }
  return { rows: results.slice(0, REPORT_EXPORT_CAP), totalCount };
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
      return { data: (data ?? []) as unknown as ReportRow[], count: count ?? 0 };
    },
    fetchAll: async (companyId) => {
      const results: ReportRow[] = [];
      let totalCount = 0;
      let page = 0;
      while (results.length < REPORT_EXPORT_CAP) {
        const { data, count } = await supabase
          .from('vehicles')
          .select('chassis_no,model,colour,branch_id,status,created_at', { count: page === 0 ? 'exact' : undefined })
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
        if (page === 0) totalCount = count ?? 0;
        results.push(...((data ?? []) as unknown as ReportRow[]));
        if ((data ?? []).length < REPORT_PAGE_SIZE) break;
        page += 1;
      }
      return { rows: results.slice(0, REPORT_EXPORT_CAP), totalCount };
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
      return { data: (data ?? []) as unknown as ReportRow[], count: count ?? 0 };
    },
    fetchAll: async (companyId) => {
      const results: ReportRow[] = [];
      let totalCount = 0;
      let page = 0;
      while (results.length < REPORT_EXPORT_CAP) {
        const { data, count } = await supabase
          .from('vehicles')
          .select('chassis_no,plate_no,model,engine_no,colour,status', { count: page === 0 ? 'exact' : undefined })
          .eq('company_id', companyId)
          .order('chassis_no')
          .range(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE - 1);
        if (page === 0) totalCount = count ?? 0;
        results.push(...((data ?? []) as unknown as ReportRow[]));
        if ((data ?? []).length < REPORT_PAGE_SIZE) break;
        page += 1;
      }
      return { rows: results.slice(0, REPORT_EXPORT_CAP), totalCount };
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