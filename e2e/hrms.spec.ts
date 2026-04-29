import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "./helpers/auth-mock";

test.describe("Phase 3.1 HRMS workspace launcher", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test("HRMS card opens the dedicated workspace path", async ({ page }) => {
    await page.goto("/modules", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: /hrms/i })).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /hrms/i }).click();

    await expect(page).toHaveURL(/\/hrms\/?$/, { timeout: 8000 });
  });

  test("HRMS sidebar section opens the dedicated workspace path", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("link", { name: /^hrms$/i })).toBeVisible({ timeout: 8000 });
    await page.getByRole("link", { name: /^hrms$/i }).click();

    await expect(page).toHaveURL(/\/hrms\/?$/, { timeout: 8000 });
  });

  test("old HRMS deep links hand off to the dedicated workspace", async ({ page }) => {
    await page.goto("/hrms/leave", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/hrms\/leave$/, { timeout: 8000 });
    await expect(page.getByText("Opening HRMS Workspace")).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("link", { name: "Open HRMS", exact: true })).toHaveAttribute("href", "/hrms/leave");
  });

  test("legacy HRMS route aliases map to dedicated route names", async ({ page }) => {
    await page.goto("/hrms/leave-calendar?view=team#month", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/hrms\/leave\/calendar\?view=team#month$/, { timeout: 8000 });
    await expect(page.getByRole("link", { name: "Open HRMS", exact: true })).toHaveAttribute("href", "/hrms/leave/calendar?view=team#month");
  });
});