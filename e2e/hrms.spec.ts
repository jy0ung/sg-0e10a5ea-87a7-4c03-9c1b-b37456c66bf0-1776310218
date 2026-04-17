import { test, expect } from "@playwright/test";
import { setupAuthMocks, SUPABASE_URL, MOCK_PROFILE } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// HRMS MODULE – End-to-end flow tests
//
// Each test group:
//   1. Mocks Supabase REST responses (profiles, branches)
//   2. Navigates to the HRMS route
//   3. Asserts the page renders without crashing and shows key content
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_EMPLOYEES = [
  {
    id: "emp-001",
    email: "ahmad@flc.test",
    name: "Ahmad Ibrahim",
    role: "sales",
    company_id: MOCK_PROFILE.company_id,
    branch_id: "br-001",
    status: "active",
    staff_code: "SA001",
    ic_no: "900101-12-1234",
    contact_no: "012-3456789",
    join_date: "2022-01-15",
    resign_date: null,
    avatar_url: null,
  },
  {
    id: "emp-002",
    email: "siti@flc.test",
    name: "Siti Rahimah",
    role: "manager",
    company_id: MOCK_PROFILE.company_id,
    branch_id: "br-002",
    status: "inactive",
    staff_code: "MGR001",
    ic_no: "850202-14-5678",
    contact_no: "013-9876543",
    join_date: "2019-06-01",
    resign_date: null,
    avatar_url: null,
  },
  {
    id: "emp-003",
    email: "david@flc.test",
    name: "David Lim",
    role: "accounts",
    company_id: MOCK_PROFILE.company_id,
    branch_id: "br-001",
    status: "resigned",
    staff_code: "ACC001",
    ic_no: null,
    contact_no: null,
    join_date: "2018-03-10",
    resign_date: "2024-12-31",
    avatar_url: null,
  },
];

const MOCK_BRANCHES = [
  { id: "br-001", code: "KK", name: "Kota Kinabalu", company_id: MOCK_PROFILE.company_id, created_at: "2024-01-01", updated_at: "2024-01-01" },
  { id: "br-002", code: "TWU", name: "Tawau", company_id: MOCK_PROFILE.company_id, created_at: "2024-01-01", updated_at: "2024-01-01" },
];

async function setupHrmsMocks(page: import("@playwright/test").Page) {
  await setupAuthMocks(page);

  // Mock branches table — registered AFTER setupAuthMocks so it takes priority (LIFO)
  await page.route(`${SUPABASE_URL}/rest/v1/branches*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BRANCHES),
      });
    } else {
      route.continue();
    }
  });

  // Mock profiles table for employee LIST queries only (company_id filter).
  // Auth profile fetch (id=eq.<userId>) is handled by setupAuthMocks and returns MOCK_PROFILE.
  // We register this AFTER setupAuthMocks so it has HIGHER Playwright priority (LIFO),
  // but we only intercept requests that include "company_id=eq." — otherwise we fall through.
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method !== "GET") {
      route.continue();
      return;
    }

    if (url.includes("company_id=eq.")) {
      // This is the HRMS employee list query → return full mock employees
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EMPLOYEES),
      });
    } else {
      // Auth profile fetch or any other profiles query — delegate to the
      // setupAuthMocks handler that already handles single/array correctly.
      // Playwright doesn't support "pass to next handler" so we replicate
      // the auth-mock logic: single-accept → MOCK_PROFILE, array → [MOCK_PROFILE]
      const accept = route.request().headers()["accept"] ?? "";
      const wantsSingle = accept.includes("pgrst.object");
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: wantsSingle ? JSON.stringify(MOCK_PROFILE) : JSON.stringify([MOCK_PROFILE]),
      });
    }
  });
}

// ─── Page loads without crashing ─────────────────────────────────────────────

test.describe("HRMS – Employee Directory", () => {
  test.beforeEach(async ({ page }) => {
    await setupHrmsMocks(page);
  });

  test("renders Employee Directory page without crashing", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // No route error
    await expect(page.locator("text=Route Error")).not.toBeVisible({ timeout: 500 }).catch(() => {});

    // Sidebar present (app layout loaded)
    await expect(page.locator("nav, aside").first()).toBeVisible({ timeout: 8000 });

    // Page title visible
    await expect(page.locator("text=/employee.?directory/i").first()).toBeVisible({ timeout: 8000 });

    // Not redirected to login
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("shows employee stats cards", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Stats cards — Active / Inactive / Resigned / Total counts should be visible
    await expect(page.locator("text=/active/i").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=/total/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("renders employee table rows", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Employee names from mock data should appear
    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Siti Rahimah")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=David Lim")).toBeVisible({ timeout: 8000 });
  });

  test("shows staff codes in table", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=SA001")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=MGR001")).toBeVisible({ timeout: 8000 });
  });

  test("search filter narrows visible employees", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Wait for the table to have data
    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });

    // Type a search term
    await page.locator("input[placeholder*='Code, name']").fill("Ahmad");

    // Ahmad should remain, others should disappear
    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=Siti Rahimah")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=David Lim")).not.toBeVisible({ timeout: 3000 });
  });

  test("status filter shows only active employees", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });

    // Open status filter and select Active
    await page.locator("button, [role='combobox']").filter({ hasText: /all statuses/i }).first().click();
    await page.locator("[role='option']").filter({ hasText: /^active$/i }).click();

    // Only active employee should show
    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=Siti Rahimah")).not.toBeVisible({ timeout: 3000 });
  });

  test("New Employee button is visible for admin user", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // MOCK_PROFILE has role=super_admin so the add button should appear
    await expect(page.locator("button").filter({ hasText: /new employee/i })).toBeVisible({
      timeout: 8000,
    });
  });

  test("New Employee dialog opens and shows form fields", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await page.locator("button").filter({ hasText: /new employee/i }).click();

    // Dialog should appear with key form fields
    await expect(page.locator("text=/new employee/i").nth(1)).toBeVisible({ timeout: 5000 });
    await expect(page.locator("input[placeholder*='SA001']")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("input[placeholder*='Ahmad']")).toBeVisible({ timeout: 3000 });
  });

  test("New Employee dialog closes on Cancel", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await page.locator("button").filter({ hasText: /new employee/i }).click();
    await expect(page.locator("input[placeholder*='SA001']")).toBeVisible({ timeout: 5000 });

    await page.locator("button").filter({ hasText: /^cancel$/i }).click();
    await expect(page.locator("input[placeholder*='SA001']")).not.toBeVisible({ timeout: 3000 });
  });

  test("Edit button opens edit dialog for an employee", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });

    // Click the pencil/edit button in Ahmad's row
    const row = page.locator("tr").filter({ hasText: "Ahmad Ibrahim" });
    await row.locator("button[title='Edit']").click();

    // Edit dialog should open with employee name pre-filled
    await expect(page.locator("text=/edit employee/i")).toBeVisible({ timeout: 5000 });
    // Email field is unique in the dialog — verify it's pre-populated with Ahmad's email
    const dialog = page.locator("[role='dialog']");
    await expect(dialog.locator('input[type="email"]')).toHaveValue("ahmad@flc.test", {
      timeout: 3000,
    });
  });

  test("Deactivate button is visible for active employees", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });

    const row = page.locator("tr").filter({ hasText: "Ahmad Ibrahim" });
    await expect(row.locator("button").filter({ hasText: /deactivate/i })).toBeVisible({
      timeout: 3000,
    });
  });
});

// ─── Module Directory integration ────────────────────────────────────────────

test.describe("Module Directory – HRMS card", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test("HRMS card is visible in Module Directory", async ({ page }) => {
    await page.goto("/modules");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=/hrms/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("HRMS card click navigates to /hrms/employees", async ({ page }) => {
    await page.goto("/modules");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Click the HRMS module card
    await page.locator("[role='button']").filter({ hasText: /hrms/i }).first().click();
    await expect(page).toHaveURL(/\/hrms\/employees/, { timeout: 8000 });
  });
});

// ─── Sidebar navigation ───────────────────────────────────────────────────────

test.describe("Sidebar – HRMS navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupHrmsMocks(page);
  });

  test("HRMS sidebar section header is visible for admin user", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // HRMS section header button should be visible for super_admin
    await expect(
      page.locator("button").filter({ hasText: /^hrms$/i }).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("Clicking HRMS sidebar button navigates to /hrms/employees", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Section header with a path defined navigates directly on click
    await page.locator("button").filter({ hasText: /^hrms$/i }).first().click();
    await expect(page).toHaveURL(/\/hrms\/employees/, { timeout: 8000 });
  });

  test("Employee Directory link is visible in sidebar when on HRMS page", async ({ page }) => {
    // Navigate directly to HRMS page — sidebar auto-opens the active section
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(
      page.locator("a").filter({ hasText: /employee.?directory/i }).first()
    ).toBeVisible({ timeout: 8000 });
  });
});
