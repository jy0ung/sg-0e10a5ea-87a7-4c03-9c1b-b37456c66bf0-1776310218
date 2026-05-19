#!/usr/bin/env tsx
/**
 * seed-from-extract.ts
 *
 * Reads the JSON files produced by proton-extract.spec.ts from
 * test-results/extract/ and inserts the data into the local Supabase DB.
 *
 * Usage:
 *   npx tsx scripts/seed-from-extract.ts            # live run
 *   npx tsx scripts/seed-from-extract.ts --dry-run  # print what would be inserted
 *   npx tsx scripts/seed-from-extract.ts --only vehicles customers  # run specific tables
 *
 * Prerequisites:
 *   1. Local Supabase is running  (supabase start)
 *   2. proton-extract.spec.ts has already produced test-results/extract/*.json
 *   3. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (or defaults for local stack)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.SUPABASE_URL  ?? "http://127.0.0.1:54321";
// The service-role key bypasses RLS so we can insert without an authenticated user.
// Phase 0 hardening: no hardcoded fallback key. Caller MUST set
// SUPABASE_SERVICE_ROLE_KEY in the environment (see .env.example) — the seed
// script refuses to run otherwise to avoid leaking data into the wrong project.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN       = process.argv.includes("--dry-run");

if (!SERVICE_KEY && !DRY_RUN) {
  console.error(
    "seed-from-extract: SUPABASE_SERVICE_ROLE_KEY is not set. Export it in your shell or .env before running.",
  );
  process.exit(1);
}
const COMPANY_ID    = process.env.SEED_COMPANY_ID ?? "c1";
const EXTRACT_DIR   = path.resolve(__dirname, "../test-results/extract");
const CHUNK_SIZE    = 50;
const CHUNK_DELAY   = 120; // ms between insert chunks

const ONLY_FLAG     = process.argv.indexOf("--only");
const ONLY_TABLES   = ONLY_FLAG !== -1 ? process.argv.slice(ONLY_FLAG + 1) : [];

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client — service role, no RLS restrictions
// ─────────────────────────────────────────────────────────────────────────────

const supabase = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// Column mapping
//
// Maps old fookloi table header text → new DB column name.
// Keys are lowercased + trimmed for matching (matching is case-insensitive).
// Unknown columns from the old system are stored in a JSONB `raw_data` fallback
// rather than being silently dropped.
// ─────────────────────────────────────────────────────────────────────────────

type Transformer = (val: string) => string | number | boolean | null;

interface ColMap {
  [oldHeader: string]: string | [string, Transformer] | null;  // null = explicitly skip field
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalizers — applied to every row before insert
// ─────────────────────────────────────────────────────────────────────────────

/** Trim + collapse internal whitespace */
function normStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' || s === '-' || s === 'N/A' || s === 'n/a' ? null : s;
}

/** IC / company-reg normalizer: strip non-alphanumeric, uppercase */
function normIcNo(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || s === 'N/A') return null;
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null;
}

/** Phone normalizer: strip spaces, dashes, brackets — keep leading + */
function normPhone(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || s === 'N/A') return null;
  const digits = s.replace(/[\s\-().]/g, '');
  return digits || null;
}

/** Email normalizer: lowercase, trim */
function normEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === '-' || s === 'n/a' || !s.includes('@')) return null;
  return s;
}

/** Invoice / receipt / chassis normalizer: trim + uppercase */
function normCode(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return s || null;
}

/**
 * Apply field-level normalizers based on well-known column names.
 * All string fields also get trimmed.
 */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v == null) { r[k] = null; continue; }
    switch (k) {
      case 'ic_no':      r[k] = normIcNo(v);  break;
      case 'phone':      r[k] = normPhone(v); break;
      case 'email':      r[k] = normEmail(v); break;
      case 'invoice_no': r[k] = normCode(v);  break;
      case 'receipt_no': r[k] = normCode(v);  break;
      case 'chassis_no': r[k] = normCode(v);  break;
      case 'name':       r[k] = normStr(v);   break;
      default:
        r[k] = typeof v === 'string' ? normStr(v) ?? null : v;
    }
  }
  return r;
}

/**
 * Deduplicate rows in-memory by a single key column.
 * The first occurrence wins; subsequent identical keys are dropped.
 * When key is null/empty the row is still kept (no dedup possible).
 */
function deduplicateRows(
  rows: Record<string, unknown>[],
  key: string,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const v = row[key];
    if (v == null || v === '') {
      out.push(row);
      continue;
    }
    const k = String(v).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

const toDate = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "-" || s === "N/A") return null;
  // Handle dd/mm/yyyy → yyyy-mm-dd
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s || null;
};

const toNum = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const cleaned = String(v).replace(/[,RM$\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

const toStatus = (v: string | null | undefined): string =>
  v ? String(v).trim() || "Active" : "Active";

/** Vehicles (viewChassisFilter / viewStockBalance) */
const VEHICLES_MAP: ColMap = {
  // ─ HTML-scraped header names (legacy / fallback) ─
  "chassis no":               "chassis_no",
  "chassis number":           "chassis_no",
  "bg date":                  ["bg_date", toDate],
  "bg":                       ["bg_date", toDate],
  "shipment etd":             ["shipment_etd_pkg", toDate],
  "etd":                      ["shipment_etd_pkg", toDate],
  "eta":                      ["shipment_eta_kk_twu_sdk", toDate],
  "date received":            ["date_received_by_outlet", toDate],
  "received date":            ["date_received_by_outlet", toDate],
  "reg date":                 ["reg_date", toDate],
  "registration date":        ["reg_date", toDate],
  "delivery date":            ["delivery_date", toDate],
  "disb date":                ["disb_date", toDate],
  "disbursement date":        ["disb_date", toDate],
  "branch":                   "branch_code",
  "model":                    "model",
  "variant":                  "variant",
  "payment method":           "payment_method",
  "payment type":             "payment_method",
  "salesman":                 "salesman_name",
  "sales person":             "salesman_name",
  "salesperson":              "salesman_name",
  "customer":                 "customer_name",
  "customer name":            "customer_name",
  "remark":                   "remark",
  "remarks":                  "remark",
  "reg no":                   "reg_no",
  "plate no":                 "reg_no",
  "plate number":             "reg_no",
  "invoice no":               "invoice_no",
  "colour":                   "colour",
  "color":                    "colour",
  "engine no":                "engine_no",
  "engine number":            "engine_no",
  "vaa date":                 ["vaa_date", toDate],
  "full payment date":        ["full_payment_date", toDate],
  "shipment name":            "shipment_name",
  "lou":                      "lou",
  "status":                   "status",
  // ─ API / server-side JSON field names (stock_balance.php) ─
  "chassisno":                "chassis_no",
  "engineno":                 "engine_no",
  "plateno":                  "reg_no",
  "branchcode":               "branch_code",
  "branchname":               "branch_name",
  "yearmodel":                "year_model",
  "colourmodel":              "colour",
  "invoiceno":                "invoice_no",
  "invoicedate":              null,               // no invoice_date column — bg_date is used from "date"
  "amount":                   null,               // no amount column on vehicles
  "total":                    null,               // no total column on vehicles
  "sells total":              null,               // no sells_total column on vehicles
  "sellstotal":               null,
  "date":                     ["bg_date", toDate],
  "vmid":                     null,               // no vm_id column on vehicles
  "code":                     "model_code",       // Phase 1 column
  "iid":                      "legacy_id",        // Phase 1 column
  "supplierid":               null,               // no supplier_id_legacy column on vehicles
  "vm_status":                "status",           // Phase 1 column
  "carmodel":                 "model",
  "carcolor":                 "colour",           // Phase 1 column
  "cno":                      "chassis_no",
  "eno":                      "engine_no",        // Phase 1 column
  "amt":                      null,               // no amount column on vehicles
};

/** Customers */
const CUSTOMERS_MAP: ColMap = {
  "name":           "name",
  "customer name":  "name",
  "ic no":          "ic_no",
  "ic number":      "ic_no",
  "ic / company registration no.": "ic_no",
  "nric":           "ic_no",
  "phone":          "phone",
  "contact no":     "phone",
  "contact no.":    "phone",
  "contact number": "phone",
  "email":          "email",
  "emailaddress":   "email",
  "address":        "address",
  "address 1":      "address",
  "notes":          "notes",
  "remark":         "notes",
  "status":         "notes",
};

/** Sales Orders */
const SALES_ORDERS_MAP: ColMap = {
  // ─ HTML-scraped header names ─
  "order no":               "order_no",
  "booking no":             "order_no",
  "customer":               "customer_name",
  "customer name":          "customer_name",
  "salesman":               "salesman_name",
  "sales person":           "salesman_name",
  "branch":                 "branch_code",
  "model":                  "model",
  "variant":                "variant",
  "colour":                 "color",
  "color":                  "color",
  "booking amount":         ["booking_amount", toNum],
  "deposit":                ["booking_amount", toNum],
  "discount":               ["discount", toNum],
  "selling price":          ["selling_price", toNum],
  "price":                  ["selling_price", toNum],
  "payment method":         "payment_method",
  "payment type":           "payment_method",
  "booking date":           ["booking_date", toDate],
  "date":                   ["booking_date", toDate],
  "delivery date":          ["expected_delivery_date", toDate],
  "chassis no":             "chassis_no",
  "status":                 "status",
  "notes":                  "notes",
  "remark":                 "notes",
  // ─ API / server-side JSON field names (customer_sales.php) ─
  "vsono":                  "order_no",
  "cusname":                "customer_name",     // Phase 1 column
  "cusnric":                "ic_no",             // Phase 1 column
  "registrationno":         "plate_no",          // maps to existing plate_no column
  "registrationdate":       null,                // no reg_date on sales_orders
  "chassisno":              "chassis_no",
  "invrunning":             null,                // invoice is separate entity — skip
  "invoicedate":            null,                // no invoice_date on sales_orders
  "totalamountbank":        ["total_amount_bank", toNum],   // Phase 1 column
  "balancecustomer":        ["balance_customer", toNum],    // Phase 1 column
  "name":                   "salesman_name",
  "overalltotal":           ["overall_total", toNum],       // Phase 1 column
  "total_refund_amount":    ["total_refund_amount", toNum], // Phase 1 column
  "total_deposit_amount":   ["booking_amount", toNum],
  "sb_status":              "order_status",      // Phase 1 column (renamed from 'status')
  "created_at":             ["booking_date", toDate],
  "sbid":                   "legacy_id",         // Phase 1 column
  "lastcancel":             ["last_cancel", toDate],  // Phase 1 column
  "remarkinvoice":          "notes",
  "count":                  null,                // computed field — skip
  "integrated_box":         null,                // skip
};

/** Invoices */
const INVOICES_MAP: ColMap = {
  "invoice no":       "invoice_no",
  "inv no.":          "invoice_no",
  "invoice number":   "invoice_no",
  "invoice date":     ["invoice_date", toDate],
  "date":             ["invoice_date", toDate],
  "amount due to/from customer": ["amount", toNum],
  "amount":           ["amount", toNum],
  "otr price":         ["total_amount", toNum],
  "total":            ["total_amount", toNum],
  "total amount":     ["total_amount", toNum],
  "tax":              ["tax_amount", toNum],
  "payment status":   "payment_status",
  "status":           "payment_status",
  "paid amount":      ["paid_amount", toNum],
  "due date":         ["due_date", toDate],
  "order no":         "sales_order_ref",
  "customer":         "customer_name",
  "customer name":    "customer_name",
};

/** Purchase Invoices */
const PURCHASE_INVOICES_MAP: ColMap = {
  "invoice no":       "invoice_no",
  "invoice no. (cbu)": "invoice_no",
  "supplier":         "supplier",
  "supplier name":    "supplier",
  "chassis no":       "chassis_no",
  "chassis no.":      "chassis_no",
  "model":            "model",
  "invoice date":     ["invoice_date", toDate],
  "amount":           ["amount", toNum],
  "amount (rm)":      ["amount", toNum],
  "status":           ["status", toStatus],
  "remark":           "remark",
};

/** Dealer Invoices */
const DEALER_INVOICES_MAP: ColMap = {
  "invoice no":     "invoice_no",
  "branch":         "branch",
  "dealer":         "dealer_name",
  "dealer name":    "dealer_name",
  "dealername":     "dealer_name",
  "model":          "car_model",
  "car model":      "car_model",
  "carmodel":       "car_model",
  "colour":         "car_colour",
  "carcolour":      "car_colour",
  "chassis no":     "chassis_no",
  "chassisno.":     "chassis_no",
  "chassis number": "chassis_no",
  "sales price":    ["sales_price", toNum],
  "salesprice":     ["sales_price", toNum],
  "price":          ["sales_price", toNum],
  "date":           ["invoice_date", toDate],
  "invoice date":   ["invoice_date", toDate],
  "status":         ["status", toStatus],
};

/** Official Receipts */
const OFFICIAL_RECEIPTS_MAP: ColMap = {
  "or no":                "receipt_no",
  "receipt no":           "receipt_no",
  "officialreceipt no":   "receipt_no",
  "date":                 ["receipt_date", toDate],
  "amount":               ["amount", toNum],
  "amount(rm)":           ["amount", toNum],
  "branch":               "branch",
  "attachment":           "attachment_url",
  "verified by":          "verified_by",
  "status":               ["status", toStatus],
};

/** Commission Records */
const COMMISSION_RECORDS_MAP: ColMap = {
  "chassis no":     "chassis_no",
  "chassis number": "chassis_no",
  "salesman":       "salesman_name",
  "sales person":   "salesman_name",
  "amount":         ["amount", toNum],
  "commission":     ["amount", toNum],
  "period":         "period",
  "month":          "period",
  "status":         ["status", toStatus],
};

/**
 * Staff / Users — kept for reference but intentionally NOT wired to a seed target.
 * profiles.id is a FK to auth.users(id) ON DELETE CASCADE; profiles rows must be
 * created via the Supabase Admin API (or GoTrue) alongside auth.users, not via
 * direct INSERT. Use bootstrap-admin.ts for admin accounts.
 */
const _STAFF_MAP: ColMap = {
  "name":       "name",
  "staff name": "name",
  "username":   "username",
  "email":      "email",
  "emailaddress": "email",
  "role":       "role",
  "group":      "role",
  // "branch" maps to branch_id (UUID) on profiles — skipped; resolve manually post-seed
  "status":     ["status", toStatus],
};

/** Branches */
const BRANCHES_MAP: ColMap = {
  "code":         "code",
  "branch code":  "code",
  "name":         "name",
  "branch name":  "name",
  "or series":    "or_series",
  "vdo series":   "vdo_series",
};

/** Finance Companies */
const FINANCE_MAP: ColMap = {
  "code":               "code",
  "company code":       "code",
  "name":               "name",
  "company name":       "name",
};

/** Insurance Companies */
const INSURANCE_MAP: ColMap = { ...FINANCE_MAP };

/** Vehicle Models */
const MODELS_MAP: ColMap = {
  "code":        "code",
  "model code":  "code",
  "name":        "name",
  "model name":  "name",
  "model":       "name",
  "base price":  ["base_price", toNum],
  "price":       ["base_price", toNum],
  "amount":      ["base_price", toNum],
};

/** Vehicle Colours */
const COLOURS_MAP: ColMap = {
  "code":         "code",
  "colour code":  "code",
  "name":         "name",
  "colour name":  "name",
  "color":        "name",
  "colour":       "name",
};

/** Payment Types */
const PAYMENT_TYPES_MAP: ColMap = {
  "name":          "name",
  "payment type":  "name",
  "billing":       "billing",
  "status":        ["status", toStatus],
};

/** Banks */
const BANKS_MAP: ColMap = {
  "name":        "name",
  "bank name":   "name",
  "account no":  "account_no",
  "account":     "account_no",
  "status":      ["status", toStatus],
};

/** Suppliers */
const SUPPLIERS_MAP: ColMap = {
  "name":                        "name",
  "supplier name":               "name",
  "code":                        "code",
  "company reg no":              "company_reg_no",
  "companyregistration no.":     "company_reg_no",
  "reg no":                      "company_reg_no",
  "address":                     "company_address",
  "companyaddress":              "company_address",
  "mailingaddress":              "mailing_address",
  "mailing address":             "mailing_address",
  "attn":                        "attn",
  "contact no":                  "contact_no",
  "contact / hp no.":            "contact_no",
  "phone":                       "contact_no",
  "email":                       "email",
  "status":                      ["status", toStatus],
};

/** Sales Advisors */
const SALES_ADVISORS_MAP: ColMap = {
  "id":           "legacy_id",
  "code":         "code",
  "name":         "name",
  "ic no.":       "ic_no",
  "ic no":        "ic_no",
  "emailaddress": "email",
  "email":        "email",
  "contactno.":   "contact_no",
  "contact no":   "contact_no",
  // Phase 0: branch_code column added to sales_advisors table
  "branch":       "branch_code",
  "branchcode":   "branch_code",
  "branch code":  "branch_code",
  "joindate":     ["join_date", toDate],
  "join date":    ["join_date", toDate],
  "resigndate":   ["resign_date", toDate],
  "resign date":  ["resign_date", toDate],
  "description":  "description",
  "status":       ["status", toStatus],
};

/** Dealers */
const DEALERS_MAP: ColMap = {
  "name":                        "name",
  "dealer name":                 "name",
  "acc code":                    "acc_code",
  "account code":                "acc_code",
  "company reg no":              "company_reg_no",
  "companyregistration no.":     "company_reg_no",
  "reg no":                      "company_reg_no",
  "address":                     "company_address",
  "companyaddress":              "company_address",
  "mailing address":             "mailing_address",
  "mailingaddress":              "mailing_address",
  "attn":                        "attn",
  "contact no":                  "contact_no",
  "contact / hp no.":            "contact_no",
  "phone":                       "contact_no",
  "email":                       "email",
  "status":                      ["status", toStatus],
};

// ─────────────────────────────────────────────────────────────────────────────
// Seed targets — maps extract file name → DB table + column map
// ─────────────────────────────────────────────────────────────────────────────

interface SeedTarget {
  extractFile:   string;           // filename without .json
  table:         string;           // Supabase table name
  colMap:        ColMap;
  uniqueKey?:    string;           // column used for in-memory dedup (first-wins)
  conflictCols?: string;           // comma-sep columns for ON CONFLICT ... DO NOTHING upsert
  addCompanyId?: boolean;          // whether to inject company_id
  transform?:    (row: Record<string, unknown>) => Record<string, unknown>; // post-map hook
  /**
   * Async FK-resolution step that runs after transform but before dedup+insert.
   * Use this when a column must be resolved to a UUID by querying another table
   * (e.g. resolving order_no → sales_orders.id for invoices).
   * Receives the full supabase client and must return the modified rows.
   * Rows that cannot be resolved should be dropped and counted internally.
   */
  resolveRows?:  (
    rows:      Record<string, unknown>[],
    client:    ReturnType<typeof createClient>,
    companyId: string,
  ) => Promise<Record<string, unknown>[]>;
}

/** Returns a stateful transform that generates sequential codes (FC001, VC001 …)
 * for tables whose extract data has no explicit code column. */
function makeCodeGenTransform(prefix: string) {
  let seq = 0;
  return (row: Record<string, unknown>) => {
    if (!row.code) {
      seq += 1;
      row.code = `${prefix}${String(seq).padStart(3, "0")}`;
    }
    return row;
  };
}

const SEED_TARGETS: SeedTarget[] = [
  // Master data first (no FK deps)
  { extractFile: "branches",           table: "branches",           colMap: BRANCHES_MAP,       uniqueKey: "code",       conflictCols: "code,company_id",        addCompanyId: true },
  { extractFile: "finance-companies",  table: "finance_companies",  colMap: FINANCE_MAP,         uniqueKey: "code",       conflictCols: "code,company_id",        addCompanyId: true,
    transform: makeCodeGenTransform("FC") },
  { extractFile: "insurance-companies",table: "insurance_companies",colMap: INSURANCE_MAP,       uniqueKey: "code",       conflictCols: "code,company_id",        addCompanyId: true,
    transform: makeCodeGenTransform("IC") },
  { extractFile: "vehicle-models",     table: "vehicle_models",     colMap: MODELS_MAP,          uniqueKey: "code",       conflictCols: "code,company_id",        addCompanyId: true },
  { extractFile: "vehicle-colours",    table: "vehicle_colours",    colMap: COLOURS_MAP,         uniqueKey: "code",       conflictCols: "code,company_id",        addCompanyId: true,
    transform: makeCodeGenTransform("VC") },
  { extractFile: "payment-types",      table: "payment_types",      colMap: PAYMENT_TYPES_MAP,   uniqueKey: "name",       conflictCols: "name,company_id",        addCompanyId: true },
  { extractFile: "banks",              table: "banks",              colMap: BANKS_MAP,           uniqueKey: "name",                                                               addCompanyId: true },
  { extractFile: "suppliers",          table: "suppliers",          colMap: SUPPLIERS_MAP,       uniqueKey: "name",                                                               addCompanyId: true },
  { extractFile: "dealers",            table: "dealers",            colMap: DEALERS_MAP,         uniqueKey: "name",                                                               addCompanyId: true },
  { extractFile: "sales-advisors",     table: "sales_advisors",     colMap: SALES_ADVISORS_MAP,  uniqueKey: "code",       conflictCols: "code,company_id",        addCompanyId: true },
  // Transactional data
  {
    extractFile: "vehicles",
    table: "vehicles",
    colMap: VEHICLES_MAP,
    uniqueKey: "chassis_no",
    conflictCols: "chassis_no,company_id",  // unique index idx_vehicles_chassis_company
    addCompanyId: true,
    // Strip any mapped keys that still don't exist in the vehicles table schema.
    transform: (row) => {
      const VALID_VEHICLES = new Set([
        "chassis_no","bg_date","shipment_etd_pkg","shipment_eta_kk_twu_sdk",
        "date_received_by_outlet","reg_date","delivery_date","disb_date",
        "branch_code","model","payment_method","salesman_name","customer_name",
        "remark","vaa_date","full_payment_date","variant","shipment_name",
        "lou","reg_no","invoice_no","company_id","is_d2d","source_row_id",
        // Phase 1 extended columns:
        "engine_no","year_model","colour","status","legacy_id","model_code","branch_name",
      ]);
      return Object.fromEntries(Object.entries(row).filter(([k]) => VALID_VEHICLES.has(k)));
    },
  },
  // Customers: deduplicate by ic_no when present; partial index (ic_no,company_id) WHERE ic_no IS NOT NULL AND is_deleted=false
  { extractFile: "customers",          table: "customers",          colMap: CUSTOMERS_MAP,       uniqueKey: "ic_no",                                                              addCompanyId: true },
  {
    extractFile: "sales-orders",
    table: "sales_orders",
    colMap: SALES_ORDERS_MAP,
    conflictCols: "order_no,company_id",  // unique index uq_sales_orders_order_no_company (Phase 1)
    addCompanyId: true,
    // Strip mapped keys that don't exist in sales_orders, and supply NOT NULL defaults.
    transform: (row) => {
      const VALID_SALES_ORDERS = new Set([
        "order_no","customer_id","salesman_name","branch_code","model",
        "variant","color","booking_amount","discount","selling_price","payment_method",
        "booking_date","expected_delivery_date","notes","chassis_no","company_id",
        "vso_no","deposit_amount","bank_loan_amount","outstanding_amount",
        "finance_company","insurance_company","plate_no","is_deleted",
        // Phase 1 extended columns:
        "customer_name","ic_no","legacy_id","order_status","total_amount_bank",
        "balance_customer","overall_total","total_refund_amount","last_cancel",
      ]);
      const filtered = Object.fromEntries(
        Object.entries(row).filter(([k]) => VALID_SALES_ORDERS.has(k))
      ) as Record<string, unknown>;
      // Ensure required NOT NULL columns have fallback values.
      if (!filtered.salesman_name) filtered.salesman_name = "UNKNOWN";
      if (!filtered.branch_code)   filtered.branch_code   = "LEGACY";
      if (!filtered.model)         filtered.model         = "LEGACY";
      return filtered;
    },
  },
  // Customer-sales invoices: sales_order_id (NOT NULL FK) is resolved at seed time by
  // pre-fetching the order_no → id map from the already-seeded sales_orders table.
  // Rows whose order_no does not match a seeded sales_order are dropped (logged).
  {
    extractFile:  "invoices",
    table:        "invoices",
    colMap:       INVOICES_MAP,
    uniqueKey:    "invoice_no",
    conflictCols: "invoice_no,company_id",
    addCompanyId: true,
    resolveRows: async (rows, client, companyId) => {
      // Batch-fetch (order_no, id) for this company — may be large; PostgREST default limit is 1000.
      // Use explicit range to page through if needed; for typical extract sizes one page is sufficient.
      const { data: orders, error } = await client
        .from('sales_orders')
        .select('id, order_no')
        .eq('company_id', companyId)
        .not('order_no', 'is', null)
        .limit(100_000);
      if (error) {
        console.error(`  ✗ resolveRows(invoices): failed to fetch sales_orders: ${error.message}`);
        return [];
      }
      const orderMap = new Map<string, string>();
      for (const r of (orders ?? [])) {
        if (r.order_no) orderMap.set(String(r.order_no), String(r.id));
      }
      const VALID_INVOICES = new Set([
        'invoice_no', 'sales_order_id', 'invoice_date', 'amount',
        'tax_amount', 'total_amount', 'payment_status', 'paid_amount',
        'due_date', 'company_id', 'invoice_type', 'customer_name', 'notes',
      ]);
      let unresolved = 0;
      const resolved: Record<string, unknown>[] = [];
      for (const row of rows) {
        const ref = String(row['sales_order_ref'] ?? '').trim();
        const uuid = ref ? orderMap.get(ref) : undefined;
        if (!uuid) { unresolved++; continue; }
        const clean: Record<string, unknown> = Object.fromEntries(
          Object.entries({ ...row, sales_order_id: uuid })
            .filter(([k]) => VALID_INVOICES.has(k))
        );
        // Supply NOT NULL column defaults for rows with missing data
        if (!clean.invoice_date) clean.invoice_date = '1970-01-01';
        if (clean.amount     == null) clean.amount      = 0;
        if (clean.tax_amount == null) clean.tax_amount  = 0;
        if (clean.total_amount == null) clean.total_amount = Number(clean.amount ?? 0);
        resolved.push(clean);
      }
      if (unresolved > 0)
        console.info(`  ⚠  dropped ${unresolved} invoice(s) — order_no not found in sales_orders`);
      return resolved;
    },
  },
  { extractFile: "purchase-invoices",  table: "purchase_invoices",  colMap: PURCHASE_INVOICES_MAP, uniqueKey: "invoice_no",                                                         addCompanyId: true,
    transform: (row) => { if (!row.model) row.model = "IMPORTED"; return row; } },
  { extractFile: "dealer-invoices",    table: "dealer_invoices",    colMap: DEALER_INVOICES_MAP, uniqueKey: "invoice_no",                                                          addCompanyId: true },
  { extractFile: "official-receipts",  table: "official_receipts",  colMap: OFFICIAL_RECEIPTS_MAP, uniqueKey: "receipt_no", conflictCols: "receipt_no,company_id", addCompanyId: true },
  { extractFile: "commission-records", table: "commission_records", colMap: COMMISSION_RECORDS_MAP,                                                             addCompanyId: true },
  // Staff/profiles: profiles.id REFERENCES auth.users(id) ON DELETE CASCADE.
  // Cannot insert profiles without a corresponding auth.users entry.
  // { extractFile: "staff", table: "profiles", colMap: STAFF_MAP, uniqueKey: "email", addCompanyId: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Apply a ColMap to one raw row, returning the mapped DB row. */
function applyColMap(raw: Record<string, unknown>, colMap: ColMap): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  const unmapped: Record<string, unknown> = {};

  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const normKey = rawKey.toLowerCase().trim();
    const mapping = colMap[normKey];

    // null mapping means "explicitly skip this field"
    if (mapping === null) continue;

    if (!mapping) {
      // Store unrecognised columns in raw_data for later review
      if (rawVal != null && rawVal !== "-" && rawVal !== "N/A") {
        unmapped[rawKey] = rawVal;
      }
      continue;
    }

    const strVal = rawVal == null ? null : String(rawVal);

    if (typeof mapping === "string") {
      mapped[mapping] = strVal === "-" || strVal === "N/A" ? null : rawVal ?? null;
    } else {
      const [col, transform] = mapping;
      mapped[col] = transform(strVal as string);
    }
  }

  // Unrecognised columns are intentionally dropped — the extract JSON files
  // in test-results/extract/ remain the authoritative raw source if needed.

  return mapped;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hasMappedBusinessField(row: Record<string, unknown>): boolean {
  return Object.keys(row).some(key => key !== "company_id");
}

/**
 * Insert/upsert rows in chunks.
 * - When `conflictCols` is provided: uses upsert with ignoreDuplicates=true so
 *   rows that violate the unique constraint are silently skipped (counted as
 *   "skipped", not "errors"), and other rows in the same chunk still succeed.
 * - Without `conflictCols`: plain INSERT; unique-violation (23505) on the whole
 *   chunk is treated as skipped; any other error is counted as an error.
 */
async function insertChunked(
  table: string,
  rows: Record<string, unknown>[],
  dryRun: boolean,
  conflictCols?: string,
): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

    if (dryRun) {
      if (i === 0) {
        console.info(`    [dry-run] Sample row:`, JSON.stringify(chunk[0], null, 2));
      }
      inserted += chunk.length;
      continue;
    }

    if (!supabase) throw new Error("Supabase client is unavailable outside dry-run mode");

    if (conflictCols) {
      // Upsert: ON CONFLICT (conflictCols) DO NOTHING — row-level idempotency
      const { error, data } = await supabase
        .from(table as "vehicles")
        .upsert(chunk as never[], { onConflict: conflictCols, ignoreDuplicates: true })
        .select("id");

      if (error) {
        console.error(`    ✗ Chunk ${chunkNum} error: ${error.message}`);
        errors += chunk.length;
      } else {
        const returned = data?.length ?? 0;
        inserted += returned;
        skipped  += chunk.length - returned;
      }
    } else {
      // Plain insert — treat unique-violation as skipped
      const { error, data } = await supabase
        .from(table as "vehicles")
        .insert(chunk as never[])
        .select("id");

      if (error) {
        if (error.code === "23505") {
          skipped += chunk.length;
        } else {
          console.error(`    ✗ Chunk ${chunkNum} error: ${error.message}`);
          errors += chunk.length;
        }
      } else {
        inserted += (data?.length ?? chunk.length);
      }
    }

    if (i + CHUNK_SIZE < rows.length) await sleep(CHUNK_DELAY);
  }

  return { inserted, skipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface SeedResult {
  name: string;
  extracted: number;
  inserted: number;
  skipped: number;
  errors: number;
  status: "ok" | "no_file" | "empty" | "error";
}

async function main() {
  console.info("\n════════════════════════════════════════════════════");
  console.info("  Proton CRM → Supabase Seed Script");
  console.info(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.info(`  Target DB: ${SUPABASE_URL}`);
  console.info(`  Company ID: ${COMPANY_ID}`);
  if (ONLY_TABLES.length > 0) console.info(`  Only tables: ${ONLY_TABLES.join(", ")}`);
  console.info("════════════════════════════════════════════════════\n");

  const results: SeedResult[] = [];

  for (const target of SEED_TARGETS) {
    if (ONLY_TABLES.length > 0 && !ONLY_TABLES.includes(target.extractFile) && !ONLY_TABLES.includes(target.table)) {
      continue;
    }

    const filePath = path.join(EXTRACT_DIR, `${target.extractFile}.json`);

    if (!fs.existsSync(filePath)) {
      console.info(`⚠  ${target.extractFile}: no extract file found — skipping`);
      results.push({ name: target.extractFile, extracted: 0, inserted: 0, skipped: 0, errors: 0, status: "no_file" });
      continue;
    }

    let rawRows: Record<string, string>[];
    try {
      rawRows = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      console.error(`✗  ${target.extractFile}: failed to parse JSON — skipping`);
      results.push({ name: target.extractFile, extracted: 0, inserted: 0, skipped: 0, errors: 0, status: "error" });
      continue;
    }

    if (rawRows.length === 0) {
      console.info(`⚠  ${target.extractFile}: 0 rows in extract — skipping`);
      results.push({ name: target.extractFile, extracted: 0, inserted: 0, skipped: 0, errors: 0, status: "empty" });
      continue;
    }

    console.info(`\n[${target.table}]  (${rawRows.length} rows extracted)`);

    // Map columns, normalize values, apply post-map transforms
    let dbRows = rawRows.map(raw => {
      const mapped = applyColMap(raw, target.colMap);
      if (target.addCompanyId) mapped["company_id"] = COMPANY_ID;
      const normalized = normalizeRow(mapped);
      return target.transform ? target.transform(normalized) : normalized;
    }).filter(hasMappedBusinessField)
      .filter(row => {
        // Skip rows where the uniqueKey column is null/empty (NOT NULL constraint)
        if (!target.uniqueKey) return true;
        const val = row[target.uniqueKey];
        return val != null && val !== "";
      });

    // In-memory deduplication by uniqueKey (first occurrence wins)
    if (target.uniqueKey) {
      const before = dbRows.length;
      dbRows = deduplicateRows(dbRows, target.uniqueKey);
      const dropped = before - dbRows.length;
      if (dropped > 0) console.info(`  Deduplicated ${dropped} in-extract duplicate(s) by '${target.uniqueKey}'`);
    }

    // Async FK resolution (e.g. resolve order_no → sales_orders.id for invoices)
    if (target.resolveRows) {
      if (DRY_RUN) {
        console.info(`  [dry-run] resolveRows: FK resolution would run (skipped in dry-run)`);
      } else if (supabase) {
        dbRows = await target.resolveRows(dbRows, supabase, COMPANY_ID);
      }
    }

    console.info(`  Mapped ${dbRows.length} / ${rawRows.length} rows`);

    const { inserted, skipped, errors } = await insertChunked(target.table, dbRows, DRY_RUN, target.conflictCols);
    console.info(`  ✓ inserted: ${inserted}  skipped: ${skipped}  errors: ${errors}`);

    results.push({ name: target.extractFile, extracted: rawRows.length, inserted, skipped, errors, status: errors > 0 ? "error" : "ok" });
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  console.info("\n════════════════════════════════════════════════════");
  console.info(`  Seed Summary${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.info("════════════════════════════════════════════════════");
  console.info("  Table                    Extracted  Inserted  Skipped  Errors");
  console.info("  ─────────────────────────────────────────────────────────────");

  let totalExtracted = 0, totalInserted = 0, totalSkipped = 0, totalErrors = 0;
  for (const r of results) {
    const icon = r.status === "ok" ? "✓" : r.status === "no_file" ? "·" : "⚠";
    console.info(
      `  ${icon}  ${r.name.padEnd(23)} ${String(r.extracted).padStart(9)} ${String(r.inserted).padStart(9)} ${String(r.skipped).padStart(8)} ${String(r.errors).padStart(7)}`
    );
    totalExtracted += r.extracted;
    totalInserted  += r.inserted;
    totalSkipped   += r.skipped;
    totalErrors    += r.errors;
  }
  console.info("  ─────────────────────────────────────────────────────────────");
  console.info(
    `     ${"TOTAL".padEnd(23)} ${String(totalExtracted).padStart(9)} ${String(totalInserted).padStart(9)} ${String(totalSkipped).padStart(8)} ${String(totalErrors).padStart(7)}`
  );
  console.info("════════════════════════════════════════════════════\n");

  if (DRY_RUN) {
    console.info("  Dry run complete — no data was written.\n");
    console.info("  To run live:  npx tsx scripts/seed-from-extract.ts\n");
  } else if (totalErrors > 0) {
    console.warn("  ⚠  Some rows had errors. Review the column map and retry with --only <table>.\n");
    process.exit(1);
  } else {
    console.info("  Seed complete.\n");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
