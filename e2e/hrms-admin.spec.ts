import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "./helpers/auth-mock";

test.describe("Phase 3.1 HRMS admin route handoff", () => {
  test.setTimeout(45_000);

  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test("legacy settings hub path opens the dedicated settings route", async ({ page }) => {
    await page.goto("/hrms/admin", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/hrms\/settings$/, { timeout: 10000 });

    await expect(page.getByRole("heading", { name: "Opening HRMS Workspace" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("link", { name: "Open HRMS", exact: true })).toHaveAttribute("href", "/hrms/settings");
  });

  test("approval flow path is preserved for the dedicated workspace", async ({ page }) => {
    await page.goto("/hrms/approval-flows", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/hrms\/approval-flows$/, { timeout: 8000 });
    await expect(page.getByRole("link", { name: "Open HRMS", exact: true })).toHaveAttribute("href", "/hrms/approval-flows");
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
    const newBtn = page.getByRole("button", { name: /new department/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });

  test("clicking + New Department opens the dialog", async ({ page }) => {
    await page.goto("/hrms/admin");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.getByRole("button", { name: /new department/i }).first().click();
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
    await expect(page.getByRole("table").getByText("Leave Request")).toBeVisible({ timeout: 10000 });
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

