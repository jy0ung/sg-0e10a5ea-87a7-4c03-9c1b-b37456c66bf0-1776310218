import { test, expect } from "@playwright/test";
import { MOCK_PROFILE, SUPABASE_URL, setupAuthMocks } from "./helpers/auth-mock";

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
  await page.goto(path, { waitUntil: "domcontentloaded" });

  // Should NOT have crashed into the route error fallback
  await expect(page.locator("text=Route Error")).not.toBeVisible();

  // App layout sidebar should exist
  await expect(page.locator("nav, aside, [data-sidebar]").first()).toBeVisible({ timeout: 8000 });

  // URL should not have been redirected to login
  expect(page.url()).not.toMatch(/\/login/);
}

// ── Platform routes ───────────────────────────────────────────────────────────

test.describe("Platform", () => {
  test("Home (/) redirects to /home", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/home$/, { timeout: 8000 });
    await expect(page.locator("text=/welcome|home|kpi/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Home (/home)", async ({ page }) => {
    await assertPageLoaded(page, "/home");
    await expect(page.locator("text=/welcome|home|kpi/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Legacy /modules redirects to /home", async ({ page }) => {
    await page.goto("/modules", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/home$/, { timeout: 8000 });
  });

  test("Notifications (/notifications)", async ({ page }) => {
    await assertPageLoaded(page, "/notifications");
    await expect(page.locator("text=/notification/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("My Account routes keep personal controls outside Admin Settings", async ({ page }) => {
    await assertPageLoaded(page, "/profile");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
    await expect(page.getByLabel('Display Name')).toBeVisible();

    await page.getByRole('navigation', { name: 'My Account' }).getByRole('link', { name: 'Security' }).click();
    await expect(page).toHaveURL(/\/profile\/security$/);
    await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();

    await page.getByRole('navigation', { name: 'My Account' }).getByRole('link', { name: 'Notifications' }).click();
    await expect(page).toHaveURL(/\/profile\/notifications$/);
    await expect(page.getByRole('heading', { name: 'Push Notifications' })).toBeVisible();
  });

  test("My Profile warns before leaving an unsaved edit", async ({ page }) => {
    await assertPageLoaded(page, "/profile");
    const name = page.getByLabel('Display Name');
    await name.fill('Unsaved profile name');
    await page.getByRole('navigation', { name: 'My Account' }).getByRole('link', { name: 'Security' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Unsaved changes');
    await page.getByRole('button', { name: 'Stay and save' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(name).toHaveValue('Unsaved profile name');
  });

  test("a non-admin opening legacy Settings reaches My Profile", async ({ page }) => {
    await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, route => {
      const wantsSingle = (route.request().headers()['accept'] ?? '').includes('pgrst.object');
      const profile = { ...MOCK_PROFILE, role: 'sales', access_scope: 'self' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wantsSingle ? profile : [profile]),
      });
    });
    await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
    await expect(page.getByLabel('Display Name')).toBeVisible();
  });
});

test.describe("Customer portal", () => {
  test("Portal default route (/portal) shows landing page", async ({ page }) => {
    await page.goto("/portal", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/portal$/, { timeout: 8000 });
    await expect(page.locator("text=/new request|pending requests|welcome/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Pending Requests (/portal/tickets)", async ({ page }) => {
    await page.goto("/portal/tickets", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Route Error")).toHaveCount(0);
    await expect(page.locator("text=/pending requests/i").first()).toBeVisible({ timeout: 8000 });
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

  test("Review Queue (/auto-aging/review)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/review");
    await expect(page.locator("text=/review queue|review work/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Review Detail (/auto-aging/review/import-batch-1)", async ({ page }) => {
    await assertPageLoaded(page, "/auto-aging/review/import-batch-1");
    await expect(page.locator("text=/review batch|queued rows|no queued rows/i").first()).toBeVisible({ timeout: 8000 });
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
