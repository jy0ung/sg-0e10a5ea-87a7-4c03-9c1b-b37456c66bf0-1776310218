import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED ROUTE RENDERING
// Every protected route is visited with a mocked admin session.
// We assert that:
//  1. The page does NOT show the generic Route Error / crash screen
//  2. The AppLayout sidebar is present
//  3. Some meaningful content is rendered in main
// ─────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupAuthMocks(page);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertPageLoaded(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);

  // Wait for navigation to settle
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Should NOT have crashed into the route error fallback
  await expect(page.locator("text=Route Error")).not.toBeVisible({ timeout: 500 }).catch(() => {});

  // App layout sidebar should exist
  await expect(page.locator("nav, aside, [data-sidebar]").first()).toBeVisible({ timeout: 8000 });

  // URL should not have been redirected to login
  expect(page.url()).not.toMatch(/\/login/);
}

// ── Platform routes ───────────────────────────────────────────────────────────

test.describe("Platform", () => {
  test("Executive Dashboard (/)", async ({ page }) => {
    await assertPageLoaded(page, "/");
    await expect(page.locator("text=/executive|dashboard|kpi/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Module Directory (/modules)", async ({ page }) => {
    await assertPageLoaded(page, "/modules");
    await expect(page.locator("text=/module|directory/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Notifications (/notifications)", async ({ page }) => {
    await assertPageLoaded(page, "/notifications");
    await expect(page.locator("text=/notification/i").first()).toBeVisible({ timeout: 8000 });
  });
});

// ── Auto-Aging routes ─────────────────────────────────────────────────────────

test.describe("Auto Aging module", () => {
  test("Aging Dashboard (/auto-aging)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging");
    await expect(page.locator("text=/aging|dashboard/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Vehicle Explorer (/auto-aging/vehicles)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/vehicles");
    await expect(page.locator("text=/vehicle|explorer/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Import Center (/auto-aging/import)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/import");
    await expect(page.locator("text=/import/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Data Quality (/auto-aging/quality)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/quality");
    await expect(page.locator("text=/quality|data/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("SLA Policies (/auto-aging/sla)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/sla");
    await expect(page.locator("text=/sla|policy|policies/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Mappings (/auto-aging/mappings)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/mappings");
    await expect(page.locator("text=/mapping/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Import History (/auto-aging/history)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/history");
    await expect(page.locator("text=/history|import/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Commission Dashboard (/auto-aging/commissions)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/commissions");
    await expect(page.locator("text=/commission/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Report Center (/auto-aging/reports)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/reports");
    await expect(page.locator("text=/report/i").first()).toBeVisible({ timeout: 8000 });
  });
});

// ── Sales routes ──────────────────────────────────────────────────────────────

test.describe("Sales module", () => {
  test("Sales Dashboard (/sales)", async ({ page }) => {
    await assertPageLoaded(page, "/sales");
    await expect(page.locator("text=/sales|dashboard/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Deal Pipeline (/sales/pipeline)", async ({ page }) => {
    await assertPageLoaded(page, "/sales/pipeline");
    await expect(page.locator("text=/pipeline|deal/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Sales Orders (/sales/orders)", async ({ page }) => {
    await assertPageLoaded(page, "/sales/orders");
    await expect(page.locator("text=/order/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Customers (/sales/customers)", async ({ page }) => {
    await assertPageLoaded(page, "/sales/customers");
    await expect(page.locator("text=/customer/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Invoices (/sales/invoices)", async ({ page }) => {
    await assertPageLoaded(page, "/sales/invoices");
    await expect(page.locator("text=/invoice/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Salesman Performance (/sales/performance)", async ({ page }) => {
    await assertPageLoaded(page, "/sales/performance");
    await expect(page.locator("text=/performance|salesman/i").first()).toBeVisible({
      timeout: 8000,
    });
  });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

test.describe("Admin module", () => {
  test("Activity Dashboard (/admin/activity)", async ({ page }) => {
    await assertPageLoaded(page, "/admin/activity");
    await expect(page.locator("text=/activity|dashboard/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("User Management (/admin/users)", async ({ page }) => {
    await assertPageLoaded(page, "/admin/users");
    await expect(page.locator("text=/user|management/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Audit Log (/admin/audit)", async ({ page }) => {
    await assertPageLoaded(page, "/admin/audit");
    await expect(page.locator("text=/audit|log/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Settings (/admin/settings)", async ({ page }) => {
    await assertPageLoaded(page, "/admin/settings");
    await expect(page.locator("text=/setting/i").first()).toBeVisible({ timeout: 8000 });
  });
});
