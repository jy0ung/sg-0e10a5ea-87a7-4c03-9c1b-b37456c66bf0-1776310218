import { expect, test } from "@playwright/test";
import { setupAuthMocks } from "./helpers/auth-mock";

async function expectNoDocumentHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("responsive shell", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
  });

  test("mobile navigation drawer opens, navigates, and closes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only drawer behavior");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const menuButton = page.getByLabel("Open navigation menu");
    await expect(menuButton).toBeVisible({ timeout: 8000 });

    await menuButton.click();
    await expect(page.getByRole("link", { name: /module directory/i })).toBeVisible({ timeout: 8000 });

    await page.getByRole("link", { name: /module directory/i }).click();
    await expect(page).toHaveURL(/\/modules$/);
    await expect(menuButton).toBeVisible({ timeout: 8000 });
  });

  test("tablet keeps desktop navigation visible", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet-chromium", "tablet-only navigation behavior");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Open navigation menu")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /module directory/i })).toBeVisible({ timeout: 8000 });
  });

  test("critical authenticated routes avoid document-level horizontal overflow", async ({ page }) => {
    for (const path of [
      "/",
      "/auto-aging/vehicles",
      "/sales/customers",
      "/sales/dealer-invoices",
      "/sales/verify-or",
      "/inventory/transfers",
      "/purchasing/invoices",
      "/hrms/employees",
      "/hrms/admin",
      "/reports",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("text=Route Error")).toHaveCount(0);
      await expectNoDocumentHorizontalOverflow(page);
    }
  });
});
