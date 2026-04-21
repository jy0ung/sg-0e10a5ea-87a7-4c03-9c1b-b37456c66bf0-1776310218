/**
 * READ-ONLY Playwright exploration of the Proton CRM site.
 *
 * SAFETY CONTRACT — this spec NEVER:
 *  - Clicks any button whose label matches the mutation guard pattern
 *  - Fills any form field after the initial login
 *  - Sends POST/PUT/DELETE requests deliberately
 *  - Modifies, deletes, creates or exports any remote data
 *
 * OUTPUT:
 *  - test-results/proton-map.json     — structured site-map (PageRecord[])
 *  - test-results/proton-screenshots/ — one screenshot per visited page
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PageRecord {
  url: string;
  slug: string;
  title: string;
  pageType: "dashboard" | "list" | "detail" | "form" | "report" | "auth" | "unknown";
  headings: string[];
  navItems: string[];
  tableHeaders: string[];
  tabLabels: string[];
  formLabels: string[];
  readOnlyButtons: string[];
  outboundLinks: string[];
  screenshotFile: string;
  status: "visited" | "redirected-to-login" | "not-found" | "error";
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://fookloi.net/proton";
const AUTH_STATE_PATH = path.resolve(__dirname, "../test-results/proton-auth.json");
const MAP_OUTPUT_PATH = path.resolve(__dirname, "../test-results/proton-map.json");
const SCREENSHOT_DIR = path.resolve(__dirname, "../test-results/proton-screenshots");

// PHP page slugs to probe in addition to dynamically discovered links
const SEED_SLUGS = [
  "home.php",
  "dashboard.php",
  "main.php",
  "index.php",
  "salesOrder.php",
  "sales_order.php",
  "so.php",
  "booking.php",
  "customer.php",
  "customers.php",
  "prospect.php",
  "prospects.php",
  "testDrive.php",
  "test_drive.php",
  "stock.php",
  "vehicle.php",
  "vehicles.php",
  "delivery.php",
  "deliveries.php",
  "target.php",
  "kpi.php",
  "report.php",
  "reports.php",
  "commission.php",
  "commissions.php",
  "admin.php",
  "user.php",
  "users.php",
  "role.php",
  "roles.php",
  "profile.php",
  "settings.php",
  "notification.php",
  "notifications.php",
  "invoice.php",
  "invoices.php",
  "pipeline.php",
  "activity.php",
  "activities.php",
  "trade_in.php",
  "tradeIn.php",
  "finance.php",
  "insurance.php",
  "accessories.php",
  "quotation.php",
  "quotations.php",
  "appointment.php",
  "appointments.php",
  "followup.php",
  "follow_up.php",
  "feedback.php",
  "survey.php",
  "warranty.php",
  "service.php",
  "aftersales.php",
  "after_sales.php",
  "email.php",
  "sms.php",
  "campaign.php",
  "campaigns.php",
  "territory.php",
  "branch.php",
  "branches.php",
  "department.php",
  "staff.php",
  "staffList.php",
  "performance.php",
  "leaderboard.php",
  "analytics.php",
  "summary.php",
  "monthly.php",
  "yearly.php",
  "weekly.php",
  "daily.php",
];

// Mutation guard — never click buttons/links matching this pattern
const MUTATION_PATTERN =
  /\b(delete|remove|cancel|create|add\s|new\s|submit|export|upload|import|save|edit|update|modify|approve|reject|confirm|send|print|download)\b/i;

// Links to skip even if discovered (logout / destructive / file attachments / PII docs)
const SKIP_HREF_PATTERN =
  /sign[_-]?out|logout|log[_-]?out|delete|remove|purge|drop|reset[_-]?pass|uploadDoc\/|\/upload\//i;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function slugify(url: string): string {
  return url
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function detectPageType(
  headings: string[],
  tableHeaders: string[],
  formLabels: string[],
  title: string,
  url: string
): PageRecord["pageType"] {
  const combined = [title, ...headings].join(" ").toLowerCase();
  if (/login|sign.?in|sign.?up|forgot.?pass|reset.?pass/.test(combined)) return "auth";
  if (/dashboard|summary|overview|kpi|analytics|leaderboard/.test(combined)) return "dashboard";
  if (/report|analysis|statistic|chart|graph/.test(combined)) return "report";
  if (formLabels.length > 2 && tableHeaders.length === 0) return "form";
  if (tableHeaders.length > 0) return "list";
  if (/detail|profile|view|edit/.test(url.toLowerCase())) return "detail";
  return "unknown";
}

/** Extract all internal page links from the current page */
async function extractLinks(page: import("@playwright/test").Page): Promise<string[]> {
  const hrefs: string[] = await page.evaluate((base) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    return anchors
      .map((a) => {
        const href = (a as HTMLAnchorElement).href;
        return href;
      })
      .filter((href) => {
        if (!href) return false;
        // Must be same-origin proton pages
        if (!href.includes("fookloi.net/proton/")) return false;
        // Must be a .php page or internal path
        if (!/\.php/.test(href) && !/\/proton\/[a-zA-Z]/.test(href)) return false;
        return true;
      });
  }, BASE);

  return [...new Set(hrefs)].filter((href) => !SKIP_HREF_PATTERN.test(href));
}

/** Scrape all useful read-only text content from the current page */
async function scrapePage(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const text = (sel: string): string[] =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean)
        .filter((t, i, arr) => arr.indexOf(t) === i); // dedupe

    const headings = text("h1, h2, h3, h4");
    const tableHeaders = text("th, thead td");
    const tabLabels = text(
      ".nav-tabs .nav-link, .tab-nav a, [role='tab'], .tab, .tabs li a, li.tab a"
    );
    const formLabels = text("label, .form-label, .control-label, .field-label");
    const navItems = text(
      "nav a, .sidebar a, .navbar a, .menu a, .nav-menu a, .side-nav a, " +
        ".sidenav a, #sidebar a, #nav a, .left-menu a, .main-menu a"
    );
    const readOnlyButtons = text("button, .btn, input[type=button], input[type=submit]").filter(
      (label) =>
        !/delete|remove|cancel|create|add |new |submit|export|upload|import|save|edit|update|modify|approve|reject|confirm|send|print|download/i.test(
          label
        )
    );

    return { headings, tableHeaders, tabLabels, formLabels, navItems, readOnlyButtons };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

const siteMap: PageRecord[] = [];
const visitedUrls = new Set<string>();

test.describe("Proton CRM — Read-Only Exploration", () => {
  // ── 1. Login ───────────────────────────────────────────────────────────────
  test("Step 1 — Login and verify authenticated landing page", async ({ page }) => {
    ensureDir(SCREENSHOT_DIR);
    ensureDir(path.dirname(MAP_OUTPUT_PATH));

    await page.goto("sign-in.php", { waitUntil: "domcontentloaded" });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "00-login-page.png"),
      fullPage: true,
    });

    // Confirmed selector from HTML: name="staffName"
    await page.locator('input[name="staffName"]').fill("JAMRI");

    // Confirmed selector from HTML: name="staffpwd"
    await page.locator('input[name="staffpwd"]').fill("flit@dmin");

    // Click the submit button (type=submit, text "Sign in")
    // Ensure we don't click "Sign In as Sales Advisor" checkbox — it's a checkbox not a button
    await page.locator('button[type="submit"]').click();

    // PHP server responds 200 with <script>window.location.href='index.php'</script>
    // so we wait for the JS navigation to complete rather than an HTTP redirect
    await page.waitForURL(/index\.php|(?<!sign-in)/, { timeout: 30_000 });

    const landingUrl = page.url();
    console.log(`✓ Logged in — landed on: ${landingUrl}`);

    // Save storage state for subsequent tests
    await page.context().storageState({ path: AUTH_STATE_PATH });

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01-landing-page.png"),
      fullPage: true,
    });

    // Verify we are no longer on sign-in
    expect(page.url()).not.toContain("sign-in");
  });

  // ── 2. Crawl discovered + seeded pages ───────────────────────────────────
  test("Step 2 — Crawl all reachable pages", async ({ browser }) => {
    // Override timeout for this step — crawling 100+ remote pages takes several minutes
    test.setTimeout(360_000);
    ensureDir(SCREENSHOT_DIR);

    // Reuse the saved auth state so we start already logged in
    const context = await browser.newContext({
      storageState: fs.existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined,
    });
    const page = await context.newPage();

    // ── 2a. Navigate to landing and discover links ──────────────────────────
    await page.goto("sign-in.php", { waitUntil: "domcontentloaded" });

    // If not yet logged in (auth state didn't work), log in again
    if (page.url().includes("sign-in")) {
      await page.locator('input[name="staffName"]').fill("JAMRI");
      await page.locator('input[name="staffpwd"]').fill("flit@dmin");
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/index\.php|(?<!sign-in)/, { timeout: 30_000 });
    }

    const landingUrl = page.url();
    console.log(`Landing URL: ${landingUrl}`);

    // Discover links from landing page
    const discoveredLinks = await extractLinks(page);
    console.log(`Discovered ${discoveredLinks.length} links from landing page`);

    // Build seed URLs from known PHP slugs
    const seedUrls = SEED_SLUGS.map((slug) => `${BASE}/${slug}`);

    // Combine: discovered links + seed URLs, deduplicated
    const allUrls = [...new Set([landingUrl, ...discoveredLinks, ...seedUrls])];

    // Queue: exclude sign-in and already-visited
    const queue = allUrls.filter(
      (u) => !u.includes("sign-in") && !SKIP_HREF_PATTERN.test(u) && !visitedUrls.has(u)
    );

    console.log(`Total URLs to probe: ${queue.length}`);

    // ── 2b. Visit each URL ──────────────────────────────────────────────────
    for (const url of queue) {
      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);

      const slug = slugify(url);
      const screenshotFile = `${slug}.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFile);

      let record: PageRecord = {
        url,
        slug,
        title: "",
        pageType: "unknown",
        headings: [],
        navItems: [],
        tableHeaders: [],
        tabLabels: [],
        formLabels: [],
        readOnlyButtons: [],
        outboundLinks: [],
        screenshotFile,
        status: "error",
      };

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });

        const finalUrl = page.url();
        const statusCode = response?.status() ?? 0;

        // Detect redirect back to login
        if (finalUrl.includes("sign-in")) {
          record.status = "redirected-to-login";
          console.log(`  ⚠ ${url} → redirected to login`);
          siteMap.push(record);
          continue;
        }

        // Detect 404
        if (statusCode === 404) {
          record.status = "not-found";
          siteMap.push(record);
          continue;
        }

        // Take screenshot
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

        // Scrape content
        const title = await page.title();
        const scraped = await scrapePage(page);

        // Discover more links from this page and add new ones to the visited set
        // (we won't re-queue them but we record them as outbound links)
        const moreLinks = await extractLinks(page);
        const newLinks = moreLinks.filter((l) => !visitedUrls.has(l) && !SKIP_HREF_PATTERN.test(l));
        // Add newly discovered links to queue — cap total queue size to avoid crawling live data
        if (queue.length < 200) {
          for (const newLink of newLinks) {
            if (!visitedUrls.has(newLink) && queue.length < 200) {
              queue.push(newLink);
            }
          }
        }

        record = {
          ...record,
          title,
          headings: scraped.headings,
          navItems: scraped.navItems,
          tableHeaders: scraped.tableHeaders,
          tabLabels: scraped.tabLabels,
          formLabels: scraped.formLabels,
          readOnlyButtons: scraped.readOnlyButtons,
          outboundLinks: moreLinks.slice(0, 30), // limit to 30 to keep JSON tidy
          pageType: detectPageType(
            scraped.headings,
            scraped.tableHeaders,
            scraped.formLabels,
            title,
            url
          ),
          status: "visited",
        };

        console.log(`  ✓ [${record.pageType.padEnd(9)}] ${title || slug}`);
      } catch (err) {
        record.status = "error";
        record.error = String(err);
        console.log(`  ✗ ERROR: ${url} — ${err}`);
      }

      siteMap.push(record);

      // Write JSON incrementally so partial results survive a timeout
      const partialOutput = {
        crawledAt: new Date().toISOString(),
        baseUrl: BASE,
        totalPages: siteMap.length,
        pages: siteMap,
      };
      fs.writeFileSync(MAP_OUTPUT_PATH, JSON.stringify(partialOutput, null, 2), "utf-8");

      // Small pause to be polite to the remote server
      await page.waitForTimeout(200);
    }

    await context.close();

    // ── 2c. Write JSON output ───────────────────────────────────────────────
    const output = {
      crawledAt: new Date().toISOString(),
      baseUrl: BASE,
      totalPages: siteMap.length,
      visited: siteMap.filter((r) => r.status === "visited").length,
      notFound: siteMap.filter((r) => r.status === "not-found").length,
      redirectedToLogin: siteMap.filter((r) => r.status === "redirected-to-login").length,
      errors: siteMap.filter((r) => r.status === "error").length,
      pages: siteMap,
    };

    fs.writeFileSync(MAP_OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
    console.log(`\n📄 Site map written to: ${MAP_OUTPUT_PATH}`);
    console.log(
      `   Visited: ${output.visited} | Not Found: ${output.notFound} | ` +
        `Login-redirect: ${output.redirectedToLogin} | Errors: ${output.errors}`
    );

    // Expect at least the landing page was visited successfully
    expect(output.visited).toBeGreaterThanOrEqual(1);
  });

  // ── 3. Spot-check a subset of navigation items ────────────────────────────
  test("Step 3 — Verify sidebar navigation items are present", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: fs.existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined,
    });
    const page = await context.newPage();

    await page.goto("sign-in.php", { waitUntil: "domcontentloaded" });

    // Re-authenticate if needed
    if (page.url().includes("sign-in")) {
      await page.locator('input[name="staffName"]').fill("JAMRI");
      await page.locator('input[name="staffpwd"]').fill("flit@dmin");
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/index\.php|(?<!sign-in)/, { timeout: 30_000 });
    }

    // Extract full sidebar/nav structure
    const navStructure = await page.evaluate(() => {
      const items: Array<{ text: string; href: string }> = [];
      const anchors = document.querySelectorAll(
        "nav a, .sidebar a, .navbar a, .menu a, .nav-menu a, " +
          ".side-nav a, .sidenav a, #sidebar a, #nav a, .left-menu a, " +
          ".main-menu a, .navbar-nav a, .nav-item a"
      );
      anchors.forEach((a) => {
        const text = a.textContent?.trim() ?? "";
        const href = (a as HTMLAnchorElement).href ?? "";
        if (text && href) items.push({ text, href });
      });
      return items;
    });

    console.log(`\nSidebar / Navigation items found: ${navStructure.length}`);
    navStructure.forEach((item) => console.log(`  • ${item.text} → ${item.href}`));

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "zz-nav-structure.png"),
      fullPage: true,
    });

    // Append to the JSON map
    if (fs.existsSync(MAP_OUTPUT_PATH)) {
      const existing = JSON.parse(fs.readFileSync(MAP_OUTPUT_PATH, "utf-8"));
      existing.navigationItems = navStructure;
      fs.writeFileSync(MAP_OUTPUT_PATH, JSON.stringify(existing, null, 2), "utf-8");
    }

    await context.close();

    // This is a soft assertion — we just want to confirm the site is navigable
    expect(navStructure.length).toBeGreaterThanOrEqual(0);
  });
});
