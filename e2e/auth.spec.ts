import { test, expect } from "@playwright/test";
import { SUPABASE_URL, setupSessionForUpdateUser } from "./helpers/auth-mock";

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

  test("shows admin-managed onboarding guidance", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.locator("text=/staff accounts are created by an administrator/i")
    ).toBeVisible();
    await expect(page.locator("#name")).toHaveCount(0);
    await expect(page.locator("text=/sign.?up|create.?account/i")).toHaveCount(0);
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

test.describe("Reset Password page", () => {
  test("shows invalid-link state without recovery callback params", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.locator("text=/invalid or expired reset link/i")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("#password")).toHaveCount(0);
  });

  test("shows the reset form for a valid recovery callback", async ({ page }) => {
    await page.goto("/reset-password#type=recovery&token_hash=fake-recovery-token");

    await expect(page.locator("text=/set your new password/i")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirm")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("shows success state after a successful password update", async ({ page }) => {
    await setupSessionForUpdateUser(page);

    // Override only the PUT (updateUser) to return success
    await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) => {
      if (route.request().method() === "PUT") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "fake-user-id", email: "staff@flc.test" }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/reset-password#type=recovery&token_hash=fake-recovery-token");
    await expect(page.locator("#password")).toBeVisible({ timeout: 5000 });

    await page.fill("#password", "NewPassword123!");
    await page.fill("#confirm", "NewPassword123!");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=/password updated successfully/i")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=/redirecting to sign in/i")).toBeVisible();
  });

  test("shows error message after a failed password update", async ({ page }) => {
    await setupSessionForUpdateUser(page);

    // Override only the PUT (updateUser) to return an auth error
    await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) => {
      if (route.request().method() === "PUT") {
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid_token", message: "Token expired or invalid" }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/reset-password#type=recovery&token_hash=fake-recovery-token");
    await expect(page.locator("#password")).toBeVisible({ timeout: 5000 });

    await page.fill("#password", "NewPassword123!");
    await page.fill("#confirm", "NewPassword123!");
    await page.click('button[type="submit"]');

    await expect(
      page.locator("text=/token expired or invalid|invalid_token|error/i").first()
    ).toBeVisible({ timeout: 5000 });
    // Form remains visible so the user can retry
    await expect(page.locator("#password")).toBeVisible();
  });
});

test.describe("Protected-route redirect", () => {
  test("/ redirects to /welcome when not authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/welcome/, { timeout: 8000 });
  });

  test("/auto-aging redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/auto-aging");
    await expect(page).toHaveURL(/login/, { timeout: 8000 });
  });
});

test.describe("404 / Not Found", () => {
  test("unknown route renders Not Found page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("text=/not found|404/i").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
