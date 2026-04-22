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
    manager_id: "emp-004",
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
    manager_id: null,
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
    manager_id: null,
    status: "resigned",
    staff_code: "ACC001",
    ic_no: null,
    contact_no: null,
    join_date: "2018-03-10",
    resign_date: "2024-12-31",
    avatar_url: null,
  },
  {
    id: "emp-004",
    email: "farid@flc.test",
    name: "Farid Noor",
    role: "general_manager",
    company_id: MOCK_PROFILE.company_id,
    branch_id: "br-001",
    manager_id: null,
    status: "active",
    staff_code: "GM001",
    ic_no: "800101-10-1111",
    contact_no: "014-2223344",
    join_date: "2017-02-20",
    resign_date: null,
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

  test("shows assigned manager and manager picker in employee dialogs", async ({ page }) => {
    await page.goto("/hrms/employees");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const row = page.locator("tr").filter({ hasText: "Ahmad Ibrahim" });
    await expect(row.locator("text=Farid Noor")).toBeVisible({ timeout: 8000 });

    await page.locator("button").filter({ hasText: /new employee/i }).click();
    const dialog = page.locator("[role='dialog']").last();
    await expect(dialog.locator("text=/reporting manager/i")).toBeVisible({ timeout: 5000 });

    await dialog.locator("button, [role='combobox']").filter({ hasText: /unassigned/i }).last().click();
    await expect(page.locator("[role='option']").filter({ hasText: /farid noor \(general manager\)/i })).toBeVisible({ timeout: 5000 });
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

// ─── Leave Management ─────────────────────────────────────────────────────────

const MOCK_LEAVE_TYPES = [
  { id: "lt-001", company_id: MOCK_PROFILE.company_id, name: "Annual Leave", default_days: 14, carry_forward: true, created_at: "2024-01-01", updated_at: "2024-01-01" },
  { id: "lt-002", company_id: MOCK_PROFILE.company_id, name: "Sick Leave", default_days: 7, carry_forward: false, created_at: "2024-01-01", updated_at: "2024-01-01" },
];

const MOCK_LEAVE_REQUESTS = [
  {
    id: "lr-001", company_id: MOCK_PROFILE.company_id, employee_id: "emp-001",
    leave_type_id: "lt-001", start_date: "2024-06-10", end_date: "2024-06-12",
    days: 3, reason: "Vacation", status: "approved",
    reviewed_by: null, reviewed_at: null, reviewer_note: null,
    created_at: "2024-06-01T00:00:00Z", updated_at: "2024-06-01T00:00:00Z",
    profiles: { name: "Ahmad Ibrahim" }, leave_types: { name: "Annual Leave" },
  },
  {
    id: "lr-002", company_id: MOCK_PROFILE.company_id, employee_id: "emp-002",
    leave_type_id: "lt-002", start_date: "2024-06-20", end_date: "2024-06-20",
    days: 1, reason: "Unwell", status: "pending",
    reviewed_by: null, reviewed_at: null, reviewer_note: null,
    created_at: "2024-06-15T00:00:00Z", updated_at: "2024-06-15T00:00:00Z",
    profiles: { name: "Siti Rahimah" }, leave_types: { name: "Sick Leave" },
  },
];

const MOCK_LEAVE_BALANCES = [
  { id: "lb-001", employee_id: MOCK_PROFILE.id, leave_type_id: "lt-001", year: 2024, entitled_days: 14, used_days: 3 },
];

async function setupLeaveMocks(page: import("@playwright/test").Page) {
  await setupHrmsMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/leave_types*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_LEAVE_TYPES) });
    } else { route.continue(); }
  });

  await page.route(`${SUPABASE_URL}/rest/v1/leave_requests*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_LEAVE_REQUESTS) });
    } else { route.continue(); }
  });

  await page.route(`${SUPABASE_URL}/rest/v1/leave_balances*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_LEAVE_BALANCES) });
    } else { route.continue(); }
  });
}

test.describe("HRMS – Leave Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
  });

  test("renders Leave Management page without crashing", async ({ page }) => {
    await page.goto("/hrms/leave");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=/leave.?management/i").first()).toBeVisible({ timeout: 8000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("displays leave requests from mock data", async ({ page }) => {
    await page.goto("/hrms/leave");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Siti Rahimah")).toBeVisible({ timeout: 8000 });
  });

  test("Apply for Leave button opens dialog", async ({ page }) => {
    await page.goto("/hrms/leave");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await page.locator("button").filter({ hasText: /apply.*leave|new.*leave/i }).first().click();
    await expect(page.locator("[role='dialog']")).toBeVisible({ timeout: 5000 });
  });

  test("pending requests are shown with Approve/Reject actions for managers", async ({ page }) => {
    await page.goto("/hrms/leave");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // MOCK_PROFILE is super_admin — should see action buttons for pending requests
    await expect(page.locator("text=Siti Rahimah")).toBeVisible({ timeout: 8000 });
    const pendingSection = page.locator("tr, [data-testid]").filter({ hasText: "Siti Rahimah" }).first();
    await expect(pendingSection.locator("button").filter({ hasText: /approve/i })).toBeVisible({ timeout: 3000 });
  });
});

// ─── Attendance Log ───────────────────────────────────────────────────────────

const MOCK_ATTENDANCE = [
  {
    id: "att-001", company_id: MOCK_PROFILE.company_id, employee_id: "emp-001",
    date: "2024-06-10", status: "present", clock_in: "09:00", clock_out: "18:00",
    hours_worked: 9, notes: null,
    created_at: "2024-06-10T09:00:00Z", updated_at: "2024-06-10T18:00:00Z",
    profiles: { name: "Ahmad Ibrahim" },
  },
  {
    id: "att-002", company_id: MOCK_PROFILE.company_id, employee_id: "emp-002",
    date: "2024-06-10", status: "absent", clock_in: null, clock_out: null,
    hours_worked: null, notes: "Medical",
    created_at: "2024-06-10T00:00:00Z", updated_at: "2024-06-10T00:00:00Z",
    profiles: { name: "Siti Rahimah" },
  },
];

async function setupAttendanceMocks(page: import("@playwright/test").Page) {
  await setupHrmsMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/attendance_records*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ATTENDANCE) });
    } else { route.continue(); }
  });
}

test.describe("HRMS – Attendance Log", () => {
  test.beforeEach(async ({ page }) => {
    await setupAttendanceMocks(page);
  });

  test("renders Attendance Log page without crashing", async ({ page }) => {
    await page.goto("/hrms/attendance");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=/attendance.?log/i").first()).toBeVisible({ timeout: 8000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("shows attendance records from mock data", async ({ page }) => {
    await page.goto("/hrms/attendance");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Siti Rahimah")).toBeVisible({ timeout: 8000 });
  });

  test("shows attendance status counts in summary", async ({ page }) => {
    await page.goto("/hrms/attendance");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=/present/i").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=/absent/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("Log Attendance button opens form for managers", async ({ page }) => {
    await page.goto("/hrms/attendance");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await page.locator("button").filter({ hasText: /log.?attendance|add.?attendance/i }).first().click();
    await expect(page.locator("[role='dialog']")).toBeVisible({ timeout: 5000 });
  });
});

// ─── Payroll Summary ──────────────────────────────────────────────────────────

const MOCK_PAYROLL_RUNS = [
  {
    id: "pr-001", company_id: MOCK_PROFILE.company_id,
    period_year: 2024, period_month: 6, status: "draft",
    total_headcount: 3, total_gross: 30000, total_net: 27000,
    created_by: MOCK_PROFILE.id,
    created_at: "2024-06-01T00:00:00Z", updated_at: "2024-06-01T00:00:00Z",
  },
];

async function setupPayrollMocks(page: import("@playwright/test").Page) {
  await setupHrmsMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/payroll_runs*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PAYROLL_RUNS) });
    } else { route.continue(); }
  });

  await page.route(`${SUPABASE_URL}/rest/v1/payroll_items*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else { route.continue(); }
  });
}

test.describe("HRMS – Payroll Summary", () => {
  test.beforeEach(async ({ page }) => {
    await setupPayrollMocks(page);
  });

  test("renders Payroll Summary page without crashing", async ({ page }) => {
    await page.goto("/hrms/payroll");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=/payroll.?summary/i").first()).toBeVisible({ timeout: 8000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("shows payroll run from mock data", async ({ page }) => {
    await page.goto("/hrms/payroll");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Run period should be visible (June 2024)
    await expect(page.locator("text=/jun|june/i").first()).toBeVisible({ timeout: 8000 });
    // Draft badge
    await expect(page.locator("text=/draft/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("New Payroll Run button is visible for admin users", async ({ page }) => {
    await page.goto("/hrms/payroll");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("button").filter({ hasText: /new payroll run/i })).toBeVisible({ timeout: 8000 });
  });
});

// ─── Performance Appraisals ───────────────────────────────────────────────────

const MOCK_APPRAISALS = [
  {
    id: "ap-001", company_id: MOCK_PROFILE.company_id, employee_id: "emp-001",
    reviewer_id: MOCK_PROFILE.id, cycle_id: null,
    period_label: "H1 2024", status: "draft",
    overall_score: null, comments: null,
    created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
    profiles: { name: "Ahmad Ibrahim" },
  },
];

async function setupAppraisalMocks(page: import("@playwright/test").Page) {
  await setupHrmsMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/appraisals*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_APPRAISALS) });
    } else { route.continue(); }
  });

  await page.route(`${SUPABASE_URL}/rest/v1/appraisal_items*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else { route.continue(); }
  });

  await page.route(`${SUPABASE_URL}/rest/v1/appraisal_cycles*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else { route.continue(); }
  });
}

test.describe("HRMS – Performance Appraisals", () => {
  test.beforeEach(async ({ page }) => {
    await setupAppraisalMocks(page);
  });

  test("renders Performance Appraisals page without crashing", async ({ page }) => {
    await page.goto("/hrms/appraisals");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=/appraisal/i").first()).toBeVisible({ timeout: 8000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("shows appraisal entry from mock data", async ({ page }) => {
    await page.goto("/hrms/appraisals");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=Ahmad Ibrahim")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=H1 2024")).toBeVisible({ timeout: 8000 });
  });
});

// ─── Announcements ────────────────────────────────────────────────────────────

const MOCK_ANNOUNCEMENTS = [
  {
    id: "ann-001", company_id: MOCK_PROFILE.company_id,
    author_id: MOCK_PROFILE.id,
    title: "System Maintenance Notice", body: "There will be scheduled downtime on Sunday.",
    category: "general", priority: "normal", pinned: false,
    published_at: "2024-06-01T08:00:00Z", expires_at: null,
    created_at: "2024-06-01T00:00:00Z", updated_at: "2024-06-01T00:00:00Z",
    profiles: { name: "Super Admin" },
  },
  {
    id: "ann-002", company_id: MOCK_PROFILE.company_id,
    author_id: MOCK_PROFILE.id,
    title: "Public Holiday Reminder", body: "Office closed on Hari Raya.",
    category: "hr", priority: "high", pinned: true,
    published_at: "2024-06-05T08:00:00Z", expires_at: null,
    created_at: "2024-06-05T00:00:00Z", updated_at: "2024-06-05T00:00:00Z",
    profiles: { name: "Super Admin" },
  },
];

async function setupAnnouncementMocks(page: import("@playwright/test").Page) {
  await setupHrmsMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/announcements*`, route => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ANNOUNCEMENTS) });
    } else { route.continue(); }
  });
}

test.describe("HRMS – Announcements", () => {
  test.beforeEach(async ({ page }) => {
    await setupAnnouncementMocks(page);
  });

  test("renders Announcements page without crashing", async ({ page }) => {
    await page.goto("/hrms/announcements");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=/announcement/i").first()).toBeVisible({ timeout: 8000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("shows announcement titles from mock data", async ({ page }) => {
    await page.goto("/hrms/announcements");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=System Maintenance Notice")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=Public Holiday Reminder")).toBeVisible({ timeout: 8000 });
  });

  test("pinned announcement is visually distinguished", async ({ page }) => {
    await page.goto("/hrms/announcements");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // "Public Holiday Reminder" is pinned — expect a pin indicator
    await expect(page.locator("text=Public Holiday Reminder")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("[data-pinned='true'], .pinned, [aria-label*='pinned']").first()
      .or(page.locator("text=/pinned/i").first())).toBeVisible({ timeout: 3000 });
  });

  test("category filter shows only HR announcements", async ({ page }) => {
    await page.goto("/hrms/announcements");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("text=System Maintenance Notice")).toBeVisible({ timeout: 8000 });

    // Click HR category filter
    await page.locator("button, [role='tab']").filter({ hasText: /^hr$/i }).first().click();

    await expect(page.locator("text=Public Holiday Reminder")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=System Maintenance Notice")).not.toBeVisible({ timeout: 3000 });
  });

  test("Post Announcement button is visible for admin users", async ({ page }) => {
    await page.goto("/hrms/announcements");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("button").filter({ hasText: /post.?announcement|new.?announcement/i })).toBeVisible({ timeout: 8000 });
  });

  test("Post Announcement dialog opens and shows form fields", async ({ page }) => {
    await page.goto("/hrms/announcements");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await page.locator("button").filter({ hasText: /post.?announcement|new.?announcement/i }).first().click();
    await expect(page.locator("[role='dialog']")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("input[placeholder*='Title']").or(page.locator("label").filter({ hasText: /title/i }))).toBeVisible({ timeout: 3000 });
  });
});
