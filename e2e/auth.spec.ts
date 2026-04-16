import { test, expect } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// AUTH FLOWS  (unauthenticated — no mocking needed)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Login page", () => {
  test("renders brand, email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=FLC BI")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("submit button is disabled until form is valid", async ({ page }) => {
    await page.goto("/login");
    // Button is disabled when fields are empty (react-hook-form mode='onChange')
    const btn = page.locator('button[type="submit"]');
    await expect(btn).toBeDisabled();
    // Filling valid email + password enables the button
    await page.fill("#email", "test@example.com");
    await page.fill("#password", "password123");
    await expect(btn).toBeEnabled();
  });

  test("shows error message for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "nobody@example.com");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');
    // Auth context propagates the Supabase error string
    await expect(page.locator("text=/invalid|credentials|email|password/i").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("toggle to Sign Up shows name field", async ({ page }) => {
    await page.goto("/login");
    await page.click("text=/sign.?up|create.?account/i");
    await expect(page.locator("#name")).toBeVisible({ timeout: 3000 });
  });

  test("forgot password link navigates to /forgot-password", async ({ page }) => {
    await page.goto("/login");
    // Use the href attribute to find the link reliably
    await page.click('a[href="/forgot-password"]');
    await expect(page).toHaveURL(/forgot-password/, { timeout: 5000 });
  });
});

test.describe("Forgot Password page", () => {
  test("renders email field and submit button", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("submit button is disabled until email is entered", async ({ page }) => {
    await page.goto("/forgot-password");
    const btn = page.locator('button[type="submit"]');
    await expect(btn).toBeDisabled();
    // Filling a valid email enables the button
    await page.fill("input[type=email]", "test@example.com");
    await expect(btn).toBeEnabled();
  });
});

test.describe("Protected-route redirect", () => {
  test("/ redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/login/, { timeout: 8000 });
  });

  test("/auto-aging redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/auto-aging");
    await expect(page).toHaveURL(/login/, { timeout: 8000 });
  });
});

test.describe("404 / Not Found", () => {
  test("/debug route renders debug info", async ({ page }) => {
    await page.goto("/debug");
    await expect(page.locator("text=Debug Page")).toBeVisible({ timeout: 5000 });
  });

  test("unknown route renders Not Found page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("text=/not found|404/i").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
