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
if (!SERVICE_KEY) {
  console.error(
    "seed-from-extract: SUPABASE_SERVICE_ROLE_KEY is not set. Export it in your shell or .env before running.",
  );
  process.exit(1);
}
const COMPANY_ID    = process.env.SEED_COMPANY_ID ?? "c1";
const EXTRACT_DIR   = path.resolve(__dirname, "../test-results/extract");
const CHUNK_SIZE    = 50;
const CHUNK_DELAY   = 120; // ms between insert chunks

const DRY_RUN       = process.argv.includes("--dry-run");
const ONLY_FLAG     = process.argv.indexOf("--only");
const ONLY_TABLES   = ONLY_FLAG !== -1 ? process.argv.slice(ONLY_FLAG + 1) : [];

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client — service role, no RLS restrictions
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  [oldHeader: string]: string | [string, Transformer];
}

const toDate = (v: string): string | null => {
  if (!v || v === "-" || v === "N/A") return null;
  // Handle dd/mm/yyyy → yyyy-mm-dd
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v || null;
};

const toNum = (v: string): number | null => {
  const cleaned = v.replace(/[,RM$\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

const toStatus = (v: string): string =>
  v.trim() || "Active";

/** Vehicles (viewChassisFilter / viewStockBalance) */
const VEHICLES_MAP: ColMap = {
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
};

/** Customers */
const CUSTOMERS_MAP: ColMap = {
  "name":           "name",
  "customer name":  "name",
  "ic no":          "ic_no",
  "ic number":      "ic_no",
  "nric":           "ic_no",
  "phone":          "phone",
  "contact no":     "phone",
  "contact number": "phone",
  "email":          "email",
  "address":        "address",
  "notes":          "notes",
  "remark":         "notes",
};

/** Sales Orders */
const SALES_ORDERS_MAP: ColMap = {
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
};

/** Invoices */
const INVOICES_MAP: ColMap = {
  "invoice no":       "invoice_no",
  "invoice number":   "invoice_no",
  "invoice date":     ["invoice_date", toDate],
  "date":             ["invoice_date", toDate],
  "amount":           ["amount", toNum],
  "total":            ["total_amount", toNum],
  "total amount":     ["total_amount", toNum],
  "tax":              ["tax_amount", toNum],
  "payment status":   "payment_status",
  "status":           "payment_status",
  "paid amount":      ["paid_amount", toNum],
  "due date":         ["due_date", toDate],
  "order no":         "sales_order_ref",
  "customer":         "customer_name",
};

/** Dealer Invoices */
const DEALER_INVOICES_MAP: ColMap = {
  "invoice no":     "invoice_no",
  "branch":         "branch_id",
  "dealer":         "dealer_name",
  "dealer name":    "dealer_name",
  "model":          "car_model",
  "car model":      "car_model",
  "colour":         "colour",
  "chassis no":     "chassis_no",
  "chassis number": "chassis_no",
  "sales price":    ["sales_price", toNum],
  "price":          ["sales_price", toNum],
  "date":           ["invoice_date", toDate],
  "invoice date":   ["invoice_date", toDate],
  "status":         ["status", toStatus],
};

/** Official Receipts */
const OFFICIAL_RECEIPTS_MAP: ColMap = {
  "or no":        "or_no",
  "receipt no":   "or_no",
  "date":         ["receipt_date", toDate],
  "amount":       ["amount", toNum],
  "branch":       "branch_id",
  "attachment":   "attachment",
  "verified by":  "verified_by",
  "status":       ["status", toStatus],
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

/** Staff / Users */
const STAFF_MAP: ColMap = {
  "name":       "name",
  "staff name": "name",
  "username":   "username",
  "email":      "email",
  "role":       "role",
  "branch":     "branch_code",
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
  "base price":  ["base_price", toNum],
  "price":       ["base_price", toNum],
};

/** Vehicle Colours */
const COLOURS_MAP: ColMap = {
  "code":         "code",
  "colour code":  "code",
  "name":         "name",
  "colour name":  "name",
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
  "name":             "name",
  "supplier name":    "name",
  "code":             "code",
  "company reg no":   "company_reg_no",
  "reg no":           "company_reg_no",
  "address":          "address",
  "contact no":       "contact_no",
  "phone":            "contact_no",
  "email":            "email",
  "status":           ["status", toStatus],
};

/** Dealers */
const DEALERS_MAP: ColMap = {
  "name":             "name",
  "dealer name":      "name",
  "acc code":         "acc_code",
  "account code":     "acc_code",
  "company reg no":   "company_reg_no",
  "reg no":           "company_reg_no",
  "address":          "address",
  "contact no":       "contact_no",
  "phone":            "contact_no",
  "email":            "email",
  "status":           ["status", toStatus],
};

// ─────────────────────────────────────────────────────────────────────────────
// Seed targets — maps extract file name → DB table + column map
// ─────────────────────────────────────────────────────────────────────────────

interface SeedTarget {
  extractFile:   string;           // filename without .json
  table:         string;           // Supabase table name
  colMap:        ColMap;
  uniqueKey?:    string;           // DB column to use for ON CONFLICT DO NOTHING check
  addCompanyId?: boolean;          // whether to inject company_id
  transform?:    (row: Record<string, unknown>) => Record<string, unknown>; // post-map hook
}

const SEED_TARGETS: SeedTarget[] = [
  // Master data first (no FK deps)
  { extractFile: "branches",           table: "branches",           colMap: BRANCHES_MAP,       uniqueKey: "code",       addCompanyId: true },
  { extractFile: "finance-companies",  table: "finance_companies",  colMap: FINANCE_MAP,         uniqueKey: "code",       addCompanyId: true },
  { extractFile: "insurance-companies",table: "insurance_companies",colMap: INSURANCE_MAP,       uniqueKey: "code",       addCompanyId: true },
  { extractFile: "vehicle-models",     table: "vehicle_models",     colMap: MODELS_MAP,          uniqueKey: "code",       addCompanyId: true },
  { extractFile: "vehicle-colours",    table: "vehicle_colours",    colMap: COLOURS_MAP,         uniqueKey: "code",       addCompanyId: true },
  { extractFile: "payment-types",      table: "payment_types",      colMap: PAYMENT_TYPES_MAP,   uniqueKey: "name",       addCompanyId: true },
  { extractFile: "banks",              table: "banks",              colMap: BANKS_MAP,           uniqueKey: "name",       addCompanyId: true },
  { extractFile: "suppliers",          table: "suppliers",          colMap: SUPPLIERS_MAP,       uniqueKey: "name",       addCompanyId: true },
  { extractFile: "dealers",            table: "dealers",            colMap: DEALERS_MAP,         uniqueKey: "name",       addCompanyId: true },
  // Transactional data (FK deps: vehicles before sales_orders before invoices)
  { extractFile: "vehicles",           table: "vehicles",           colMap: VEHICLES_MAP,        uniqueKey: "chassis_no", addCompanyId: true },
  { extractFile: "customers",          table: "customers",          colMap: CUSTOMERS_MAP,       uniqueKey: undefined,    addCompanyId: true },
  { extractFile: "sales-orders",       table: "sales_orders",       colMap: SALES_ORDERS_MAP,    uniqueKey: undefined,    addCompanyId: true },
  { extractFile: "invoices",           table: "invoices",           colMap: INVOICES_MAP,        uniqueKey: "invoice_no", addCompanyId: true },
  { extractFile: "dealer-invoices",    table: "dealer_invoices",    colMap: DEALER_INVOICES_MAP, uniqueKey: "invoice_no", addCompanyId: true },
  { extractFile: "official-receipts",  table: "official_receipts",  colMap: OFFICIAL_RECEIPTS_MAP, uniqueKey: "or_no",   addCompanyId: true },
  { extractFile: "commission-records", table: "commission_records", colMap: COMMISSION_RECORDS_MAP, uniqueKey: undefined, addCompanyId: true },
  // Staff last (creates profiles; passwords must be reset separately)
  { extractFile: "staff",              table: "profiles",           colMap: STAFF_MAP,           uniqueKey: "email",      addCompanyId: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Apply a ColMap to one raw row, returning the mapped DB row. */
function applyColMap(raw: Record<string, string>, colMap: ColMap): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  const unmapped: Record<string, string> = {};

  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const normKey = rawKey.toLowerCase().trim();
    const mapping = colMap[normKey];

    if (!mapping) {
      // Store unrecognised columns in raw_data for later review
      if (rawVal && rawVal !== "-" && rawVal !== "N/A") {
        unmapped[rawKey] = rawVal;
      }
      continue;
    }

    if (typeof mapping === "string") {
      mapped[mapping] = rawVal === "-" || rawVal === "N/A" ? null : rawVal || null;
    } else {
      const [col, transform] = mapping;
      mapped[col] = transform(rawVal);
    }
  }

  if (Object.keys(unmapped).length > 0) {
    mapped["raw_data"] = unmapped;
  }

  return mapped;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Insert rows in chunks, respecting CHUNK_DELAY between chunks. */
async function insertChunked(
  table: string,
  rows: Record<string, unknown>[],
  dryRun: boolean
): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    if (dryRun) {
      if (i === 0) {
        console.log(`    [dry-run] Sample row:`, JSON.stringify(chunk[0], null, 2));
      }
      inserted += chunk.length;
    } else {
      const { error, data } = await supabase
        .from(table as "vehicles")
        .insert(chunk as never[])
        .select("id");

      if (error) {
        // Duplicate / unique violation — count as skipped rather than error
        if (error.code === "23505") {
          skipped += chunk.length;
        } else {
          console.error(`    ✗ Chunk ${Math.floor(i / CHUNK_SIZE) + 1} error: ${error.message}`);
          errors += chunk.length;
        }
      } else {
        inserted += (data?.length ?? chunk.length);
      }

      if (i + CHUNK_SIZE < rows.length) await sleep(CHUNK_DELAY);
    }
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
  console.log("\n════════════════════════════════════════════════════");
  console.log("  Proton CRM → Supabase Seed Script");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`  Target DB: ${SUPABASE_URL}`);
  console.log(`  Company ID: ${COMPANY_ID}`);
  if (ONLY_TABLES.length > 0) console.log(`  Only tables: ${ONLY_TABLES.join(", ")}`);
  console.log("════════════════════════════════════════════════════\n");

  const results: SeedResult[] = [];

  for (const target of SEED_TARGETS) {
    if (ONLY_TABLES.length > 0 && !ONLY_TABLES.includes(target.extractFile) && !ONLY_TABLES.includes(target.table)) {
      continue;
    }

    const filePath = path.join(EXTRACT_DIR, `${target.extractFile}.json`);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠  ${target.extractFile}: no extract file found — skipping`);
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
      console.log(`⚠  ${target.extractFile}: 0 rows in extract — skipping`);
      results.push({ name: target.extractFile, extracted: 0, inserted: 0, skipped: 0, errors: 0, status: "empty" });
      continue;
    }

    console.log(`\n[${target.table}]  (${rawRows.length} rows extracted)`);

    // Map columns
    const dbRows = rawRows.map(raw => {
      const mapped = applyColMap(raw, target.colMap);
      if (target.addCompanyId) mapped["company_id"] = COMPANY_ID;
      if (target.transform) return target.transform(mapped);
      return mapped;
    }).filter(row => Object.keys(row).length > 1); // drop rows that mapped to nothing

    console.log(`  Mapped ${dbRows.length} / ${rawRows.length} rows`);

    const { inserted, skipped, errors } = await insertChunked(target.table, dbRows, DRY_RUN);
    console.log(`  ✓ inserted: ${inserted}  skipped: ${skipped}  errors: ${errors}`);

    results.push({ name: target.extractFile, extracted: rawRows.length, inserted, skipped, errors, status: errors > 0 ? "error" : "ok" });
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════");
  console.log(`  Seed Summary${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log("════════════════════════════════════════════════════");
  console.log("  Table                    Extracted  Inserted  Skipped  Errors");
  console.log("  ─────────────────────────────────────────────────────────────");

  let totalExtracted = 0, totalInserted = 0, totalSkipped = 0, totalErrors = 0;
  for (const r of results) {
    const icon = r.status === "ok" ? "✓" : r.status === "no_file" ? "·" : "⚠";
    console.log(
      `  ${icon}  ${r.name.padEnd(23)} ${String(r.extracted).padStart(9)} ${String(r.inserted).padStart(9)} ${String(r.skipped).padStart(8)} ${String(r.errors).padStart(7)}`
    );
    totalExtracted += r.extracted;
    totalInserted  += r.inserted;
    totalSkipped   += r.skipped;
    totalErrors    += r.errors;
  }
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log(
    `     ${"TOTAL".padEnd(23)} ${String(totalExtracted).padStart(9)} ${String(totalInserted).padStart(9)} ${String(totalSkipped).padStart(8)} ${String(totalErrors).padStart(7)}`
  );
  console.log("════════════════════════════════════════════════════\n");

  if (DRY_RUN) {
    console.log("  Dry run complete — no data was written.\n");
    console.log("  To run live:  npx tsx scripts/seed-from-extract.ts\n");
  } else if (totalErrors > 0) {
    console.warn("  ⚠  Some rows had errors. Review the column map and retry with --only <table>.\n");
    process.exit(1);
  } else {
    console.log("  Seed complete.\n");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
