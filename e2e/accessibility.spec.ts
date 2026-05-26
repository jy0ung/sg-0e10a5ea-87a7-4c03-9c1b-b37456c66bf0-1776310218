import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from "./helpers/auth-mock";

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Mocks the three Phase 4 feature flags as enabled plus the minimal data
 * required for /inbox, /home, and /admin/kpi-studio to render their real
 * content (not the feature-off banner). This lets axe scan the actual
 * surface a signed-in user would see when the flags are on.
 */
async function setupPhase4SurfaceMocks(page: Page) {
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, [
        {
          id: "flag-4a", company_id: null, code: "phase4.unified-inbox",
          enabled: true, rollout_pct: 100, description: null,
          created_at: "2026-05-26T00:00:00Z", updated_at: "2026-05-26T00:00:00Z",
        },
        {
          id: "flag-4b", company_id: null, code: "phase4.role-home",
          enabled: true, rollout_pct: 100, description: null,
          created_at: "2026-05-26T00:00:00Z", updated_at: "2026-05-26T00:00:00Z",
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_role_home_kpis`, async route => {
    await fulfillJson(route, [
      {
        code: "sales.weekly_revenue",
        label: "Sales (last 7 days)",
        description: "Sum of sales order amounts created in the last 7 days.",
        formula: { source: "sales_orders", aggregation: "sum" },
        landing_route: "/sales",
        position: 1,
      },
      {
        code: "vehicles.total_stock",
        label: "Vehicles in stock",
        description: "Count of vehicles currently in stock.",
        formula: { source: "vehicles", aggregation: "count" },
        landing_route: "/auto-aging/vehicles",
        position: 2,
      },
    ]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/kpi_definitions*`, async route => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, [
        {
          id: "d1", company_id: null, code: "sales.weekly_revenue",
          label: "Sales (last 7 days)", description: "Weekly revenue.",
          formula: { source: "sales_orders" }, landing_route: "/sales",
          version: 1, is_active: true,
          created_at: "2026-05-26T00:00:00Z", updated_at: "2026-05-26T00:00:00Z",
        },
        {
          id: "d2", company_id: null, code: "vehicles.total_stock",
          label: "Vehicles in stock", description: "Stock count.",
          formula: { source: "vehicles" }, landing_route: "/auto-aging/vehicles",
          version: 1, is_active: true,
          created_at: "2026-05-26T00:00:00Z", updated_at: "2026-05-26T00:00:00Z",
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  // Inbox sources — empty payloads are fine, the page renders its empty states.
  await page.route(`${SUPABASE_URL}/rest/v1/notifications*`, async route => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, [
        {
          id: "notif-a11y-1", user_id: MOCK_PROFILE.id,
          title: "Inbox is accessible",
          message: "Approvals, tickets, and notifications in one place.",
          type: "info", read: false, created_at: "2026-05-26T08:00:00Z",
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });
  await page.route(`${SUPABASE_URL}/rest/v1/tickets*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/leave_requests*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/payroll_runs*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/appraisals*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
    await fulfillJson(route, []);
  });
  // Catch-all RPC stub for unrelated calls (e.g. reconciliation pending list).
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/*`, async route => {
    await fulfillJson(route, []);
  });
}

async function waitForCssAnimations(page: import("@playwright/test").Page) {
  await page
    .waitForFunction(
      () => document.getAnimations().every((animation) => animation.playState === "finished"),
      undefined,
      { timeout: 1_000 },
    )
    .catch(() => page.waitForTimeout(500));
}

async function expectNoSeriousA11yViolations(page: import("@playwright/test").Page) {
  await waitForCssAnimations(page);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const seriousViolations = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
    }));

  expect(seriousViolations).toEqual([]);
}

test.describe("accessibility smoke", () => {
  test.describe.configure({ timeout: 120_000 });

  test("public routes have no serious axe violations", async ({ page }) => {
    for (const path of ["/welcome", "/login"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectNoSeriousA11yViolations(page);
    }
  });

  test("critical authenticated routes have no serious axe violations", async ({ page }) => {
    await setupAuthMocks(page);

    for (const path of [
      "/",
      "/modules",
      "/notifications",
      "/auto-aging/vehicles",
      "/sales/customers",
      "/inventory/transfers",
      "/purchasing/invoices",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("text=Route Error")).toHaveCount(0);
      await expectNoSeriousA11yViolations(page);
    }
  });

  test("Phase 4 surfaces (inbox, home, KPI studio) have no serious axe violations", async ({ page }) => {
    await setupPhase4SurfaceMocks(page);

    for (const path of ["/inbox", "/home", "/admin/kpi-studio"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("text=Route Error")).toHaveCount(0);
      await expectNoSeriousA11yViolations(page);
    }
  });
});
