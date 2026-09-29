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
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'People & Administration' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Administration/ })).toHaveCount(0);
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

test.describe('Purchasing payment correction', () => {
  test('paid invoice offers a reasoned supplier reversal', async ({ page }) => {
    const invoiceId = '00000000-0000-0000-0000-000000000100';
    const eventId = '00000000-0000-0000-0000-000000000200';
    let submittedReason: string | null = null;
    await page.route(`${SUPABASE_URL}/rest/v1/purchase_invoices*`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: invoiceId, company_id: MOCK_PROFILE.company_id,
        invoice_no: 'PI-100', supplier: 'Test Supplier', chassis_no: 'CHASSIS-100',
        model: 'Test Model', invoice_date: '2026-09-01', amount: 1000,
        status: 'received', lifecycle_status: 'paid', payment_status: 'paid', paid_amount: 1000,
      }),
    }));
    await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_supplier_payment_events*`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: eventId, event_type: 'payment', amount: 1000, payment_date: '2026-09-01',
        is_reversed: false, created_at: '2026-09-01T00:00:00Z',
      }]),
    }));
    await page.route(`${SUPABASE_URL}/rest/v1/rpc/reverse_supplier_payment_event*`, route => {
      submittedReason = (route.request().postDataJSON() as { p_reason: string }).p_reason;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('00000000-0000-0000-0000-000000000300') });
    });

    await assertPageLoaded(page, `/purchasing/invoices/${invoiceId}`);
    await expect(page.getByRole('heading', { name: 'PI-100' })).toBeVisible();
    await page.getByRole('button', { name: 'Reverse' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reverse Supplier Payment' });
    await expect(dialog.getByRole('button', { name: 'Confirm reversal' })).toBeDisabled();
    await dialog.getByLabel('Reason *').fill('Incorrect bank instruction');
    await dialog.getByRole('button', { name: 'Confirm reversal' }).click();
    await expect(dialog).not.toBeVisible();
    expect(submittedReason).toBe('Incorrect bank instruction');
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

  test("Roles & Permissions has a dedicated route and guards a dirty draft", async ({ page }) => {
    await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_role_section_matrix*`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 1, matrix: {} }),
    }));
    await assertPageLoaded(page, '/admin/users');
    await page.getByRole('tab', { name: 'Role management' }).click();
    await expect(page).toHaveURL(/\/admin\/roles$/);
    await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible();
    const grant = page.getByRole('button', { name: /^Manager - Sales: (allowed|denied)$/ });
    await expect(grant).toBeEnabled();
    await grant.click();
    await page.getByRole('navigation', { name: 'breadcrumb' }).getByRole('link', { name: 'Admin' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Unsaved role changes');
    await page.getByRole('button', { name: 'Stay and save' }).click();
    await expect(page).toHaveURL(/\/admin\/roles$/);
  });

  test("Organization branding saves through its own route and guards an unsaved draft", async ({ page }) => {
    let companyName = 'FLC Test Company';
    let savedCompanyId: string | null = null;
    let savedAssetPath: string | null = null;
    await page.route(`${SUPABASE_URL}/storage/v1/object/company-assets/**`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'company-assets/test-logo' }),
    }));
    await page.route(`${SUPABASE_URL}/rest/v1/company_branding*`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'branding-1',
            company_id: MOCK_PROFILE.company_id,
            company_name: companyName,
            app_name: 'FLC UBS',
            app_short_name: 'FLC',
          }),
        });
        return;
      }
      const submitted = route.request().postDataJSON() as { company_id: string; company_name?: string; logo_path?: string };
      savedCompanyId = submitted.company_id;
      if (submitted.company_name !== undefined) companyName = submitted.company_name;
      if (submitted.logo_path !== undefined) savedAssetPath = submitted.logo_path;
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    });

    await assertPageLoaded(page, '/admin/organization');
    await expect(page.getByRole('heading', { level: 1, name: 'Organization & Branding' })).toBeVisible();
    const name = page.getByLabel('Company Name');
    await expect(name).toHaveValue('FLC Test Company');
    await name.fill('Updated FLC Company');
    await page.getByRole('navigation', { name: 'breadcrumb' }).getByRole('link', { name: 'Admin' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Unsaved organization changes');
    await page.getByRole('button', { name: 'Stay and save' }).click();
    await expect(name).toHaveValue('Updated FLC Company');

    await page.getByLabel('Upload app logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('test-image') });
    await expect(page.getByText('Brand asset uploaded')).toBeVisible();
    expect(savedAssetPath).toMatch(new RegExp(`^${MOCK_PROFILE.company_id}/logo/[a-f0-9-]+\\.png$`));
    await expect(name).toHaveValue('Updated FLC Company');

    await page.getByRole('button', { name: 'Save Branding' }).click();
    await expect(page.getByRole('button', { name: 'Save Branding' })).toBeDisabled();
    expect(savedCompanyId).toBe(MOCK_PROFILE.company_id);
    await page.getByRole('navigation', { name: 'breadcrumb' }).getByRole('link', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("Audit Log (/admin/audit)", async ({ page }) => {
    await assertPageLoaded(page, "/admin/audit");
    await expect(page.locator("text=/audit|log/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Legacy Settings redirects to My Profile", async ({ page }) => {
    await assertPageLoaded(page, "/admin/settings");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
  });
});
