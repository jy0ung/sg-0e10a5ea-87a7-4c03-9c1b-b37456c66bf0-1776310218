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
  test("mobile navigation drawer opens, navigates, and closes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only drawer behavior");
    await setupAuthMocks(page);

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
    await setupAuthMocks(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Open navigation menu")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /module directory/i })).toBeVisible({ timeout: 8000 });
  });

  test("critical authenticated routes avoid document-level horizontal overflow", async ({ page }) => {
    test.setTimeout(90_000);
    await setupAuthMocks(page);

    for (const path of [
      "/",
      "/auto-aging/vehicles",
      "/sales/customers",
      "/sales/dealer-invoices",
      "/sales/verify-or",
      "/inventory/transfers",
      "/purchasing/invoices",
      "/hrms/",
      "/reports",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("text=Route Error")).toHaveCount(0);
      await expectNoDocumentHorizontalOverflow(page);
    }
  });

  test("theme toggle switches dark and light mode", async ({ page }) => {
    test.setTimeout(60_000);
    await setupAuthMocks(page);

    await page.addInitScript(() => {
      window.localStorage.setItem("flc-ui-theme", "light");
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /switch to dark mode/i }).press("Enter");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("flc-ui-theme"))).toBe("dark");

    await page.getByRole("button", { name: /switch to light mode/i }).press("Enter");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("flc-ui-theme"))).toBe("light");
  });

  test("system theme default follows browser color scheme", async ({ page }) => {
    await setupAuthMocks(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      window.localStorage.removeItem("flc-ui-theme");
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
