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
});