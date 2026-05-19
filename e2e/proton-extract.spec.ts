/**
 * READ-ONLY data extraction from the Proton CRM site (https://fookloi.net/proton).
 *
 * SAFETY CONTRACT — this spec NEVER:
 *  - Clicks any button whose label matches the MUTATION_GUARD pattern
 *  - Fills any form field after the initial login
 *  - Sends POST/PUT/DELETE requests deliberately
 *  - Modifies, deletes, creates or exports any remote data
 *
 * OUTPUTS (all written to test-results/extract/):
 *  - vehicles.json
 *  - customers.json
 *  - sales-orders.json
 *  - invoices.json
 *  - purchase-invoices.json
 *  - dealer-invoices.json
 *  - official-receipts.json
 *  - commission-records.json
 *  - staff.json
 *  - sales-advisors.json
 *  - branches.json
 *  - finance-companies.json
 *  - insurance-companies.json
 *  - vehicle-models.json
 *  - vehicle-colours.json
 *  - payment-types.json
 *  - banks.json
 *  - suppliers.json
 *  - dealers.json
 *
 * Each file is a JSON array of raw row objects (keys = table header text).
 * The companion seed-from-extract.ts script maps these to the new DB schema.
 */

import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Paths & constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE             = "https://fookloi.net/proton";
const AUTH_STATE_PATH  = path.resolve(__dirname, "../test-results/proton-extract-auth.json");
const EXTRACT_DIR      = path.resolve(__dirname, "../test-results/extract");

/** Never click buttons/links matching this pattern. */
const MUTATION_GUARD =
  /\b(delete|remove|cancel|create|add\s|new\s|submit|export|upload|import|save|edit|update|modify|approve|reject|confirm|send|print|download)\b/i;

/**
 * Minimum delay in ms between any two page navigations.
 * Keeps the request rate well below what any human would produce.
 */
const MIN_DELAY_MS  = 2_000;
const MAX_DELAY_MS  = 5_000;
/** Max pages to paginate through for a single table (safety cap). */
const MAX_PAGES     = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Target pages — each describes one data source to scrape
// ─────────────────────────────────────────────────────────────────────────────

interface Target {
  /** Output filename (without .json extension) */
  name: string;
  /** URL path relative to BASE */
  url: string;
  /** Optional: try to set the per-page selector to show max rows before scraping */
  showAllSelector?: string;
  /** Optional: if the target page uses tabs, click the tab with this text first */
  tabText?: string;
  /** Fallback URL(s) to try if the primary 404s */
  fallbacks?: string[];
  /** Optional per-target pagination safety cap. */
  maxPages?: number;
  /**
   * Optional action to run after landing on the page but before extraction.
   * Use this for pages that require a filter form submission before showing data.
   */
  filterAction?: (page: Page) => Promise<void>;
  /**
   * Optional: DataTables server-side API endpoint (relative to BASE).
   * When set, extraction is done via a direct API call instead of HTML scraping.
   * The extractor will navigate to `url` first (for auth cookies), then call the API.
   * The response must be JSON with a `data` array.
   */
  apiEndpoint?: string;
}

const EXTRACT_ONLY = new Set(
  (process.env.EXTRACT_ONLY ?? "")
    .split(",")
    .map(name => name.trim())
    .filter(Boolean),
);

const TARGETS: Target[] = [
  // ── Vehicles / Stock ────────────────────────────────────────────────────
  {
    name:        "vehicles",
    url:         "viewInventory.php",
    apiEndpoint: "server_data/stock_balance.php",
  },
  // ── Customers ───────────────────────────────────────────────────────────
  {
    name:     "customers",
    url:      "viewCustomerInfo.php",
    fallbacks: ["customer.php", "customers.php", "prospect.php"],
    maxPages: 250,
  },
  // ── Sales Orders ──────────────────────────────────────────────────────
  {
    name:        "sales-orders",
    url:         "viewSalesBooking.php",
    apiEndpoint: "server_data/customer_sales.php",
  },
  // ── Invoices ────────────────────────────────────────────────────────────
  {
    name:     "invoices",
    url:      "invoiceReport.php",
    fallbacks: ["viewInvoice.php", "invoice.php", "invoices.php"],
  },
  // ── Purchase Invoices ──────────────────────────────────────────────────
  {
    name:     "purchase-invoices",
    url:      "invoiceList.php",
    fallbacks: ["purchaseInvoice.php", "purchaseInvoices.php"],
  },
  // ── Dealer Invoices ─────────────────────────────────────────────────────
  {
    name:     "dealer-invoices",
    url:      "viewDealerInvoice.php",
    fallbacks: ["dealerInvoice.php"],
  },
  // ── Official Receipts ───────────────────────────────────────────────────
  {
    name:     "official-receipts",
    url:      "verifyOR.php",
    fallbacks: ["viewOR.php", "officialReceipt.php"],
  },
  // ── Commission Records ──────────────────────────────────────────────────
  {
    name:     "commission-records",
    url:      "viewCommission.php",
    fallbacks: ["commission.php", "commissions.php"],
  },
  // ── Staff / Users ───────────────────────────────────────────────────────
  {
    name:     "staff",
    url:      "viewStaff.php",
    fallbacks: ["staffList.php", "staff.php", "user.php", "users.php"],
  },
  // ── Sales Advisors ─────────────────────────────────────────────────────
  {
    name:     "sales-advisors",
    url:      "viewSalesAdvisor.php",
    fallbacks: ["salesAdvisor.php", "viewSalesman.php", "salesman.php"],
  },
  // ── Branches ────────────────────────────────────────────────────────────
  {
    name:     "branches",
    url:      "viewBranch.php",
    fallbacks: ["branch.php", "branches.php"],
  },
  // ── Finance Companies ───────────────────────────────────────────────────
  {
    name:     "finance-companies",
    url:      "viewFinanceCompany.php",
    fallbacks: ["financeCompany.php", "finance.php"],
  },
  // ── Insurance Companies ─────────────────────────────────────────────────
  {
    name:     "insurance-companies",
    url:      "viewInsuranceCompany.php",
    fallbacks: ["viewInsurance.php", "insurance.php", "insuranceCompany.php"],
  },
  // ── Vehicle Models ──────────────────────────────────────────────────────
  {
    name:     "vehicle-models",
    url:      "viewVehicleModel.php",
    fallbacks: ["viewModel.php", "model.php", "vehicleModel.php"],
  },
  // ── Vehicle Colours ─────────────────────────────────────────────────────
  {
    name:     "vehicle-colours",
    url:      "viewVehicleColor.php",
    fallbacks: ["viewColour.php", "colour.php", "color.php"],
  },
  // ── Payment Types ───────────────────────────────────────────────────────
  {
    name:     "payment-types",
    url:      "viewPaymentType.php",
    fallbacks: ["paymentType.php", "payment.php"],
  },
  // ── Banks ───────────────────────────────────────────────────────────────
  {
    name:     "banks",
    url:      "viewBank.php",
    fallbacks: ["bank.php", "banks.php"],
  },
  // ── Suppliers ───────────────────────────────────────────────────────────
  {
    name:     "suppliers",
    url:      "viewSupplier.php",
    fallbacks: ["supplier.php", "suppliers.php"],
  },
  // ── Dealers ─────────────────────────────────────────────────────────────
  {
    name:     "dealers",
    url:      "viewDealer.php",
    fallbacks: ["dealer.php", "dealers.php"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Polite random delay — simulates human reading time between page loads. */
function politeDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Write (or merge) rows into an output JSON file. */
function writeExtract(name: string, rows: Record<string, string>[]) {
  const outPath = path.join(EXTRACT_DIR, `${name}.json`);
  let existing: Record<string, string>[] = [];
  if (fs.existsSync(outPath)) {
    try { existing = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { /* fresh file */ }
  }
  const merged = [...existing, ...rows];
  const deduped = Array.from(new Map(merged.map(row => [JSON.stringify(row), row])).values());
  fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2), "utf8");
  console.log(`  ✓ ${name}: wrote ${rows.length} rows (total ${deduped.length} in file)`);
}

/**
 * Extract all <tbody> rows from all <table> elements on the current page.
 * Uses <th> / <thead td> as column keys.  Each table's rows are returned
 * as an array of {header: cellText} objects.
 */
async function extractTableRows(page: Page): Promise<Record<string, string>[]> {
  return page.evaluate(() => {
    const results: Record<string, string>[] = [];

    document.querySelectorAll("table").forEach(table => {
      // Derive headers from <th> or first <tr> in <thead>
      const headerCells = Array.from(
        table.querySelectorAll("thead th, thead td, tr:first-child th")
      );
      const headers = headerCells.map(th => th.textContent?.trim() ?? "").filter(Boolean);
      if (headers.length === 0) return; // skip tables with no identifiable headers

      // Extract body rows
      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      bodyRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.length === 0) return; // skip empty / loading rows
        const obj: Record<string, string> = {};
        cells.forEach((cell, idx) => {
          const key = headers[idx] ?? `col_${idx}`;
          obj[key] = cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
        });
        if (Object.values(obj).some(value => /no data available in table/i.test(value))) return;
        results.push(obj);
      });
    });

    return results;
  });
}

/**
 * Try to set the page-size dropdown to its maximum value (100/200/All)
 * so we get as many rows as possible per page load.
 */
async function tryMaxPageSize(page: Page): Promise<void> {
  try {
    // DataTables-style length select
    const lengthSelect = page.locator("select[name$='_length'], select.dataTables_length, select[name='pageSize']").first();
    if (await lengthSelect.isVisible({ timeout: 2_000 })) {
      // Pick the largest numeric option
      const options = await lengthSelect.locator("option").allInnerTexts();
      const nums = options.map(o => parseInt(o.replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
      if (nums.length > 0) {
        const max = Math.max(...nums);
        await lengthSelect.selectOption({ label: String(max) }).catch(async () => {
          await lengthSelect.selectOption({ value: String(max) });
        });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(1_000);
      }
    }
  } catch {
    // Not a DataTables page — ignore
  }
}

async function waitForTableRows(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page
    .locator("table tbody tr")
    .first()
    .waitFor({ state: "attached", timeout: 15_000 })
    .catch(() => undefined);
}

/**
 * Detect whether the page has a "Next" pagination button that is not disabled,
 * and click it if so. Returns true if we navigated forward, false otherwise.
 */
async function clickNextPage(page: Page): Promise<boolean> {
  try {
    // DataTables / Bootstrap pagination patterns
    const nextBtn = page.locator(
      "a.paginate_button.next:not(.disabled), " +
      "li.next:not(.disabled) > a, " +
      "button.next:not(:disabled), " +
      "a[aria-label='Next'], " +
      ".pagination .next:not(.disabled) a"
    ).first();

    if (!(await nextBtn.isVisible({ timeout: 1_500 }))) return false;

    const text = (await nextBtn.textContent() ?? "").toLowerCase();
    if (MUTATION_GUARD.test(text)) return false; // shouldn't match "next" but be safe

    await nextBtn.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1_500); // let the table re-render
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch all records from a DataTables server-side JSON API endpoint.
 * Navigates to `target.url` first (to establish the auth-cookie context),
 * then calls the API with length=99999 to get all records in one shot.
 *
 * Returns the number of rows extracted.
 */
async function extractApiTarget(page: Page, target: Target): Promise<number> {
  // Land on the parent page first (ensures cookies are scoped)
  await politeDelay();
  const resp = await page.goto(`${BASE}/${target.url}`, { waitUntil: "domcontentloaded" }).catch(() => null);
  const finalUrl = page.url();
  if (finalUrl.includes("sign-in") || finalUrl.includes("login")) {
    console.log(`  ↩  Session expired — cannot extract ${target.name}`);
    return 0;
  }
  if (resp && resp.status() === 404) {
    console.log(`  ✗ 404 for ${target.url}`);
    return 0;
  }
  console.log(`  → ${target.url} (${resp?.status() ?? "?"})`);

  // Dismiss any DataTables JS dialogs that may have fired
  page.once("dialog", d => d.accept().catch(() => undefined));
  await page.waitForTimeout(1_000);

  // Call the DataTables AJAX endpoint directly from within the page context
  // (so session cookies are automatically included)
  const apiUrl = `${BASE}/${target.apiEndpoint}`;
  const allRows: Record<string, unknown>[] = await page.evaluate(async (url: string) => {
    // First, get the total record count
    const r0 = await fetch(`${url}?draw=1&start=0&length=1`, { credentials: "include" });
    if (!r0.ok) throw new Error(`API returned ${r0.status}`);
    const j0 = await r0.json() as { recordsTotal?: number; data?: unknown[] };
    const total = j0.recordsTotal ?? j0.data?.length ?? 0;
    if (total === 0) return [];
    // Fetch all records in one request
    const r1 = await fetch(`${url}?draw=2&start=0&length=${total + 100}`, { credentials: "include" });
    if (!r1.ok) throw new Error(`API returned ${r1.status} on full fetch`);
    const j1 = await r1.json() as { data?: unknown[] };
    return (j1.data ?? []) as Record<string, unknown>[];
  }, apiUrl);

  console.log(`    api: ${allRows.length} rows`);

  if (allRows.length > 0) {
    writeExtract(target.name, allRows as Record<string, string>[]);
  } else {
    console.log(`  ⚠ No data returned from API for "${target.name}"`);
  }
  return allRows.length;
}

/**
 * Navigate to a target URL (with fallbacks), extract all paginated table data,
 * and write the result to EXTRACT_DIR/{name}.json.
 *
 * Returns the number of rows extracted (0 if page was unreachable or had no table).
 */
async function extractTarget(page: Page, target: Target): Promise<number> {
  // If an API endpoint is configured, use it directly — much faster and more complete
  if (target.apiEndpoint) {
    return extractApiTarget(page, target);
  }

  const urls = [target.url, ...(target.fallbacks ?? [])];
  let landed = false;

  for (const slug of urls) {
    await politeDelay();
    try {
      const response = await page.goto(`${BASE}/${slug}`, { waitUntil: "domcontentloaded" });
      const finalUrl = page.url();

      // Redirected to login — try to recover (session may have expired)
      if (finalUrl.includes("sign-in") || finalUrl.includes("login")) {
        console.log(`  ↩  Session expired on ${slug} — not retrying login in this step`);
        return 0;
      }

      if (!response || response.status() === 404) {
        console.log(`  ✗ 404 for ${slug} — trying fallback`);
        continue;
      }

      landed = true;
      console.log(`  → ${slug} (${response.status()})`);
      await waitForTableRows(page);
      break;
    } catch (err) {
      console.log(`  ✗ Error loading ${slug}: ${(err as Error).message}`);
    }
  }

  if (!landed) {
    console.log(`  ⚠ No reachable URL found for "${target.name}" — skipping`);
    return 0;
  }

  // Run the filter action if the page needs it (e.g. filter-form pages)
  if (target.filterAction) {
    await target.filterAction(page);
  }

  // Click a specific tab if required
  if (target.tabText) {
    try {
      await page.locator(`text="${target.tabText}"`).first().click();
      await page.waitForTimeout(1_000);
    } catch { /* tab not found — proceed with default view */ }
  }

  // Set page size to maximum
  await tryMaxPageSize(page);
  await waitForTableRows(page);

  // Paginate and collect all rows
  const allRows: Record<string, string>[] = [];
  let pageNum = 0;

  const maxPages = target.maxPages ?? MAX_PAGES;
  for (let i = 0; i < maxPages; i++) {
    const rows = await extractTableRows(page);
    allRows.push(...rows);
    pageNum++;
    console.log(`    page ${pageNum}: ${rows.length} rows`);

    const hasNext = await clickNextPage(page);
    if (!hasNext) break;
    await politeDelay();
  }

  if (allRows.length > 0) {
    writeExtract(target.name, allRows);
  } else {
    console.log(`  ⚠ No table data found for "${target.name}"`);
  }

  return allRows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractSummary {
  name: string;
  rows: number;
  status: "ok" | "empty" | "skipped";
}

let summary: ExtractSummary[] = [];

test.describe("Proton CRM — Data Extraction", () => {
  // ── Step 1: Login ───────────────────────────────────────────────────────
  test("Step 1 — Authenticate", async ({ page }) => {
    ensureDir(EXTRACT_DIR);
    ensureDir(path.dirname(AUTH_STATE_PATH));

    await page.goto(`${BASE}/sign-in.php`, { waitUntil: "domcontentloaded" });

    await page.locator('input[name="staffName"]').fill("JAMRI");
    await page.locator('input[name="staffpwd"]').fill("flit@dmin");
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/index\.php|(?<!sign-in)/, { timeout: 30_000 });
    console.log(`✓ Authenticated — at: ${page.url()}`);

    await page.context().storageState({ path: AUTH_STATE_PATH });
  });

  // ── Step 2: Extract all data pages ─────────────────────────────────────
  test("Step 2 — Extract table data from all pages", async ({ browser }) => {
    test.setTimeout(1_800_000); // up to 30 minutes — we're being polite

    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
    });
    const page = await context.newPage();

    summary = [];

    const targets = EXTRACT_ONLY.size > 0
      ? TARGETS.filter(target => EXTRACT_ONLY.has(target.name))
      : TARGETS;

    for (const target of targets) {
      console.log(`\n[${target.name}]`);
      const rows = await extractTarget(page, target);
      summary.push({
        name:   target.name,
        rows,
        status: rows > 0 ? "ok" : "empty",
      });
    }

    await context.close();

    // Print summary table
    console.log("\n══════════════════════════════════════════");
    console.log("  Extraction Summary");
    console.log("══════════════════════════════════════════");
    let totalRows = 0;
    for (const s of summary) {
      const icon = s.status === "ok" ? "✓" : "⚠";
      console.log(`  ${icon}  ${s.name.padEnd(25)} ${String(s.rows).padStart(6)} rows`);
      totalRows += s.rows;
    }
    console.log("──────────────────────────────────────────");
    console.log(`     ${"TOTAL".padEnd(25)} ${String(totalRows).padStart(6)} rows`);
    console.log("══════════════════════════════════════════\n");

    // Write a summary manifest
    const manifestPath = path.join(EXTRACT_DIR, "_manifest.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ extractedAt: new Date().toISOString(), totalRows, targets: summary }, null, 2),
      "utf8"
    );
    console.log(`  Manifest written to ${manifestPath}`);
  });
});
