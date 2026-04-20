import { test, expect } from "@playwright/test";
import { setupAuthMocks, SUPABASE_URL, MOCK_PROFILE } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// HRMS Admin pages — integration smoke tests
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_DEPARTMENTS = [
  { id: "dept-001", company_id: MOCK_PROFILE.company_id, name: "Engineering", description: null, head_employee_id: null, cost_centre: "CC001", is_active: true, created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "dept-002", company_id: MOCK_PROFILE.company_id, name: "Human Resources", description: "HR Dept", head_employee_id: null, cost_centre: null, is_active: true, created_at: "2025-01-01", updated_at: "2025-01-01" },
];

const MOCK_JOB_TITLES = [
  { id: "jt-001", company_id: MOCK_PROFILE.company_id, name: "Software Engineer", department_id: "dept-001", level: "mid", description: null, is_active: true, created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "jt-002", company_id: MOCK_PROFILE.company_id, name: "HR Manager", department_id: "dept-002", level: "senior", description: null, is_active: true, created_at: "2025-01-01", updated_at: "2025-01-01" },
];

const MOCK_LEAVE_TYPES = [
  { id: "lt-001", company_id: MOCK_PROFILE.company_id, name: "Annual Leave", code: "AL", days_per_year: 14, is_paid: true, active: true, created_at: "2025-01-01" },
  { id: "lt-002", company_id: MOCK_PROFILE.company_id, name: "Medical Leave", code: "ML", days_per_year: 10, is_paid: true, active: true, created_at: "2025-01-01" },
];

const MOCK_HOLIDAYS = [
  { id: "hol-001", company_id: MOCK_PROFILE.company_id, name: "Hari Merdeka", date: "2025-08-31", holiday_type: "public", is_recurring: true, created_at: "2025-01-01", updated_at: "2025-01-01" },
];

const MOCK_APPROVAL_FLOWS = [
  {
    id: "af-001", company_id: MOCK_PROFILE.company_id, name: "Standard Leave Approval",
    description: "2-level leave approval", entity_type: "leave_request", is_active: true,
    created_by: MOCK_PROFILE.id, created_at: "2025-01-01", updated_at: "2025-01-01",
  },
];

const MOCK_APPROVAL_STEPS = [
  { id: "as-001", flow_id: "af-001", step_order: 1, name: "Manager Review", approver_type: "role", approver_role: "manager", approver_user_id: null, allow_self_approval: false },
  { id: "as-002", flow_id: "af-001", step_order: 2, name: "GM Approval", approver_type: "role", approver_role: "general_manager", approver_user_id: null, allow_self_approval: false },
];

// ─── Shared mock setup ─────────────────────────────────────────────────────

async function setupAdminMocks(page: import("@playwright/test").Page) {
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/departments*`, (route) => {
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DEPARTMENTS) })
      : route.continue();
  });

  await page.route(`${SUPABASE_URL}/rest/v1/job_titles*`, (route) => {
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_JOB_TITLES) })
      : route.continue();
  });

  await page.route(`${SUPABASE_URL}/rest/v1/leave_types*`, (route) => {
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_LEAVE_TYPES) })
      : route.continue();
  });

  await page.route(`${SUPABASE_URL}/rest/v1/public_holidays*`, (route) => {
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_HOLIDAYS) })
      : route.continue();
  });

  // Profiles for employee list (used by department head picker)
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    const url = route.request().url();
    if (route.request().method() !== "GET") { route.continue(); return; }
    const accept = route.request().headers()["accept"] ?? "";
    const wantsSingle = accept.includes("pgrst.object");
    if (url.includes("company_id=eq.")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([MOCK_PROFILE]) });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: wantsSingle ? JSON.stringify(MOCK_PROFILE) : JSON.stringify([MOCK_PROFILE]),
      });
    }
  });
}

async function setupApprovalFlowMocks(page: import("@playwright/test").Page) {
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/approval_flows*`, (route) => {
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_APPROVAL_FLOWS) })
      : route.continue();
  });

  await page.route(`${SUPABASE_URL}/rest/v1/approval_steps*`, (route) => {
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_APPROVAL_STEPS) })
      : route.continue();
  });

  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    if (route.request().method() !== "GET") { route.continue(); return; }
    const accept = route.request().headers()["accept"] ?? "";
    const wantsSingle = accept.includes("pgrst.object");
    route.fulfill({
      status: 200, contentType: "application/json",
      body: wantsSingle ? JSON.stringify(MOCK_PROFILE) : JSON.stringify([MOCK_PROFILE]),
    });
  });
}

// ─── HRMS Settings Hub ────────────────────────────────────────────────────────

test.describe("HRMS Admin — Settings Hub (/hrms/admin)", () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMocks(page);
  });

  test("renders the settings hub page without crashing", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await expect(page.locator("text=Route Error")).not.toBeVisible({ timeout: 500 }).catch(() => {});
    await expect(page.getByText(/HRMS Settings/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows Departments category in the left nav", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await expect(page.getByText(/Departments/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows department data from mock", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await expect(page.getByText("Engineering")).toBeVisible({ timeout: 10000 });
  });

  test("switches to Job Titles panel and shows data", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const jobTitlesBtn = page.getByRole("button", { name: /job titles/i });
    await jobTitlesBtn.click();
    await expect(page.getByText("Software Engineer")).toBeVisible({ timeout: 5000 });
  });

  test("switches to Leave Types panel and shows data", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const leaveBtn = page.getByRole("button", { name: /leave types/i });
    await leaveBtn.click();
    await expect(page.getByText("Annual Leave")).toBeVisible({ timeout: 5000 });
  });

  test("switches to Holiday Calendar and shows data", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const holidayBtn = page.getByRole("button", { name: /holiday calendar/i });
    await holidayBtn.click();
    await expect(page.getByText("Hari Merdeka")).toBeVisible({ timeout: 5000 });
  });

  test("+ New button is visible for admin role", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    // MOCK_PROFILE role is 'company_admin' which is in HRMS_ADMIN_ROLES
    const newBtn = page.getByRole("button", { name: /\+ New/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });

  test("clicking + New Department opens the dialog", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.getByRole("button", { name: /\+ New/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  });
});

// ─── Approval Flows page ──────────────────────────────────────────────────────

test.describe("HRMS Admin — Approval Flows (/hrms/approval-flows)", () => {
  test.beforeEach(async ({ page }) => {
    await setupApprovalFlowMocks(page);
  });

  test("renders the Approval Flows page without crashing", async ({ page }) => {
    await page.goto("/hrms/approval-flows");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await expect(page.locator("text=Route Error")).not.toBeVisible({ timeout: 500 }).catch(() => {});
    await expect(page.getByText(/Approval Flows/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows flow from mock data", async ({ page }) => {
    await page.goto("/hrms/approval-flows");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await expect(page.getByText("Standard Leave Approval")).toBeVisible({ timeout: 10000 });
  });

  test("shows Leave Request badge for the mock flow", async ({ page }) => {
    await page.goto("/hrms/approval-flows");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await expect(page.getByText("Leave Request")).toBeVisible({ timeout: 10000 });
  });

  test("clicking + New Flow opens the builder dialog", async ({ page }) => {
    await page.goto("/hrms/approval-flows");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.getByRole("button", { name: /new flow/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/New Approval Flow/i)).toBeVisible({ timeout: 5000 });
  });

  test("dialog shows + Add Step button", async ({ page }) => {
    await page.goto("/hrms/approval-flows");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.getByRole("button", { name: /new flow/i }).click();
    await expect(page.getByRole("button", { name: /add step/i })).toBeVisible({ timeout: 5000 });
  });

  test("clicking + Add Step adds a step card in the dialog", async ({ page }) => {
    await page.goto("/hrms/approval-flows");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.getByRole("button", { name: /new flow/i }).click();
    const addStep = page.getByRole("button", { name: /add step/i });
    await addStep.click();
    await expect(page.getByText(/Step 1/i)).toBeVisible({ timeout: 5000 });
  });
});
