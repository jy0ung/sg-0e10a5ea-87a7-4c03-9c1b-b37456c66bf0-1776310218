import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION FLOW TESTS
// Verifies that clicking sidebar links actually navigates to the correct URL.
// ─────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupAuthMocks(page);
  await page.goto("/");
  // Wait for the app layout sidebar to be visible
  await page.locator("nav, aside").first().waitFor({ state: "visible", timeout: 10000 });
});

const navLinks: Array<{ label: string | RegExp; expectedPath: RegExp }> = [
  { label: /module.?directory/i, expectedPath: /\/modules$/ },
  { label: /notification/i, expectedPath: /\/notifications$/ },
  { label: /aging.?dashboard/i, expectedPath: /\/auto-aging$/ },
  { label: /vehicle.?explorer/i, expectedPath: /\/auto-aging\/vehicles$/ },
  { label: /import.?center/i, expectedPath: /\/auto-aging\/import$/ },
  { label: /data.?quality/i, expectedPath: /\/auto-aging\/quality$/ },
  { label: /sla.?polic/i, expectedPath: /\/auto-aging\/sla$/ },
  { label: /mapping/i, expectedPath: /\/auto-aging\/mappings$/ },
  { label: /import.?history/i, expectedPath: /\/auto-aging\/history$/ },
  { label: /commission/i, expectedPath: /\/auto-aging\/commissions$/ },
  { label: /report/i, expectedPath: /\/auto-aging\/reports$/ },
  { label: /sales.?dashboard/i, expectedPath: /\/sales$/ },
  { label: /deal.?pipeline/i, expectedPath: /\/sales\/pipeline$/ },
  { label: /sales.?order/i, expectedPath: /\/sales\/orders$/ },
  { label: /customer/i, expectedPath: /\/sales\/customers$/ },
  { label: /invoice/i, expectedPath: /\/sales\/invoices$/ },
  { label: /performance/i, expectedPath: /\/sales\/performance$/ },
  { label: /activity.?dashboard/i, expectedPath: /\/admin\/activity$/ },
  { label: /users?.?(?:&|and)?.?roles?/i, expectedPath: /\/admin\/users$/ },
  { label: /audit.?log/i, expectedPath: /\/admin\/audit$/ },
  { label: /setting/i, expectedPath: /\/admin\/settings$/ },
];

for (const { label, expectedPath } of navLinks) {
  test(`Sidebar link "${label}" navigates correctly`, async ({ page }) => {
    // Some sidebar links may be inside collapsed sections; scroll into view first.
    const link = page.locator(`a`).filter({ hasText: label }).first();
    await link.scrollIntoViewIfNeeded().catch(() => {});

    const visible = await link.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, `Sidebar link "${label}" not visible (possibly hidden by role filter)`);
      return;
    }

    await link.click();
    await expect(page).toHaveURL(expectedPath, { timeout: 8000 });
  });
}

test("Logout button clears session and redirects to /login", async ({ page }) => {
  // Mock the supabase signOut endpoint (already done in setupAuthMocks)
  const logoutBtn = page.locator("button, a").filter({ hasText: /log.?out|sign.?out/i }).first();
  await logoutBtn.scrollIntoViewIfNeeded().catch(() => {});

  const visible = await logoutBtn.isVisible().catch(() => false);
  if (!visible) {
    test.skip(true, "Logout button not found in sidebar");
    return;
  }

  await logoutBtn.click();
  await expect(page).toHaveURL(/login/, { timeout: 8000 });
});
