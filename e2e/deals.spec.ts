import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// DEAL LIFECYCLE E2E TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Deal Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test("deals page loads and shows empty state", async ({ page }) => {
    await page.goto("/sales/deals");
    await expect(page.getByRole("heading", { name: "Deals" })).toBeVisible();
    await expect(page.getByText("0 deals")).toBeVisible();
  });

  test("new deal form renders all sections", async ({ page }) => {
    await page.goto("/sales/deals/new");
    await expect(page.getByRole("heading", { name: "New Deal" })).toBeVisible();
    await expect(page.getByText("Customer Information")).toBeVisible();
    await expect(page.getByText("Vehicle Interest")).toBeVisible();
    await expect(page.getByText("Pricing")).toBeVisible();
    await expect(page.getByText("Source & Notes")).toBeVisible();
  });

  test("new deal form has submit button", async ({ page }) => {
    await page.goto("/sales/deals/new");
    await expect(page.getByRole("button", { name: /create deal/i })).toBeVisible();
  });

  test("pipeline page loads with stages", async ({ page }) => {
    await page.goto("/sales/pipeline");
    await expect(page.getByRole("heading", { name: "Deal Pipeline" })).toBeVisible();
    // Should show stage columns
    await expect(page.getByText("Lead").first()).toBeVisible();
    await expect(page.getByText("Booking").first()).toBeVisible();
    await expect(page.getByText("Delivery").first()).toBeVisible();
  });

  test("pipeline has search and filter controls", async ({ page }) => {
    await page.goto("/sales/pipeline");
    await expect(page.getByPlaceholder("Search deals...")).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /new deal/i })).toBeVisible();
  });

  test("sales overview page loads", async ({ page }) => {
    await page.goto("/sales");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15000 });
  });

  test("outstanding collection page loads", async ({ page }) => {
    await page.goto("/sales/outstanding-new");
    await expect(page.getByRole("heading", { name: "Outstanding Collection" })).toBeVisible();
    await expect(page.getByText("Pending Disbursement")).toBeVisible();
    await expect(page.getByText("Total Outstanding")).toBeVisible();
  });
});

test.describe("Deal Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test("new deal button navigates to form", async ({ page }) => {
    await page.goto("/sales/deals");
    await page.getByRole("button", { name: /new deal/i }).click();
    await expect(page).toHaveURL(/\/sales\/deals\/new/);
    await expect(page.getByRole("heading", { name: "New Deal" })).toBeVisible();
  });

  test("pipeline new deal button navigates to form", async ({ page }) => {
    await page.goto("/sales/pipeline");
    await page.getByRole("button", { name: /new deal/i }).click();
    await expect(page).toHaveURL(/\/sales\/deals\/new/);
  });
});
